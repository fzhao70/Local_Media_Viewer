// ============================================================================
// APPLICATION STATE VARIABLES
// ============================================================================
// These variables store the current state of the application and can be
// modified to change behavior or add new features.

// mediaFiles: Array of all media files found in the scanned directory
let mediaFiles = [];

// filteredFiles: Array of files after applying filters (type, search)
let filteredFiles = [];

// currentFilter: Currently selected filter type ('all', 'video', 'image', 'audio')
let currentFilter = 'all';

// player: Plyr video player instance (initialized in setupPlyrPlayer)
let player = null;

// currentImageIndex: Index of currently displayed image in imageFiles array
let currentImageIndex = 0;

// imageFiles: Array of image files for navigation in image viewer
let imageFiles = [];

// currentVideoIndex: Index of currently playing video in videoFiles array
let currentVideoIndex = -1;

// videoFiles: Array of video/audio files for playlist navigation
let videoFiles = [];

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================
// These constants reference HTML elements used throughout the application.
// Modify these selectors if you change the HTML structure.

// Main UI elements
const directoryInput = document.getElementById('directoryInput');
const scanBtn = document.getElementById('scanBtn');
const statusMessage = document.getElementById('statusMessage');
const loadingSpinner = document.getElementById('loadingSpinner');
const statsSection = document.getElementById('statsSection');
const filterSection = document.getElementById('filterSection');
const mediaSection = document.getElementById('mediaSection');
const mediaGrid = document.getElementById('mediaGrid');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.filter-btn');
const preGenerateThumbnailsCheckbox = document.getElementById('preGenerateThumbnails');
const thumbnailProgress = document.getElementById('thumbnailProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');

// Video Player Panel elements
const playerPanel = document.getElementById('playerPanel');
const closePlayerBtn = document.getElementById('closePlayer');
const minimizePlayerBtn = document.getElementById('minimizePlayer');
const prevVideoBtn = document.getElementById('prevVideo');
const nextVideoBtn = document.getElementById('nextVideo');
const videoPlayer = document.getElementById('videoPlayer');
const currentFileName = document.getElementById('currentFileName');
const fileInfo = document.getElementById('fileInfo');
const loopVideoCheckbox = document.getElementById('loopVideo');
const autoplayNextCheckbox = document.getElementById('autoplayNext');

// Image Viewer Panel elements
const imagePanel = document.getElementById('imagePanel');
const closeLightboxBtn = document.getElementById('closeLightbox');
const minimizeImageBtn = document.getElementById('minimizeImage');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxFileName = document.getElementById('lightboxFileName');
const lightboxInfo = document.getElementById('lightboxInfo');
const prevImageBtn = document.getElementById('prevImage');
const nextImageBtn = document.getElementById('nextImage');

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 * Called when the DOM is ready. Sets up all event listeners, initializes
 * the video player, enables draggable panels, and restores saved preferences.
 */
function init() {
    setupEventListeners();
    setupPlyrPlayer();
    setupDraggablePanels();

    // Restore last used directory path from localStorage
    const savedDirectory = localStorage.getItem('lastDirectory');
    if (savedDirectory) {
        directoryInput.value = savedDirectory;
    }

    // Restore autoplay preference from localStorage
    const autoplayPref = localStorage.getItem('autoplayNext');
    if (autoplayPref !== null) {
        autoplayNextCheckbox.checked = autoplayPref === 'true';
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Setup all event listeners for the application
 * Attaches click, input, and keyboard event handlers to UI elements.
 * Modify this function to add new interactive features.
 */
function setupEventListeners() {
    // Directory scanning
    scanBtn.addEventListener('click', scanDirectory);
    searchInput.addEventListener('input', handleSearch);

    // Video Player Panel controls
    closePlayerBtn.addEventListener('click', closePlayer);
    minimizePlayerBtn.addEventListener('click', () => toggleMinimize(playerPanel));
    prevVideoBtn.addEventListener('click', playPreviousVideo);
    nextVideoBtn.addEventListener('click', playNextVideo);

    // Video playback options
    loopVideoCheckbox.addEventListener('change', handleLoopChange);
    autoplayNextCheckbox.addEventListener('change', () => {
        // Save preference to localStorage for persistence
        localStorage.setItem('autoplayNext', autoplayNextCheckbox.checked);
    });

    // Image Viewer Panel controls
    closeLightboxBtn.addEventListener('click', closeLightbox);
    minimizeImageBtn.addEventListener('click', () => toggleMinimize(imagePanel));
    prevImageBtn.addEventListener('click', showPreviousImage);
    nextImageBtn.addEventListener('click', showNextImage);

    // Keyboard navigation for image viewer
    // Arrow keys navigate, Escape closes the viewer
    document.addEventListener('keydown', (e) => {
        if (!imagePanel.classList.contains('hidden')) {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') showPreviousImage();
            if (e.key === 'ArrowRight') showNextImage();
        }
    });

    // Media type filter buttons (All, Videos, Images, Audio)
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });

    // Allow Enter key to trigger directory scan
    directoryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            scanDirectory();
        }
    });
}

