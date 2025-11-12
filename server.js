const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { existsSync, statSync } = require('fs');
const sharp = require('sharp');
const { Client: FtpClient } = require('basic-ftp');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// FTP connection cache
const ftpConnections = new Map();

// Thumbnail cache directory
const THUMBNAIL_CACHE_DIR = path.join(__dirname, '.thumbnail-cache');

// Ensure thumbnail cache directory exists
async function ensureThumbnailCacheDir() {
  try {
    await fs.mkdir(THUMBNAIL_CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating thumbnail cache directory:', error);
  }
}

// Generate unique cache filename from file path
function getCacheFilename(filePath, modifiedTime) {
  const hash = crypto.createHash('md5').update(filePath).digest('hex');
  const timestamp = new Date(modifiedTime).getTime();
  return `${hash}_${timestamp}.jpg`;
}

// Check if cached thumbnail exists and is valid
async function getCachedThumbnail(filePath, modifiedTime) {
  const cacheFilename = getCacheFilename(filePath, modifiedTime);
  const cachePath = path.join(THUMBNAIL_CACHE_DIR, cacheFilename);

  if (existsSync(cachePath)) {
    try {
      return await fs.readFile(cachePath);
    } catch (error) {
      console.error('Error reading cached thumbnail:', error);
      return null;
    }
  }

  return null;
}

// Save thumbnail to cache
async function saveThumbnailToCache(filePath, modifiedTime, thumbnailBuffer) {
  const cacheFilename = getCacheFilename(filePath, modifiedTime);
  const cachePath = path.join(THUMBNAIL_CACHE_DIR, cacheFilename);

  try {
    // Clean up old thumbnails for this file (different timestamps)
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    const files = await fs.readdir(THUMBNAIL_CACHE_DIR);
    for (const file of files) {
      if (file.startsWith(hash + '_') && file !== cacheFilename) {
        await fs.unlink(path.join(THUMBNAIL_CACHE_DIR, file));
      }
    }

    // Save new thumbnail
    await fs.writeFile(cachePath, thumbnailBuffer);
  } catch (error) {
    console.error('Error saving thumbnail to cache:', error);
  }
}

ensureThumbnailCacheDir();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Supported media extensions
const MEDIA_EXTENSIONS = {
  video: ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
};

// Helper function to get or create FTP connection
async function getFtpConnection(ftpConfig) {
  const key = `${ftpConfig.host}:${ftpConfig.port}:${ftpConfig.user}`;

  let connection = ftpConnections.get(key);
  if (connection && !connection.closed) {
    return connection;
  }

  const client = new FtpClient();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftpConfig.host,
      port: ftpConfig.port || 21,
      user: ftpConfig.user || 'anonymous',
      password: ftpConfig.password || '',
      secure: ftpConfig.secure || false
    });

    ftpConnections.set(key, client);
    return client;
  } catch (error) {
    console.error('FTP connection error:', error);
    throw error;
  }
}

// Parse FTP path format: ftp://user:pass@host:port/path
function parseFtpPath(ftpPath) {
  try {
    const url = new URL(ftpPath);
    return {
      host: url.hostname,
      port: url.port ? parseInt(url.port) : 21,
      user: url.username || 'anonymous',
      password: url.password || '',
      path: url.pathname || '/',
      secure: url.protocol === 'ftps:'
    };
  } catch (error) {
    return null;
  }
}

// Check if path is FTP
function isFtpPath(path) {
  return path && (path.startsWith('ftp://') || path.startsWith('ftps://'));
}

// Check if file is a media file
function isMediaFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return Object.values(MEDIA_EXTENSIONS).flat().includes(ext);
}

// Get media type
function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  for (const [type, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return type;
    }
  }
  return 'unknown';
}

