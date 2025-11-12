# Local Media Viewer

A powerful web-based local media viewer that allows you to browse and play media files from your directories. Built with Node.js, Express, and Plyr.js for a high-performance viewing experience.

## Features

- **📁 Directory Browsing**: Select any local directory to scan for media files
- **🔍 Recursive Scanning**: Automatically finds media files in all subdirectories
- **🎬 High-Performance Video Player**: Powered by Plyr.js with advanced features:
  - Variable playback speed (0.25x to 3x)
  - Fullscreen support
  - Volume control
  - Responsive size adjustment
  - Seek/scrub through videos
  - Resume playback from last position
- **🖼️ Multi-Format Support**:
  - **Videos**: MP4, WebM, OGG, MOV, AVI, MKV, M4V, FLV, WMV
  - **Images**: JPG, PNG, GIF, BMP, WebP, SVG
  - **Audio**: MP3, WAV, OGG, M4A, FLAC, AAC
- **🎯 Filtering & Search**: Filter by media type and search by filename
- **📊 Statistics**: View count of total files, videos, images, and audio files
- **💾 Smart Caching**: Remembers your last directory and playback positions

## Installation

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/fzhao70/Local_Media_Viewer.git
cd Local_Media_Viewer
```

2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Enter a directory path in the input field:
   - **Linux/Mac**: `/home/user/Videos` or `/Users/username/Movies`
   - **Windows**: `C:\Users\YourName\Videos`

4. Click "Scan Directory" to load all media files

5. Browse and click on any media file to play it

### Development Mode

For development with auto-restart on file changes:
```bash
npm run dev
```

## Video Player Controls

The integrated Plyr.js player provides the following controls:

- **Play/Pause**: Space bar or click the play button
- **Volume**: Click the volume icon or use the slider
- **Speed Control**: Click settings gear → Speed → Select from 0.25x to 3x
- **Fullscreen**: Click the fullscreen button or press `F`
- **Seek**: Click on the progress bar or drag the scrubber
- **Keyboard Shortcuts**:
  - `Space`: Play/Pause
  - `↑/↓`: Volume up/down
  - `←/→`: Seek backward/forward
  - `F`: Fullscreen
  - `M`: Mute/Unmute

## Project Structure

```
Local_Media_Viewer/
├── public/              # Frontend files
│   ├── index.html      # Main HTML page
│   ├── styles.css      # Styling
│   └── app.js          # Client-side JavaScript
├── server.js           # Express server
├── package.json        # Dependencies and scripts
└── README.md          # Documentation
```

## API Endpoints

### POST `/api/scan-directory`
Scans a directory for media files recursively.

**Request Body:**
```json
{
  "directory": "/path/to/directory"
}
```

**Response:**
```json
{
  "directory": "/path/to/directory",
  "count": 42,
  "files": [
    {
      "name": "video.mp4",
      "path": "/path/to/directory/video.mp4",
      "relativePath": "video.mp4",
      "size": 12345678,
      "modified": "2025-01-01T00:00:00.000Z",
      "type": "video"
    }
  ]
}
```

### GET `/api/media/*`
Streams media files with support for range requests (for video seeking).

**Example:**
```
GET /api/media/path/to/video.mp4
```

## Technologies Used

- **Backend**:
  - Node.js
  - Express.js
  - CORS
- **Frontend**:
  - HTML5
  - CSS3
  - Vanilla JavaScript
  - [Plyr.js](https://plyr.io/) - Modern HTML5 video player

## Browser Support

- Chrome/Edge (recommended for best performance)
- Firefox
- Safari
- Opera

## Performance Optimizations

- Range request support for efficient video streaming
- Lazy loading of media files
- Optimized video player with hardware acceleration
- Efficient directory scanning with recursive traversal
- Client-side filtering and search

## Security Considerations

This application is designed for **local use only**. It provides direct access to your file system, so:

- Only run on trusted networks
- Do not expose to the internet without proper authentication
- Be cautious about which directories you scan

## Troubleshooting

### Port already in use
If port 3000 is already in use, you can change it by setting the PORT environment variable:
```bash
PORT=3001 npm start
```

### Directory not found
Make sure you're using the correct path format for your operating system:
- Use forward slashes `/` or escaped backslashes `\\` on Windows
- Ensure you have read permissions for the directory

### Video not playing
- Check if your browser supports the video codec
- Ensure the file isn't corrupted
- Try a different browser (Chrome recommended)

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Created with Claude Code
