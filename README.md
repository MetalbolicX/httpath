# HTTPath

<div align="center">
  🚀 A minimalist HTTP file server for Node.js with hot-reload capabilities
</div>

> **HTTPath** - A lightweight, feature-rich static file server similar to Python's `python -m http.server` but with modern Node.js features.

![Node.js](https://img.shields.io/badge/node.js->=18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)

## ✨ Features

- 📁 **Static File Streaming** - Efficient file serving using Node.js streams
- 🎯 **MIME Type Detection** - Automatic content-type detection for common file types
- 📂 **Directory Indexing** - Beautiful directory listings with navigation
- 🔒 **Path Sanitization** - Built-in security against directory traversal attacks
- 🔄 **Hot-Reload** - Automatic browser refresh when files change (with `--reload` flag)
- ⚡ **Auto Port Detection** - Automatically finds available ports if default is busy
- 🖥️ **CLI Interface** - Easy command-line usage with intuitive flags
- 🛡️ **Graceful Shutdown** - Clean server shutdown with Ctrl+C

## 🚀 Quick Start

### Installation

```bash
npm install -g httpath
```

Or use without installing:

```bash
npx httpath
```

### Basic Usage

```bash
# Start server on default port (8080) in current directory
httpath

# Custom port
httpath --port 3000

# Serve different directory
httpath --path ./public

# Enable hot-reload for development
httpath --reload

# Combined options
httpath --port 3000 --path ./dist --reload
```

## 📖 API Reference

### Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--port` | `-p` | Port number to listen on | `8080` |
| `--path` | `-d` | Directory to serve files from | Current directory |
| `--reload` | `-r` | Enable hot-reload functionality | `false` |

### Examples

#### Development Server with Hot-Reload
```bash
httpath --port 3000 --reload
```
Perfect for frontend development. Changes to HTML, CSS, JS files will automatically refresh the browser.

#### Production-like Static Server
```bash
httpath --port 8080 --path ./build
```
Serve built static assets without hot-reload overhead.

#### Custom Directory with Auto Port
```bash
httpath --path ./my-website
```
If port 8080 is busy, HTTPath will automatically try 8081, 8082, etc.

## 🔥 Hot-Reload Feature

When enabled with `--reload`, HTTPath provides:

- **File Watching**: Monitors all files in the served directory recursively
- **Server-Sent Events**: Uses SSE for real-time browser communication
- **Auto-Injection**: Automatically injects reload script into HTML files
- **Smart Reconnection**: Handles connection drops gracefully

### How It Works

1. HTTPath watches for file changes using Node.js `fs.watch`
2. A tiny JavaScript snippet is injected into HTML files
3. The script opens a connection to `/__reload__` endpoint
4. When files change, the server sends a reload signal
5. The browser automatically refreshes

## 🛡️ Security Features

HTTPath includes built-in protection against common web server vulnerabilities:

- **Directory Traversal Protection**: Prevents access to files outside the served directory
- **Path Normalization**: Safely resolves relative paths
- **Input Sanitization**: Cleans URL parameters

## 📁 Directory Listings

When accessing a directory without an `index.html` file, HTTPath generates a clean, navigable listing:

- **Sorted Display**: Directories first, then files alphabetically  
- **Parent Navigation**: Easy ".." links to go up directories
- **File Type Icons**: Visual indicators for different file types
- **Responsive Design**: Works well on mobile devices

## 🎯 Supported MIME Types

HTTPath automatically detects and serves files with correct content types:

| Extension | MIME Type |
|-----------|-----------|
| `.html`, `.htm` | `text/html` |
| `.js`, `.mjs` | `text/javascript` |
| `.css` | `text/css` |
| `.json` | `application/json` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.svg` | `image/svg+xml` |
| `.txt` | `text/plain` |
| `.pdf` | `application/pdf` |
| `.woff`, `.woff2` | `font/woff`, `font/woff2` |

And many more...

## 🔧 Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/MetalbolicX/httpath.git
cd httpath

# Install dependencies
npm install

# Build the project
npm run build

# Test locally
npm start
```

### Project Structure

```
httpath/
├── src/
│   └── index.mts          # Main server implementation
├── test/                  # Test files and examples
├── dist/                  # Built output (CJS + ESM)
├── package.json
└── tsdown.config.mjs      # Build configuration
```

## 🧪 Testing

The project includes comprehensive tests for:

- Static file serving
- MIME type detection
- Directory traversal protection
- Hot-reload functionality
- CLI argument parsing

Run tests:
```bash
npm test
```

## 📋 Requirements

- **Node.js** >= 18.0.0
- **Operating System**: Windows, macOS, Linux

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

Released under [MIT License](LICENSE) by [@MetalbolicX](https://github.com/MetalbolicX).

## 🔗 Related Projects

- [live-server](https://github.com/tapio/live-server) - Live reloading for development
- [http-server](https://github.com/http-party/http-server) - Simple HTTP server
- [serve](https://github.com/vercel/serve) - Static file serving and directory listing

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/MetalbolicX">José Martínez Santana</a>
</div>