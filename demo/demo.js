// HTTPath Demo Interactive JavaScript

let requestCount = 0;
let colorIndex = 0;
const colors = [
  '#667eea',
  '#4CAF50',
  '#ff9800',
  '#e91e63',
  '#9c27b0',
  '#3f51b5',
  '#00bcd4',
  '#009688'
];

// Initialize demo when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('🎮 HTTPath Demo JavaScript loaded');

  // Set up event listeners
  setupEventListeners();

  // Start request counter (simulated)
  startRequestCounter();

  // Check for hot-reload functionality
  detectHotReload();

  // Initialize dynamic features
  initializeDynamicFeatures();
});

function setupEventListeners() {
  // Change theme color button
  const changeColorBtn = document.getElementById('changeColorBtn');
  if (changeColorBtn) {
    changeColorBtn.addEventListener('click', changeThemeColor);
  }

  // Add dynamic element button
  const addElementBtn = document.getElementById('addElementBtn');
  if (addElementBtn) {
    addElementBtn.addEventListener('click', addDynamicElement);
  }

  // Fetch JSON data button
  const fetchDataBtn = document.getElementById('fetchDataBtn');
  if (fetchDataBtn) {
    fetchDataBtn.addEventListener('click', fetchJsonData);
  }

  // Test hot-reload button
  const testReloadBtn = document.getElementById('testReloadBtn');
  if (testReloadBtn) {
    testReloadBtn.addEventListener('click', testHotReload);
  }
}

function changeThemeColor() {
  const root = document.documentElement;
  const newColor = colors[colorIndex % colors.length];

  root.style.setProperty('--primary-color', newColor);

  // Update status
  updateDemoResults(`🎨 Theme color changed to: ${newColor}`);

  colorIndex++;

  // Animate the button
  const btn = document.getElementById('changeColorBtn');
  if (btn) {
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
      btn.style.transform = 'scale(1)';
    }, 150);
  }
}

