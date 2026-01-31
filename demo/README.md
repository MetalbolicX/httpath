# HTTPath Demo

This demo showcases all the features of HTTPath, a minimalist Node.js file server with hot-reload capabilities.

## 🚀 Quick Start

1. **Build HTTPath** (if not already built):
   ```bash
   npm run build
   ```

2. **Start the demo server**:
   ```bash
   # Basic server
   node ../dist/index.mjs --path . --port 8080

   # With hot-reload (recommended for demo)
   node ../dist/index.mjs --path . --port 8080 --reload
   ```

3. **Open your browser** and navigate to:
   ```
   http://localhost:8080
   ```

## 📁 Demo Contents

### Files Included

- **`index.html`** - Main demo page with interactive features
- **`styles.css`** - Responsive CSS styles with animations
- **`demo.js`** - Interactive JavaScript functionality
- **`sample-data.json`** - Sample JSON data for AJAX testing
- **`assets/sample.txt`** - Sample text file for MIME type testing
- **`README.md`** - This file

### Features Demonstrated

#### 🎯 Static File Serving
- HTML files with proper content-type headers
- CSS files with `text/css` MIME type
- JavaScript files with `text/javascript` MIME type
- JSON files with `application/json` MIME type
- Text files with `text/plain` MIME type

#### 📂 Directory Indexing
- Browse the `assets/` folder to see directory listing
- Navigate up directories with "../" links
- Clean, responsive directory listing interface

#### 🔄 Hot-Reload (when enabled with `--reload`)
- Edit any HTML, CSS, or JS file
- Save the file
- Watch the browser automatically refresh
- Real-time development experience

#### 🛡️ Security Features
- Try accessing `../../../etc/passwd` - should get 403 Forbidden
- Path traversal attempts are blocked
- Directory escape attempts are prevented

#### ⚡ Interactive Features
- **Theme Changer** - Click "Change Theme Color" to see CSS updates
- **Dynamic Elements** - Add interactive elements to the page
- **JSON Fetching** - Test AJAX requests to JSON files
- **Hot-Reload Testing** - Instructions for testing live reload

## 🧪 Testing Scenarios

### 1. Basic File Serving
```bash
# Start server
node ../dist/index.mjs --path . --port 8080

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

### 3. Hot-Reload Testing
```bash
# Start with hot-reload enabled
node ../dist/index.mjs --path . --port 8080 --reload

# In browser, open http://localhost:8080
# Edit index.html and save - page should auto-refresh
```

### 4. Security Testing
```bash
# These should return 403 Forbidden
curl http://localhost:8080/../../../etc/passwd
curl http://localhost:8080/..%2F..%2Fwindows%2Fsystem32
```

## 📊 Performance Testing

You can test HTTPath's performance with tools like:

```bash
# Apache Bench
ab -n 1000 -c 10 http://localhost:8080/

# curl timing
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8080/
```

## 🎮 Interactive Demo Features

When you visit `http://localhost:8080`, you can:

1. **Change Theme Colors** - See CSS variables update in real-time
2. **Add Dynamic Elements** - Test JavaScript DOM manipulation
3. **Fetch JSON Data** - Demonstrate AJAX capabilities
4. **Test Hot-Reload** - Follow instructions for live development

## 🔧 Customization

### Adding Your Own Files

1. Add any file type to the demo directory
2. HTTPath will automatically serve it with the correct MIME type
3. Supported formats include:
   - Web: `.html`, `.css`, `.js`
   - Images: `.png`, `.jpg`, `.gif`, `.svg`
   - Documents: `.pdf`, `.txt`, `.xml`
   - Fonts: `.woff`, `.woff2`, `.ttf`
   - Archives: `.zip`

### Modifying the Demo

- **Edit `styles.css`** to change the visual appearance
- **Edit `demo.js`** to add new interactive features
- **Edit `index.html`** to modify the content and layout
- **Add new JSON files** for data testing

## 🐛 Troubleshooting

### Port Already in Use
If port 8080 is busy, HTTPath will automatically try 8081, 8082, etc.

### Hot-Reload Not Working
- Ensure you started the server with `--reload` flag
- Check browser console for EventSource connections
- Verify the server shows "Hot-reload enabled" message

### Files Not Loading
- Check file permissions
- Ensure files exist in the demo directory
- Look at server logs for 404 errors

## 💡 Tips

- **Development**: Always use `--reload` flag for active development
- **Testing**: Try different browsers to test compatibility
- **Learning**: Check browser DevTools Network tab to see MIME types
- **Performance**: Monitor memory usage with large files

## 🔗 Related

- [Main HTTPath Documentation](../README.md)
- [Source Code](../src/index.mts)
- [Test Suite](../test/)

---

**HTTPath Demo** - Experience the full power of minimalist file serving!