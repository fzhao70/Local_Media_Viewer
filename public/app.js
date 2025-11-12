// Application State
let mediaFiles = [];
let filteredFiles = [];
let currentFilter = 'all';
let player = null;

// DOM Elements
const directoryInput = document.getElementById('directoryInput');
const scanBtn = document.getElementById('scanBtn');
const statusMessage = document.getElementById('statusMessage');
const loadingSpinner = document.getElementById('loadingSpinner');
const statsSection = document.getElementById('statsSection');
const filterSection = document.getElementById('filterSection');
const mediaSection = document.getElementById('mediaSection');
const playerSection = document.getElementById('playerSection');
const mediaGrid = document.getElementById('mediaGrid');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.filter-btn');
const closePlayerBtn = document.getElementById('closePlayer');
const videoPlayer = document.getElementById('videoPlayer');
const currentFileName = document.getElementById('currentFileName');
const fileInfo = document.getElementById('fileInfo');

// Initialize
function init() {
    setupEventListeners();
    setupPlyrPlayer();

    // Check for saved directory in localStorage
    const savedDirectory = localStorage.getItem('lastDirectory');
    if (savedDirectory) {
        directoryInput.value = savedDirectory;
    }
}

// Setup Event Listeners
function setupEventListeners() {
    scanBtn.addEventListener('click', scanDirectory);
    closePlayerBtn.addEventListener('click', closePlayer);
    searchInput.addEventListener('input', handleSearch);

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });

    // Allow Enter key to scan
    directoryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            scanDirectory();
        }
    });
}

// Setup Plyr Player with custom options
function setupPlyrPlayer() {
    player = new Plyr(videoPlayer, {
        controls: [
            'play-large',
            'play',
            'progress',
            'current-time',
            'duration',
            'mute',
            'volume',
            'settings',
            'fullscreen'
        ],
        settings: ['quality', 'speed'],
        speed: {
            selected: 1,
            options: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
        },
        ratio: '16:9',
        loadSprite: true,
        iconUrl: 'https://cdn.plyr.io/3.7.8/plyr.svg',
        // Performance optimizations
        preload: 'metadata',
        autopause: true,
        resetOnEnd: true
    });

    // Save playback position
    player.on('timeupdate', () => {
        const currentSrc = videoPlayer.querySelector('source').src;
        if (currentSrc) {
            localStorage.setItem(`playback_${currentSrc}`, player.currentTime);
        }
    });

    // Restore playback position
    player.on('loadedmetadata', () => {
        const currentSrc = videoPlayer.querySelector('source').src;
        const savedTime = localStorage.getItem(`playback_${currentSrc}`);
        if (savedTime && savedTime > 0) {
            player.currentTime = parseFloat(savedTime);
        }
    });
}