function addDynamicElement() {
  const demoResults = document.getElementById('demoResults');
  if (!demoResults) return;

  const timestamp = new Date().toLocaleTimeString();

  const newElement = document.createElement('div');
  newElement.className = 'dynamic-element';
  newElement.style.cssText = `
    background: linear-gradient(45deg, var(--primary-color), var(--secondary-color));
    color: white;
    padding: 16px;
    margin: 12px 0;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    animation: slideIn 0.5s ease-out;
    position: relative;
    overflow: hidden;
  `;

  newElement.innerHTML = `
    <div style="position: relative; z-index: 1;">
      <strong>🎯 Dynamic Element #${document.querySelectorAll('.dynamic-element').length + 1}</strong>
      <br>
      <small>Created at: ${timestamp}</small>
      <button onclick="this.parentElement.parentElement.remove()"
              style="float: right; background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
        ✕
      </button>
    </div>
    <div style="position: absolute; top: -50%; right: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); pointer-events: none;"></div>
  `;

  // Add CSS animation keyframes if not already added
  if (!document.getElementById('dynamic-styles')) {
    const style = document.createElement('style');
    style.id = 'dynamic-styles';
    style.textContent = `
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(-100%); }
        to { opacity: 1; transform: translateX(0); }
      }
      .dynamic-element:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }

  demoResults.appendChild(newElement);

  updateDemoResults(`✨ Added new dynamic element at ${timestamp}`);

  // Scroll to the new element
  newElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function fetchJsonData() {
  updateDemoResults('🔄 Fetching JSON data...');

  try {
    // Try to fetch sample data (create if doesn't exist)
    let response = await fetch('./sample-data.json');

    if (!response.ok) {
      // If sample-data.json doesn't exist, create sample data
      const sampleData = {
        message: "Hello from HTTPath!",
        timestamp: new Date().toISOString(),
        server: "HTTPath Demo Server",
        features: [
          "Static file serving",
          "Hot-reload functionality",
          "Directory indexing",
          "MIME type detection",
          "Security features"
        ],
        stats: {
          requestsServed: Math.floor(Math.random() * 1000) + 100,
          uptime: "2h 15m 30s",
          memoryUsage: "45.2 MB"
        }
      };

      displayJsonData(sampleData, 'Generated sample data (sample-data.json not found)');
      return;
    }

    const data = await response.json();
    displayJsonData(data, 'Successfully fetched JSON data');

  } catch (error) {
    console.error('Fetch error:', error);
    updateDemoResults(`❌ Error fetching JSON: ${error.message}`);
  }
}

function displayJsonData(data, message) {
  const demoResults = document.getElementById('demoResults');
  if (!demoResults) return;

  const jsonDisplay = document.createElement('div');
  jsonDisplay.style.cssText = `
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 20px;
    border-radius: 8px;
    margin: 16px 0;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.9rem;
    line-height: 1.5;
    overflow-x: auto;
    border: 1px solid var(--border-color);
  `;

  jsonDisplay.innerHTML = `
    <div style="color: var(--accent-color); margin-bottom: 12px; font-weight: bold;">
      📄 ${message}
    </div>
    <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${JSON.stringify(data, null, 2)}</pre>
  `;

  demoResults.appendChild(jsonDisplay);
  updateDemoResults(`✅ ${message}`);
}

function testHotReload() {
  const reloadInfo = document.getElementById('reloadInfo');
  if (!reloadInfo) return;

  reloadInfo.classList.add('show');
  reloadInfo.innerHTML = `
    <div style="color: var(--primary-color); font-weight: 600; margin-bottom: 8px;">
      🔄 Hot-Reload Test Instructions:
    </div>
    <ol style="margin-left: 20px; line-height: 1.6;">
      <li>Make sure the server is running with <code>--reload</code> flag</li>
      <li>Edit any file in the served directory (try changing this HTML file)</li>
      <li>Save the file</li>
      <li>Watch the browser automatically refresh!</li>
    </ol>
    <div style="margin-top: 12px; padding: 8px; background: var(--accent-color); color: white; border-radius: 4px; font-size: 0.9rem;">
      💡 Tip: Try adding a comment or changing some text in the HTML to see it in action!
    </div>
  `;
}

function updateDemoResults(message) {
  const demoResults = document.getElementById('demoResults');
  if (!demoResults) return;

  const messageElement = document.createElement('div');
  messageElement.style.cssText = `
    padding: 12px;
    margin: 8px 0;
    background: var(--accent-color);
    color: white;
    border-radius: 6px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `;
  messageElement.textContent = message;

  // Insert at the beginning
  demoResults.insertBefore(messageElement, demoResults.firstChild);

  // Remove old messages if there are too many
  const messages = demoResults.querySelectorAll('div');
  if (messages.length > 5) {
    messages[messages.length - 1].remove();
  }
}

function startRequestCounter() {
  const requestCountElement = document.getElementById('requestCount');
  if (!requestCountElement) return;

  // Simulate request counting
  const updateCount = () => {
    requestCount += Math.floor(Math.random() * 3) + 1;
    requestCountElement.textContent = requestCount.toLocaleString();
  };

  // Initial count
  requestCount = Math.floor(Math.random() * 50) + 10;
  updateCount();

  // Update every few seconds
  setInterval(updateCount, 3000 + Math.random() * 2000);
}

function detectHotReload() {
  // Check if hot-reload script is injected
  const scripts = Array.from(document.scripts);
  const hasReloadScript = scripts.some(script =>
    script.textContent && script.textContent.includes('/__reload__')
  );

  if (hasReloadScript) {
    console.log('🔄 Hot-reload detected and active!');

    // Add visual indicator
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--accent-color);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      z-index: 1000;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      animation: slideIn 0.5s ease-out;
    `;
    indicator.innerHTML = '🔄 Hot-Reload Active';
    document.body.appendChild(indicator);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      indicator.style.opacity = '0';
      setTimeout(() => indicator.remove(), 300);
    }, 5000);
  }
}

function initializeDynamicFeatures() {
  // Add some interactive hover effects
  const featureCards = document.querySelectorAll('.feature-card');
  featureCards.forEach((card, index) => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-8px) rotateZ(0.5deg)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0) rotateZ(0deg)';
    });
  });

  // Add click effects to demo links
  const demoLinks = document.querySelectorAll('.demo-link');
  demoLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      // Add ripple effect
      const ripple = document.createElement('span');
      const rect = link.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255,255,255,0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
      `;

      if (!document.getElementById('ripple-styles')) {
        const style = document.createElement('style');
        style.id = 'ripple-styles';
        style.textContent = `
          @keyframes ripple {
            to { transform: scale(2); opacity: 0; }
          }
          .demo-link { position: relative; overflow: hidden; }
        `;
        document.head.appendChild(style);
      }

      link.style.position = 'relative';
      link.style.overflow = 'hidden';
      link.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  });
}

// Utility functions
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case '1':
        e.preventDefault();
        changeThemeColor();
        break;
      case '2':
        e.preventDefault();
        addDynamicElement();
        break;
      case '3':
        e.preventDefault();
        fetchJsonData();
        break;
    }
  }
});

// Performance monitoring
if (typeof PerformanceObserver !== 'undefined') {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'navigation') {
        console.log(`Page load time: ${entry.loadEventEnd - entry.fetchStart}ms`);
      }
    }
  });
  observer.observe({ entryTypes: ['navigation'] });
}

// Export functions for global access
window.HTTPathDemo = {
  changeThemeColor,
  addDynamicElement,
  fetchJsonData,
  testHotReload,
  updateDemoResults
};

console.log('✅ HTTPath Demo fully initialized');