// ============================================================================
// FLOATING PANEL FUNCTIONALITY
// ============================================================================

/**
 * Setup draggable and resizable panels
 * Enables both video player and image viewer panels to be dragged and resized.
 * Also sets up resize observer for responsive video scaling.
 */
function setupDraggablePanels() {
    makePanelDraggable(playerPanel);
    makePanelDraggable(imagePanel);
    setupResizeObserver();
}

/**
 * Setup Resize Observer for responsive video scaling
 * Watches for panel resize events and triggers video player to recalculate
 * dimensions. This ensures video properly fills the panel when resized.
 */
function setupResizeObserver() {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            if (entry.target === playerPanel && !playerPanel.classList.contains('hidden')) {
                // Trigger window resize event to make Plyr recalculate video dimensions
                if (player && player.elements && player.elements.container) {
                    const event = new Event('resize');
                    window.dispatchEvent(event);
                }
            }
        }
    });

    resizeObserver.observe(playerPanel);
}

/**
 * Make a panel draggable by its header
 * @param {HTMLElement} panel - The panel element to make draggable
 *
 * Allows users to click and drag panels around the screen by their header bar.
 * Panels are constrained to stay within the viewport bounds.
 */
function makePanelDraggable(panel) {
    const header = panel.querySelector('.panel-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        // Don't initiate drag if user clicked on buttons in the header
        if (e.target.classList.contains('panel-btn') || e.target.closest('.panel-btn')) {
            return;
        }

        initialX = e.clientX - panel.offsetLeft;
        initialY = e.clientY - panel.offsetTop;
        isDragging = true;
        panel.style.zIndex = 1001; // Bring to front while dragging
    }

    function drag(e) {
        if (!isDragging) return;

        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        // Constrain panel to stay within viewport bounds
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - 50; // Keep at least header visible

        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));

        panel.style.left = currentX + 'px';
        panel.style.top = currentY + 'px';
    }

    function dragEnd() {
        isDragging = false;
        panel.style.zIndex = 1000; // Reset z-index after dragging
    }
}

/**
 * Toggle minimize state of a panel
 * @param {HTMLElement} panel - The panel to minimize/maximize
 *
 * Minimized panels show only the header bar, saving screen space.
 */
function toggleMinimize(panel) {
    panel.classList.toggle('minimized');
}

// ============================================================================
// VIDEO PLAYER SETUP AND CONTROLS
// ============================================================================

/**
 * Setup Plyr video player with custom configuration
 * Initializes the Plyr player instance with custom controls, speed options,
 * and event handlers. Also handles playback position persistence.
 *
 * Modify the controls array or speed options to customize player behavior.
 */
