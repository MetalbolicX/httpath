# httpath Demo

This demo showcases all the features of httpath, a minimalist static file server
with live-reload capabilities.

## Quick Start

1. **Build httpath** (if not already built):
   ```bash
   pnpm run build
   ```

2. **Start the demo server**:
   ```bash
   # Serve the current directory (live reload is on by default)
   node ../dist/httpath.mjs -d . -p 8080

   # Disable live reload
   node ../dist/httpath.mjs -d . -p 8080 --no-live-reload

   # Or via pnpm (from the repo root, after pnpm install)
   pnpm httpath -d demo -p 8080
   ```

3. **Open your browser** and navigate to:
   ```
   http://localhost:8080
   ```

## Demo Contents

### Files Included

- **`index.html`** — Main demo page with interactive features
- **`styles.css`** — Responsive CSS styles with animations
- **`demo.js`** — Interactive JavaScript functionality
- **`sample-data.json`** — Sample JSON data for testing
- **`assets/`** — Subdirectory for directory listing demo
- **`README.md`** — This file

### Features Demonstrated

#### Static File Serving

- HTML files with proper `text/html` MIME type
- CSS files with `text/css` MIME type
- JavaScript files with `text/javascript` MIME type
- JSON files with `application/json` MIME type
- Text files with `text/plain` MIME type

#### Directory Listing

- Browse the `assets/` folder to see directory listing
- Navigate up directories with `../` links
- Clean, responsive directory listing interface with dark mode

#### Live Reload

Live reload is enabled by default. To test it:

- Start the server: `node ../dist/httpath.mjs -d . -p 8080`
- Open `http://localhost:8080` in your browser
- Edit `index.html` or `styles.css` and save
- The browser automatically refreshes

To disable live reload: `node ../dist/httpath.mjs -d . -p 8080 --no-live-reload`

#### Security Features

- Path traversal attempts (e.g., `../../../etc/passwd`) return 403 Forbidden
- Directory escape attempts are prevented
- Protected system directories are blocked by default

#### Interactive Features

- **Theme Changer** — Click buttons to change the page color scheme
- **Dynamic Elements** — Add and remove interactive elements from the page
- **JSON Fetching** — Test AJAX requests to JSON files
- **Live Reload Testing** — Instructions for testing automatic refresh

## Testing Scenarios

### 1. Basic File Serving

```bash
# Start server
node ../dist/httpath.mjs -d . -p 8080

# Test different file types
curl -I http://localhost:8080/index.html
curl -I http://localhost:8080/styles.css
curl -I http://localhost:8080/demo.js
curl -I http://localhost:8080/sample-data.json
```

### 2. Directory Listing

```bash
# Visit directory without index.html
curl http://localhost:8080/assets/
```

### 3. Live Reload Testing

```bash
# Start with live reload (default)
node ../dist/httpath.mjs -d . -p 8080

# In browser, open http://localhost:8080
# Edit index.html or styles.css and save - page should auto-refresh
```

### 4. Security Testing

```bash
# These should return 403 Forbidden
curl http://localhost:8080/../../../etc/passwd
curl "http://localhost:8080/..%2F..%2F..%2Fetc%2Fpasswd"
```

## CLI Options Used in Demo

| Option                     | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `-d, --dir <path>`         | Directory to serve (default: current directory)  |
| `-p, --port <n>`           | Port to listen on (default: 8080)                |
| `-i, --ignore <patterns>`  | Comma-separated patterns to exclude               |
| `--no-listing`             | Disable directory listing                        |
| `--no-live-reload`         | Disable automatic browser refresh                |
| `-r, --restart-on-change`  | Legacy mode: restart server on any file change   |
| `--log <level>`            | Log level: `info`, `debug`, `error`              |

Full reference: [../README.md](../README.md)

## Customization

### Adding Your Own Files

1. Add any file type to the demo directory
2. httpath automatically serves it with the correct MIME type
3. Supported formats include:
   - Web: `.html`, `.css`, `.js`, `.mjs`
   - Images: `.png`, `.jpg`, `.gif`, `.svg`
   - Documents: `.pdf`, `.txt`, `.xml`, `.json`
   - Fonts: `.woff`, `.woff2`, `.ttf`
   - Archives: `.zip`

### Modifying the Demo

- **Edit `styles.css`** to change the visual appearance
- **Edit `demo.js`** to add new interactive features
- **Edit `index.html`** to modify the content and layout
- **Add new JSON files** for data testing

## Troubleshooting

### Port Already in Use

If port 8080 is busy, specify a different port:

```bash
node ../dist/httpath.mjs -d . -p 3000
```

### Live Reload Not Working

- Live reload is **on by default** — no `--reload` flag needed
- Check the browser console for WebSocket connections
- Verify the server shows live reload is enabled in startup output
- Ensure your files are being served from the correct directory

### Files Not Loading

- Check file permissions
- Ensure files exist in the demo directory
- Look at server logs for 404 errors
- Use `--log debug` for verbose output

## Tips

- **Development**: Live reload is on by default — just edit and save
- **Testing**: Try different browsers to test compatibility
- **Learning**: Check browser DevTools Network tab to see MIME types and headers
- **Performance**: Monitor memory usage with large files

## Related

- [Main httpath Documentation](../README.md)
- [Architecture](../docs/architecture.md)
- [Source Code](../src/)