// Scan Directory
async function scanDirectory() {
    const directory = directoryInput.value.trim();

    if (!directory) {
        showStatus('Please enter a directory path', 'error');
        return;
    }

    // Show loading
    loadingSpinner.classList.remove('hidden');
    statsSection.classList.add('hidden');
    filterSection.classList.add('hidden');
    mediaSection.classList.add('hidden');
    statusMessage.style.display = 'none';

    try {
        const response = await fetch('http://localhost:3000/api/scan-directory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ directory })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to scan directory');
        }

        // Save directory to localStorage
        localStorage.setItem('lastDirectory', directory);

        // Update state
        mediaFiles = data.files;
        filteredFiles = [...mediaFiles];

        // Update UI
        updateStats(data);
        renderMediaGrid();

        // Show sections
        statsSection.classList.remove('hidden');
        filterSection.classList.remove('hidden');
        mediaSection.classList.remove('hidden');

        showStatus(`Found ${data.count} media files`, 'success');
    } catch (error) {
        showStatus(error.message, 'error');
        console.error('Scan error:', error);
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// Update Statistics
function updateStats(data) {
    const videoCount = data.files.filter(f => f.type === 'video').length;
    const imageCount = data.files.filter(f => f.type === 'image').length;
    const audioCount = data.files.filter(f => f.type === 'audio').length;

    document.getElementById('totalFiles').textContent = data.count;
    document.getElementById('videoCount').textContent = videoCount;
    document.getElementById('imageCount').textContent = imageCount;
    document.getElementById('audioCount').textContent = audioCount;
}

// Render Media Grid
function renderMediaGrid() {
    mediaGrid.innerHTML = '';

    if (filteredFiles.length === 0) {
        mediaGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No media files found</p>';
        return;
    }

    filteredFiles.forEach(file => {
        const mediaItem = createMediaItem(file);
        mediaGrid.appendChild(mediaItem);
    });
}

// Create Media Item
function createMediaItem(file) {
    const item = document.createElement('div');
    item.className = 'media-item';
    item.onclick = () => openMedia(file);

    const thumbnail = document.createElement('div');
    thumbnail.className = 'media-thumbnail';

    // Add icon based on type
    const icon = getMediaIcon(file.type);
    thumbnail.innerHTML = `<span class="video-overlay">${icon}</span>`;

    const info = document.createElement('div');
    info.className = 'media-info';

    const name = document.createElement('div');
    name.className = 'media-name';
    name.textContent = file.name;
    name.title = file.relativePath;

    const meta = document.createElement('div');
    meta.className = 'media-meta';

    const badge = document.createElement('span');
    badge.className = `media-badge ${file.type}`;
    badge.textContent = file.type;

    const size = document.createElement('span');
    size.className = 'media-size';
    size.textContent = formatFileSize(file.size);

    meta.appendChild(badge);
    meta.appendChild(size);

    info.appendChild(name);
    info.appendChild(meta);

    item.appendChild(thumbnail);
    item.appendChild(info);

    return item;
}

// Get Media Icon
function getMediaIcon(type) {
    const icons = {
        video: '🎬',
        image: '🖼️',
        audio: '🎵'
    };
    return icons[type] || '📄';
}

// Format File Size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Open Media
function openMedia(file) {
    if (file.type === 'video' || file.type === 'audio') {
        playVideo(file);
    } else if (file.type === 'image') {
        // For images, you could implement a lightbox or image viewer
        alert('Image viewer coming soon! File: ' + file.name);
    }
}

// Play Video
function playVideo(file) {
    const mediaUrl = `http://localhost:3000/api/media/${encodeURIComponent(file.path)}`;

    // Update player
    const source = videoPlayer.querySelector('source');
    const contentType = getContentType(file.name);

    source.src = mediaUrl;
    source.type = contentType;

    videoPlayer.load();

    // Update UI
    currentFileName.textContent = file.name;
    fileInfo.innerHTML = `
        <strong>Path:</strong> ${file.relativePath}<br>
        <strong>Size:</strong> ${formatFileSize(file.size)}<br>
        <strong>Modified:</strong> ${new Date(file.modified).toLocaleString()}
    `;

    // Show player
    playerSection.classList.remove('hidden');
    playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Play after load
    player.play();
}

// Get Content Type
function getContentType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogg': 'video/ogg',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'm4v': 'video/mp4',
        'flv': 'video/x-flv',
        'wmv': 'video/x-ms-wmv',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'm4a': 'audio/mp4',
        'flac': 'audio/flac',
        'aac': 'audio/aac'
    };
    return types[ext] || 'video/mp4';
}

// Close Player
function closePlayer() {
    player.pause();
    playerSection.classList.add('hidden');
}

// Apply Filters
function applyFilters() {
    let filtered = [...mediaFiles];

    // Apply type filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(f => f.type === currentFilter);
    }

    // Apply search filter
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(f =>
            f.name.toLowerCase().includes(searchTerm) ||
            f.relativePath.toLowerCase().includes(searchTerm)
        );
    }

    filteredFiles = filtered;
    renderMediaGrid();
}

// Handle Search
function handleSearch() {
    applyFilters();
}

// Show Status Message
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
}

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