function setupPlyrPlayer() {
    player = new Plyr(videoPlayer, {
        // Custom control layout - add/remove controls as needed
        controls: [
            'play-large',      // Large play button in center
            'play',            // Play/pause button
            'progress',        // Progress bar
            'current-time',    // Current time display
            'duration',        // Total duration display
            'mute',            // Mute button
            'volume',          // Volume control
            'settings',        // Settings menu
            'fullscreen'       // Fullscreen toggle
        ],
        settings: ['quality', 'speed'],
        speed: {
            selected: 1,
            // Available playback speeds - modify to add/remove options
            options: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
        },
        loadSprite: true,
        iconUrl: 'https://cdn.plyr.io/3.7.8/plyr.svg',
        // Performance optimizations
        preload: 'metadata',  // Only load metadata initially
        autopause: true,      // Pause when another video plays
        resetOnEnd: true,     // Reset video when it ends
        // Disable ratio to allow video to fill container dynamically
        ratio: null,
        // Fullscreen configuration
        fullscreen: {
            enabled: true,
            fallback: true,
            iosNative: false
        }
    });

    // Save playback position to localStorage for resume functionality
    player.on('timeupdate', () => {
        const currentSrc = videoPlayer.querySelector('source').src;
        if (currentSrc) {
            localStorage.setItem(`playback_${currentSrc}`, player.currentTime);
        }
    });

    // Restore playback position when video loads
    player.on('loadedmetadata', () => {
        const currentSrc = videoPlayer.querySelector('source').src;
        const savedTime = localStorage.getItem(`playback_${currentSrc}`);
        if (savedTime && savedTime > 0) {
            player.currentTime = parseFloat(savedTime);
        }
    });

    // Handle video ended event for autoplay and loop functionality
    player.on('ended', handleVideoEnded);
}

/**
 * Handle loop checkbox change
 * Updates the video player's loop property when the user toggles the loop checkbox.
 */
function handleLoopChange() {
    if (player) {
        player.loop = loopVideoCheckbox.checked;
    }
}

/**
 * Handle video ended event
 * Determines what happens when a video finishes playing:
 * - If loop is enabled, the video repeats (handled by player)
 * - If autoplay next is enabled, plays the next video in the playlist
 * - Otherwise, the video just stops
 */
function handleVideoEnded() {
    // If loop is enabled, the player will handle it automatically
    if (loopVideoCheckbox.checked) {
        return;
    }

    // If autoplay next is enabled, play next video in playlist
    if (autoplayNextCheckbox.checked) {
        playNextVideo();
    }
}

/**
 * Play next video in the playlist
 * Advances to the next video in videoFiles array, wrapping around to the
 * beginning if at the end. Called by autoplay or next button.
 */
function playNextVideo() {
    if (videoFiles.length === 0) return;

    // Wrap around to beginning if at the end
    currentVideoIndex = (currentVideoIndex + 1) % videoFiles.length;
    const nextVideo = videoFiles[currentVideoIndex];

    if (nextVideo) {
        playVideo(nextVideo);
    }
}

/**
 * Play previous video in the playlist
 * Goes back to the previous video in videoFiles array, wrapping around to the
 * end if at the beginning. Called by previous button.
 */
function playPreviousVideo() {
    if (videoFiles.length === 0) return;

    // Wrap around to end if at the beginning
    currentVideoIndex = (currentVideoIndex - 1 + videoFiles.length) % videoFiles.length;
    const prevVideo = videoFiles[currentVideoIndex];

    if (prevVideo) {
        playVideo(prevVideo);
    }
}

// ============================================================================
// DIRECTORY SCANNING AND FILE LOADING
// ============================================================================

/**
 * Scan directory for media files
 * Sends the directory path to the server to scan for video, image, and audio files.
 * Supports both local filesystem paths and FTP/FTPS URLs.
 *
 * Local examples:  /home/user/Videos, C:\Users\Videos
 * FTP examples:    ftp://user:pass@host:21/path, ftps://user:pass@host:990/path
 *
 * IMPORTANT: Closes any open panels before scanning to prevent crashes when
 * switching directories.
 */
