// Test JavaScript file for HTTPath server
console.log('🚀 HTTPath JavaScript test file loaded successfully!');

// Test basic JavaScript functionality
function testBasicFeatures() {
    console.log('Testing basic JavaScript features...');

    // Test variables and functions
    const serverName = 'HTTPath';
    const version = '0.1.0';

    console.log(`Server: ${serverName} v${version}`);

    // Test DOM manipulation if in browser
    if (typeof document !== 'undefined') {
        const testDiv = document.createElement('div');
        testDiv.innerHTML = '✅ JavaScript execution test passed!';
        testDiv.style.cssText = `
            background: #4CAF50;
            color: white;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            text-align: center;
        `;
        document.body.appendChild(testDiv);

        // Add timestamp
        const timestamp = document.createElement('p');
        timestamp.textContent = `Loaded at: ${new Date().toLocaleString()}`;
        timestamp.style.cssText = 'text-align: center; color: #666; font-size: 0.9em;';
        document.body.appendChild(timestamp);
    }

    return true;
}

// Test async functionality
async function testAsyncFeatures() {
    console.log('Testing async functionality...');

    // Simulate async operation
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    await delay(100);
    console.log('✅ Async test completed');

    // Test fetch if available (browser environment)
    if (typeof fetch !== 'undefined') {
        try {
            const response = await fetch('./test.json');
            if (response.ok) {
                const data = await response.json();
                console.log('✅ JSON fetch test:', data);
            }
        } catch (error) {
            console.log('ℹ️ JSON fetch test skipped (file not found)');
        }
    }
}

// Test hot-reload detection
function testHotReload() {
    if (typeof EventSource !== 'undefined') {
        console.log('✅ Hot-reload capability detected');

        // Check if hot-reload script is already injected
        const scripts = Array.from(document.scripts || []);
        const hasReloadScript = scripts.some(script =>
            script.textContent.includes('/__reload__')
        );

        if (hasReloadScript) {
            console.log('🔄 Hot-reload script is active');
        } else {
            console.log('ℹ️ Hot-reload script not detected (may not be enabled)');
        }
    } else {
        console.log('ℹ️ EventSource not available (not in browser?)');
    }
}

// MIME type test helper
function testMimeType() {
    if (typeof document !== 'undefined') {
        console.log('Current script MIME type should be: text/javascript');
        console.log('Document content type:', document.contentType);
    }
}

// Performance test
function performanceTest() {
    const start = performance.now();

    // Simple computation
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
        sum += i;
    }

    const end = performance.now();
    console.log(`Performance test: ${(end - start).toFixed(2)}ms for 10k iterations`);
}

// Main test runner
function runAllTests() {
    console.log('='.repeat(50));
    console.log('🧪 Running HTTPath JavaScript Tests');
    console.log('='.repeat(50));

    try {
        testBasicFeatures();
        testAsyncFeatures();
        testHotReload();
        testMimeType();
        performanceTest();

        console.log('='.repeat(50));
        console.log('✅ All tests completed successfully!');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Auto-run tests when loaded
if (typeof window !== 'undefined') {
    // Browser environment
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runAllTests);
    } else {
        runAllTests();
    }
} else {
    // Node.js environment
    runAllTests();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        testBasicFeatures,
        testAsyncFeatures,
        testHotReload,
        testMimeType,
        performanceTest,
        runAllTests
    };
}