// Recursively get all media files in directory
async function getMediaFilesRecursive(dirPath, baseDir = dirPath) {
  const files = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subFiles = await getMediaFilesRecursive(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        const stats = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: fullPath,
          relativePath: path.relative(baseDir, fullPath),
          size: stats.size,
          modified: stats.mtime,
          type: getMediaType(entry.name),
          source: 'local'
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return files;
}

// Recursively get all media files from FTP directory
async function getMediaFilesFromFtp(ftpConfig, basePath = '/') {
  const files = [];

  try {
    const client = await getFtpConnection(ftpConfig);

    async function scanDirectory(dirPath) {
      try {
        const list = await client.list(dirPath);

        for (const item of list) {
          const itemPath = path.posix.join(dirPath, item.name);

          if (item.isDirectory) {
            // Recursively scan subdirectories
            await scanDirectory(itemPath);
          } else if (item.isFile && isMediaFile(item.name)) {
            files.push({
              name: item.name,
              path: `ftp://${ftpConfig.user}@${ftpConfig.host}:${ftpConfig.port}${itemPath}`,
              relativePath: path.posix.relative(basePath, itemPath),
              size: item.size,
              modified: item.modifiedAt || new Date(),
              type: getMediaType(item.name),
              source: 'ftp',
              ftpConfig: ftpConfig
            });
          }
        }
      } catch (error) {
        console.error(`Error reading FTP directory ${dirPath}:`, error.message);
      }
    }

    await scanDirectory(ftpConfig.path);
  } catch (error) {
    console.error('FTP scan error:', error);
    throw error;
  }

  return files;
}

// API endpoint to list media files in a directory
app.post('/api/scan-directory', async (req, res) => {
  const { directory } = req.body;

  if (!directory) {
    return res.status(400).json({ error: 'Directory path is required' });
  }

  try {
    let mediaFiles;

    // Check if it's an FTP path
    if (isFtpPath(directory)) {
      const ftpConfig = parseFtpPath(directory);
      if (!ftpConfig) {
        return res.status(400).json({ error: 'Invalid FTP path format. Use: ftp://user:pass@host:port/path' });
      }
      mediaFiles = await getMediaFilesFromFtp(ftpConfig);
    } else {
      // Local filesystem
      if (!existsSync(directory)) {
        return res.status(404).json({ error: 'Directory not found' });
      }

      const stats = statSync(directory);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }

      mediaFiles = await getMediaFilesRecursive(directory);
    }

    res.json({
      directory,
      count: mediaFiles.length,
      files: mediaFiles
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve media files
app.get('/api/media/*', async (req, res) => {
  const filePath = decodeURIComponent(req.params[0]);

  try {
    // Check if it's an FTP path
    if (isFtpPath(filePath)) {
      const ftpConfig = parseFtpPath(filePath);
      if (!ftpConfig) {
        return res.status(400).json({ error: 'Invalid FTP path' });
      }

      const client = await getFtpConnection(ftpConfig);
      const tempStream = require('stream').PassThrough();

      // Download file from FTP
      await client.downloadTo(tempStream, ftpConfig.path);

      res.set('Content-Type', getContentType(filePath));
      tempStream.pipe(res);
    } else {
      // Local file
      if (!existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const stat = statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        // Handle range requests for video seeking
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = require('fs').createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': getContentType(filePath),
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        // Send entire file
        const head = {
          'Content-Length': fileSize,
          'Content-Type': getContentType(filePath),
        };
        res.writeHead(200, head);
        require('fs').createReadStream(filePath).pipe(res);
      }
    }
  } catch (error) {
    console.error('Error serving media:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve image thumbnails
app.get('/api/thumbnail/image/*', async (req, res) => {
  const filePath = decodeURIComponent(req.params[0]);

  try {
    const ext = path.extname(filePath).toLowerCase();

    // Get file modified time for cache validation
    let modifiedTime;
    if (isFtpPath(filePath)) {
      // For FTP, we'll use current time or fetch from metadata
      modifiedTime = new Date();
    } else {
      if (!existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      const stats = statSync(filePath);
      modifiedTime = stats.mtime;
    }

    // Check cache first (except for SVG and GIF)
    if (ext !== '.svg' && ext !== '.gif') {
      const cachedThumbnail = await getCachedThumbnail(filePath, modifiedTime);
      if (cachedThumbnail) {
        res.set('Content-Type', 'image/jpeg');
        return res.send(cachedThumbnail);
      }
    }

    // Get image buffer from FTP or local file
    let imageBuffer;
    if (isFtpPath(filePath)) {
      const ftpConfig = parseFtpPath(filePath);
      if (!ftpConfig) {
        return res.status(400).json({ error: 'Invalid FTP path' });
      }

      const client = await getFtpConnection(ftpConfig);
      const chunks = [];
      const writableStream = require('stream').Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        }
      });

      await client.downloadTo(writableStream, ftpConfig.path);
      imageBuffer = Buffer.concat(chunks);
    } else {
      imageBuffer = await fs.readFile(filePath);
    }

    // For SVG, serve directly without processing
    if (ext === '.svg') {
      res.set('Content-Type', 'image/svg+xml');
      return res.send(imageBuffer);
    }

    // For GIF, serve directly to preserve animation
    if (ext === '.gif') {
      res.set('Content-Type', 'image/gif');
      return res.send(imageBuffer);
    }

    // Generate thumbnail for other image formats (low resolution for performance)
    const thumbnail = await sharp(imageBuffer)
      .resize(200, 150, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 60 })
      .toBuffer();

    // Save to cache
    await saveThumbnailToCache(filePath, modifiedTime, thumbnail);

    res.set('Content-Type', 'image/jpeg');
    res.send(thumbnail);
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
});

// Endpoint to generate video thumbnail (returns video URL for client-side generation)
app.post('/api/thumbnail/video', (req, res) => {
  const { filePath } = req.body;

  if (!filePath || !existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Return the media URL for client-side thumbnail generation
  res.json({
    mediaUrl: `/api/media/${encodeURIComponent(filePath)}`
  });
});

// Bulk generate thumbnails for all images
app.post('/api/generate-thumbnails', async (req, res) => {
  const { files } = req.body;

  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Files array is required' });
  }

  const results = {
    total: files.length,
    generated: 0,
    cached: 0,
    skipped: 0,
    errors: []
  };

  // Set headers for streaming response
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Only process images (not videos or audio)
    if (file.type !== 'image') {
      results.skipped++;
      continue;
    }

    try {
      const ext = path.extname(file.path).toLowerCase();

      // Skip SVG and GIF
      if (ext === '.svg' || ext === '.gif') {
        results.skipped++;
        continue;
      }

      // Check if cached thumbnail already exists
      const modifiedTime = new Date(file.modified);
      const cachedThumbnail = await getCachedThumbnail(file.path, modifiedTime);

      if (cachedThumbnail) {
        results.cached++;
        // Send progress update
        res.write(JSON.stringify({
          progress: Math.round((i + 1) / files.length * 100),
          current: i + 1,
          total: files.length,
          status: 'cached',
          file: file.name
        }) + '\n');
        continue;
      }

      // Get image buffer
      let imageBuffer;
      if (isFtpPath(file.path)) {
        const ftpConfig = parseFtpPath(file.path);
        if (!ftpConfig) {
          results.errors.push({ file: file.name, error: 'Invalid FTP path' });
          continue;
        }

        const client = await getFtpConnection(ftpConfig);
        const chunks = [];
        const writableStream = require('stream').Writable({
          write(chunk, encoding, callback) {
            chunks.push(chunk);
            callback();
          }
        });

        await client.downloadTo(writableStream, ftpConfig.path);
        imageBuffer = Buffer.concat(chunks);
      } else {
        if (!existsSync(file.path)) {
          results.errors.push({ file: file.name, error: 'File not found' });
          continue;
        }
        imageBuffer = await fs.readFile(file.path);
      }

      // Generate thumbnail
      const thumbnail = await sharp(imageBuffer)
        .resize(200, 150, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 60 })
        .toBuffer();

      // Save to cache
      await saveThumbnailToCache(file.path, modifiedTime, thumbnail);

      results.generated++;

      // Send progress update
      res.write(JSON.stringify({
        progress: Math.round((i + 1) / files.length * 100),
        current: i + 1,
        total: files.length,
        status: 'generated',
        file: file.name
      }) + '\n');

    } catch (error) {
      console.error(`Error generating thumbnail for ${file.name}:`, error);
      results.errors.push({ file: file.name, error: error.message });
    }
  }

  // Send final results
  res.write(JSON.stringify({
    complete: true,
    results: results
  }) + '\n');

  res.end();
});

// Get content type based on file extension
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/mp4',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

// Start server
app.listen(PORT, () => {
  console.log(`Local Media Viewer server running on http://localhost:${PORT}`);
  console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});