async function scanDirectory() {
    const directory = directoryInput.value.trim();

    if (!directory) {
        showStatus('Please enter a directory path', 'error');
        return;
    }

    // CRITICAL FIX: Close any open panels to prevent crash when changing directories
    // This ensures that any playing media is stopped and panels are closed before
    // loading new media files
    if (!playerPanel.classList.contains('hidden')) {
        player.pause();
        playerPanel.classList.add('hidden');
    }
    if (!imagePanel.classList.contains('hidden')) {
        imagePanel.classList.add('hidden');
    }

    // Show loading spinner and hide previous results
    loadingSpinner.classList.remove('hidden');
    statsSection.classList.add('hidden');
    filterSection.classList.add('hidden');
    mediaSection.classList.add('hidden');
    statusMessage.style.display = 'none';

    try {
        // Send scan request to server
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

        // Save directory to localStorage for next session
        localStorage.setItem('lastDirectory', directory);

        // Update application state with new files
        mediaFiles = data.files;
        filteredFiles = [...mediaFiles];

        // Update UI with scan results
        updateStats(data);
        renderMediaGrid();

        // Show results sections
        statsSection.classList.remove('hidden');
        filterSection.classList.remove('hidden');
        mediaSection.classList.remove('hidden');

        showStatus(`Found ${data.count} media files`, 'success');

        // Pre-generate thumbnails if option is checked
        // This creates and caches thumbnails for all media files at once
        if (preGenerateThumbnailsCheckbox.checked) {
            await generateThumbnails(data.files);
        }
    } catch (error) {
        showStatus(error.message, 'error');
        console.error('Scan error:', error);
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

/**
 * Update statistics display
 * @param {Object} data - Scan results data containing files array and count
 *
 * Counts files by type and updates the stats cards displayed at the top of the page.
 */
function updateStats(data) {
    const videoCount = data.files.filter(f => f.type === 'video').length;
    const imageCount = data.files.filter(f => f.type === 'image').length;
    const audioCount = data.files.filter(f => f.type === 'audio').length;

    document.getElementById('totalFiles').textContent = data.count;
    document.getElementById('videoCount').textContent = videoCount;
    document.getElementById('imageCount').textContent = imageCount;
    document.getElementById('audioCount').textContent = audioCount;
}

// ============================================================================
// MEDIA GRID RENDERING
// ============================================================================

/**
 * Render the media grid with all filtered files
 * Clears the existing grid and creates media items for each filtered file.
 * Shows a message if no files match the current filters.
 */
function renderMediaGrid() {
    mediaGrid.innerHTML = '';

    if (filteredFiles.length === 0) {
        mediaGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No media files found</p>';
        return;
    }

    // Create and append a media item for each filtered file
    filteredFiles.forEach(file => {
        const mediaItem = createMediaItem(file);
        mediaGrid.appendChild(mediaItem);
    });
}

/**
 * Create a media item card for the grid
 * @param {Object} file - File object with name, type, size, path, etc.
 * @returns {HTMLElement} - The created media item element
 *
 * Creates a clickable card with thumbnail, filename, type badge, and file size.
 * Thumbnails are generated differently based on file type (image/video/audio).
 */
function createMediaItem(file) {
    const item = document.createElement('div');
    item.className = 'media-item';
    item.onclick = () => openMedia(file);

    const thumbnail = document.createElement('div');
    thumbnail.className = 'media-thumbnail';

    // Generate thumbnail based on file type
    if (file.type === 'image') {
        generateImageThumbnail(file, thumbnail);
    } else if (file.type === 'video') {
        generateVideoThumbnail(file, thumbnail);
    } else {
        // Audio files get an icon instead of thumbnail
        const icon = getMediaIcon(file.type);
        thumbnail.innerHTML = `<span class="video-overlay">${icon}</span>`;
    }

    // Create info section with filename and metadata
    const info = document.createElement('div');
    info.className = 'media-info';

    const name = document.createElement('div');
    name.className = 'media-name';
    name.textContent = file.name;
    name.title = file.relativePath; // Show full path on hover

    const meta = document.createElement('div');
    meta.className = 'media-meta';

    // Type badge (video/image/audio)
    const badge = document.createElement('span');
    badge.className = `media-badge ${file.type}`;
    badge.textContent = file.type;

    // File size
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

// ============================================================================
// THUMBNAIL GENERATION
// ============================================================================

/**
 * Generate thumbnail for image files
 * @param {Object} file - The image file object
 * @param {HTMLElement} container - The container element to place the thumbnail in
 *
 * Loads a low-resolution thumbnail from the server for fast grid display.
 * Shows a loading icon while generating, falls back to icon if generation fails.
 * Uses lazy loading for better performance with large media libraries.
 */
function generateImageThumbnail(file, container) {
    const img = document.createElement('img');
    img.src = `http://localhost:3000/api/thumbnail/image/${encodeURIComponent(file.path)}`;
    img.alt = file.name;
    img.loading = 'lazy'; // Browser lazy-loads images as user scrolls

    // Show loading indicator while thumbnail is being generated/loaded
    const icon = getMediaIcon(file.type);
    container.innerHTML = `<span class="video-overlay thumbnail-loading">${icon}</span>`;

    img.onload = () => {
        // Replace loading indicator with actual thumbnail
        container.innerHTML = '';
        container.appendChild(img);
    };

    img.onerror = () => {
        // Fallback to icon if thumbnail generation fails
        container.innerHTML = `<span class="video-overlay">${icon}</span>`;
    };
}

/**
 * Generate thumbnail for video files using server-side FFmpeg
 * @param {Object} file - The video file object
 * @param {HTMLElement} container - The container element to place the thumbnail in
 *
 * Requests a video thumbnail from the server (generated using FFmpeg at 10% timestamp).
 * Thumbnails are cached on the server for faster subsequent loads.
 * Adds a play icon overlay to indicate it's a video.
 */
function generateVideoThumbnail(file, container) {
    const thumbnailUrl = `http://localhost:3000/api/thumbnail/video/${encodeURIComponent(file.path)}`;

    // Show loading indicator while thumbnail is being generated/loaded
    const icon = getMediaIcon(file.type);
    container.innerHTML = `<span class="video-overlay thumbnail-loading">${icon}</span>`;

    // Create image element for server-generated thumbnail
    const img = document.createElement('img');
    img.src = thumbnailUrl;
    img.alt = file.name;
    img.loading = 'lazy'; // Browser lazy-loads images as user scrolls

    img.onload = () => {
        // Replace loading indicator with actual thumbnail
        container.innerHTML = '';
        container.appendChild(img);

        // Add play icon overlay to indicate it's a video
        const playIcon = document.createElement('span');
        playIcon.className = 'video-overlay';
        playIcon.innerHTML = '▶';
        container.appendChild(playIcon);
    };

    img.onerror = () => {
        // Fallback to icon if thumbnail generation fails
        container.innerHTML = `<span class="video-overlay">${icon}</span>`;
    };
}

/**
 * Get emoji icon for media type
 * @param {string} type - Media type ('video', 'image', 'audio')
 * @returns {string} - Emoji icon for the media type
 */
function getMediaIcon(type) {
    const icons = {
        video: '🎬',
        image: '🖼️',
        audio: '🎵'
    };
    return icons[type] || '📄';
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size (e.g., "1.5 MB")
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ============================================================================
// MEDIA VIEWING
// ============================================================================

/**
 * Open media file in appropriate viewer
 * @param {Object} file - The media file to open
 *
 * Routes to video player for video/audio files, or image viewer for images.
 */
function openMedia(file) {
    if (file.type === 'video' || file.type === 'audio') {
        playVideo(file);
    } else if (file.type === 'image') {
        openImageLightbox(file);
    }
}

/**
 * Open image in the floating viewer panel
 * @param {Object} file - The image file to display
 *
 * Creates a playlist of all image files from the current filtered list
 * and displays the selected image. Enables navigation between images.
 */
function openImageLightbox(file) {
    // Build playlist of all image files from currently filtered files
    imageFiles = filteredFiles.filter(f => f.type === 'image');
    currentImageIndex = imageFiles.findIndex(f => f.path === file.path);

    if (currentImageIndex === -1) {
        currentImageIndex = 0;
    }

    // Display the image and show the panel
    showImageInLightbox(imageFiles[currentImageIndex]);
    imagePanel.classList.remove('hidden');
    imagePanel.classList.remove('minimized');
}

/**
 * Display an image in the lightbox viewer
 * @param {Object} file - The image file to display
 *
 * Loads the full-resolution image (not thumbnail) for viewing.
 * Shows loading indicator while image loads, and updates file info display.
 * Navigation buttons are shown/hidden based on playlist size.
 */
function showImageInLightbox(file) {
    const fullImageUrl = `http://localhost:3000/api/media/${encodeURIComponent(file.path)}`;

    // Create or show loading indicator
    const wrapper = lightboxImage.parentElement;
    let loadingIndicator = wrapper.querySelector('.image-loading-indicator');
    if (!loadingIndicator) {
        loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'image-loading-indicator';
        loadingIndicator.innerHTML = '⏳';
        wrapper.appendChild(loadingIndicator);
    }
    loadingIndicator.style.display = 'block';

    // Clear current image and show loading state
    lightboxImage.src = '';
    lightboxImage.classList.add('loading');

    // Load full resolution image directly (skipping thumbnail for viewer)
    const fullImage = new Image();
    fullImage.onload = () => {
        lightboxImage.src = fullImageUrl;
        lightboxImage.classList.remove('loading');
        loadingIndicator.style.display = 'none';
    };
    fullImage.onerror = () => {
        // Show error message if image fails to load
        lightboxImage.classList.remove('loading');
        loadingIndicator.innerHTML = '❌ Failed to load image';
        setTimeout(() => {
            loadingIndicator.style.display = 'none';
        }, 3000);
    };
    fullImage.src = fullImageUrl;

    // Update panel header and info display
    lightboxFileName.textContent = file.name;
    lightboxInfo.innerHTML = `
        <strong>Path:</strong> ${file.relativePath}<br>
        <strong>Size:</strong> ${formatFileSize(file.size)}<br>
        <strong>Modified:</strong> ${new Date(file.modified).toLocaleString()}<br>
        <strong>Image ${currentImageIndex + 1} of ${imageFiles.length}</strong>
    `;

    // Show/hide navigation buttons based on playlist size
    prevImageBtn.style.display = imageFiles.length > 1 ? 'inline-flex' : 'none';
    nextImageBtn.style.display = imageFiles.length > 1 ? 'inline-flex' : 'none';
}

/**
 * Close the image viewer panel
 * Hides the panel and clears the image source to free memory.
 */
function closeLightbox() {
    imagePanel.classList.add('hidden');
    lightboxImage.src = '';
}

/**
 * Navigate to previous image in playlist
 * Wraps around to the end if at the beginning.
 */
function showPreviousImage() {
    if (imageFiles.length === 0) return;
    currentImageIndex = (currentImageIndex - 1 + imageFiles.length) % imageFiles.length;
    showImageInLightbox(imageFiles[currentImageIndex]);
}

/**
 * Navigate to next image in playlist
 * Wraps around to the beginning if at the end.
 */
function showNextImage() {
    if (imageFiles.length === 0) return;
    currentImageIndex = (currentImageIndex + 1) % imageFiles.length;
    showImageInLightbox(imageFiles[currentImageIndex]);
}

/**
 * Play video or audio file in the floating player panel
 * @param {Object} file - The video/audio file to play
 *
 * Creates a playlist of all video/audio files from the current filtered list.
 * Loads the media file at full resolution (not thumbnail) for playback.
 * Shows the player panel and begins playback automatically.
 */
function playVideo(file) {
    const mediaUrl = `http://localhost:3000/api/media/${encodeURIComponent(file.path)}`;

    // Build playlist of all video/audio files from currently filtered files
    videoFiles = filteredFiles.filter(f => f.type === 'video' || f.type === 'audio');
    currentVideoIndex = videoFiles.findIndex(f => f.path === file.path);

    if (currentVideoIndex === -1) {
        currentVideoIndex = 0;
    }

    // Update video player source
    const source = videoPlayer.querySelector('source');
    const contentType = getContentType(file.name);

    source.src = mediaUrl;
    source.type = contentType;

    videoPlayer.load();

    // Update panel header and file info display
    currentFileName.textContent = file.name;
    fileInfo.innerHTML = `
        <strong>Path:</strong> ${file.relativePath}<br>
        <strong>Size:</strong> ${formatFileSize(file.size)}<br>
        <strong>Modified:</strong> ${new Date(file.modified).toLocaleString()}<br>
        <strong>Video ${currentVideoIndex + 1} of ${videoFiles.length}</strong>
    `;

    // Show/hide navigation buttons based on playlist size
    prevVideoBtn.style.display = videoFiles.length > 1 ? 'inline-flex' : 'none';
    nextVideoBtn.style.display = videoFiles.length > 1 ? 'inline-flex' : 'none';

    // Show player panel
    playerPanel.classList.remove('hidden');
    playerPanel.classList.remove('minimized');

    // Update loop state from checkbox
    if (player) {
        player.loop = loopVideoCheckbox.checked;
    }

    // Force resize after showing panel to ensure video fills properly
    // This triggers Plyr to recalculate dimensions based on panel size
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        if (player && player.elements && player.elements.container) {
            player.toggleControls(true);
        }
    }, 100);

    // Start playback automatically
    player.play();
}

/**
 * Get MIME content type for media file
 * @param {string} filename - The filename with extension
 * @returns {string} - MIME type for the file
 *
 * Maps file extensions to their MIME types for proper video/audio playback.
 * Add new extensions here to support additional formats.
 */
function getContentType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        // Video formats
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogg': 'video/ogg',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'm4v': 'video/mp4',
        'flv': 'video/x-flv',
        'wmv': 'video/x-ms-wmv',
        // Audio formats
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'm4a': 'audio/mp4',
        'flac': 'audio/flac',
        'aac': 'audio/aac'
    };
    return types[ext] || 'video/mp4';
}

