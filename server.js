const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { existsSync, statSync } = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

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
          type: getMediaType(entry.name)
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return files;
}

// API endpoint to list media files in a directory
app.post('/api/scan-directory', async (req, res) => {
  const { directory } = req.body;

  if (!directory) {
    return res.status(400).json({ error: 'Directory path is required' });
  }

  // Check if directory exists
  if (!existsSync(directory)) {
    return res.status(404).json({ error: 'Directory not found' });
  }

  // Check if it's actually a directory
  const stats = statSync(directory);
  if (!stats.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }

  try {
    const mediaFiles = await getMediaFilesRecursive(directory);
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
app.get('/api/media/*', (req, res) => {
  const filePath = decodeURIComponent(req.params[0]);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Set appropriate headers for video streaming
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
});

// Serve image thumbnails
app.get('/api/thumbnail/image/*', async (req, res) => {
  const filePath = decodeURIComponent(req.params[0]);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const ext = path.extname(filePath).toLowerCase();

    // For SVG, serve directly without processing
    if (ext === '.svg') {
      res.set('Content-Type', 'image/svg+xml');
      const svgBuffer = await fs.readFile(filePath);
      return res.send(svgBuffer);
    }

    // For GIF, serve directly to preserve animation
    if (ext === '.gif') {
      res.set('Content-Type', 'image/gif');
      const gifBuffer = await fs.readFile(filePath);
      return res.send(gifBuffer);
    }

    // Generate thumbnail for other image formats (low resolution for performance)
    const thumbnail = await sharp(filePath)
      .resize(200, 150, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 60 })
      .toBuffer();

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