/**
 * Close the video player panel
 * Pauses playback and hides the panel.
 */
function closePlayer() {
    player.pause();
    playerPanel.classList.add('hidden');
}

// ============================================================================
// FILTERING AND SEARCH
// ============================================================================

/**
 * Apply filters to media files
 * Filters files based on type (video/image/audio) and search term.
 * Updates filteredFiles array and re-renders the grid.
 *
 * Modify this function to add additional filter criteria (e.g., date, size).
 */
function applyFilters() {
    let filtered = [...mediaFiles];

    // Apply type filter (all/video/image/audio)
    if (currentFilter !== 'all') {
        filtered = filtered.filter(f => f.type === currentFilter);
    }

    // Apply search filter to filename and path
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(f =>
            f.name.toLowerCase().includes(searchTerm) ||
            f.relativePath.toLowerCase().includes(searchTerm)
        );
    }

    // Update state and re-render grid with filtered results
    filteredFiles = filtered;
    renderMediaGrid();
}

/**
 * Handle search input changes
 * Called when user types in the search box. Triggers filter application.
 */
function handleSearch() {
    applyFilters();
}

// ============================================================================
// BULK THUMBNAIL GENERATION
// ============================================================================

/**
 * Generate and cache thumbnails for all media files
 * @param {Array} files - Array of file objects to generate thumbnails for
 *
 * Sends a request to the server to pre-generate thumbnails for all images and videos.
 * Shows a progress bar with real-time updates using streaming response.
 * Thumbnails are cached on the server for faster future loads.
 *
 * This is an optional optimization that can be enabled via checkbox before scanning.
 */
async function generateThumbnails(files) {
    // Show progress bar
    thumbnailProgress.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Generating thumbnails...';

    try {
        // Request thumbnail generation from server
        const response = await fetch('http://localhost:3000/api/generate-thumbnails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ files })
        });

        if (!response.ok) {
            throw new Error('Failed to generate thumbnails');
        }

        // Read streaming response for real-time progress updates
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n').filter(line => line.trim());

            // Process each progress update line
            for (const line of lines) {
                try {
                    const update = JSON.parse(line);

                    if (update.complete) {
                        // Final results summary
                        progressFill.style.width = '100%';
                        progressText.textContent = `Complete! Generated: ${update.results.generated}, Cached: ${update.results.cached}, Skipped: ${update.results.skipped}`;

                        // Hide progress bar after short delay
                        setTimeout(() => {
                            thumbnailProgress.classList.add('hidden');
                        }, 3000);
                    } else {
                        // Incremental progress update
                        progressFill.style.width = `${update.progress}%`;
                        progressText.textContent = `Processing ${update.current}/${update.total}: ${update.file} (${update.status})`;
                    }
                } catch (e) {
                    console.error('Error parsing progress update:', e);
                }
            }
        }
    } catch (error) {
        console.error('Thumbnail generation error:', error);
        progressText.textContent = 'Error generating thumbnails';
        setTimeout(() => {
            thumbnailProgress.classList.add('hidden');
        }, 3000);
    }
}

// ============================================================================
// STATUS MESSAGES
// ============================================================================

/**
 * Show status message to user
 * @param {string} message - The message to display
 * @param {string} type - Message type: 'success' or 'error'
 *
 * Displays a colored status banner at the top of the page.
 * Success messages auto-hide after 5 seconds, error messages stay visible.
 */
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
}

// ============================================================================
// APPLICATION BOOTSTRAP
// ============================================================================

/**
 * Initialize the application when the DOM is ready
 * Checks if the DOM is still loading and waits for DOMContentLoaded event,
 * or immediately initializes if the DOM is already loaded.
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
