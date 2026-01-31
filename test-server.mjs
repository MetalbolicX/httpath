#!/usr/bin/env node

// Comprehensive test script to validate HTTPath server functionality
import { spawn } from "child_process";
import { readFile, access } from "fs/promises";
import { join } from "path";

const SERVER_PORT = 8081;
const TEST_TIMEOUT = 15000;

console.log("🧪 HTTPath Server Test Suite");
console.log("=".repeat(50));
console.log(`📅 Started at: ${new Date().toLocaleString()}`);
console.log(`🔧 Node.js version: ${process.version}`);
console.log("=".repeat(50));

// Test configuration
const tests = [
  {
    name: "Basic Server Start",
    description: "Start server without hot-reload",
    args: ["--port", SERVER_PORT.toString(), "--path", "test"],
    expectedOutput: ["Server running", "Serving files from"],
    timeout: 8000,
  },
  {
    name: "Hot-reload Server Start",
    description: "Start server with hot-reload enabled",
    args: [
      "--port",
      (SERVER_PORT + 1).toString(),
      "--path",
      "test",
      "--reload",
    ],
    expectedOutput: [
      "Server running",
      "Hot-reload enabled",
      "Hot-reload watching",
    ],
    timeout: 8000,
  },
  {
    name: "Custom Port and Path",
    description: "Start server with custom configuration",
    args: ["--port", (SERVER_PORT + 2).toString(), "--path", "demo"],
    expectedOutput: ["Server running", "Serving files from"],
    timeout: 6000,
  },
];

async function runServerTest(test) {
  return new Promise((resolve) => {
    console.log(`\n🔧 Running: ${test.name}`);
    console.log(`   📋 ${test.description}`);
    console.log(`   🔧 Command: node dist/index.mjs ${test.args.join(" ")}`);

    const startTime = Date.now();
    const server = spawn("node", ["dist/index.mjs", ...test.args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";
    let passed = false;

    // Collect output
    server.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(`   📝 ${text}`);
    });

    server.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stdout.write(`   ⚠️  ${text}`);
    });

    // Check if test passes
    const checkOutput = () => {
      const combinedOutput = (output + errorOutput).toLowerCase();
      const foundOutputs = test.expectedOutput.map((expected) => ({
        expected,
        found: combinedOutput.includes(expected.toLowerCase()),
      }));

      const allExpected = foundOutputs.every((item) => item.found);

      if (allExpected && !passed) {
        passed = true;
        const duration = Date.now() - startTime;
        console.log(
          `   ✅ Test passed in ${duration}ms: All expected output found`,
        );

        // Show which outputs were found
        foundOutputs.forEach((item) => {
          console.log(`      ✓ "${item.expected}" - found`);
        });

        // Kill server after success
        setTimeout(() => {
          server.kill("SIGINT");
        }, 1000);
      }
    };

    // Monitor output
    const outputCheck = setInterval(checkOutput, 500);

    // Handle server exit
    server.on("close", (code) => {
      clearInterval(outputCheck);
      const duration = Date.now() - startTime;

      if (!passed) {
        console.log(
          `   ❌ Test failed after ${duration}ms: Expected output not found`,
        );
        console.log(`   💭 Expected outputs:`);
        test.expectedOutput.forEach((expected) => {
          const found = (output + errorOutput)
            .toLowerCase()
            .includes(expected.toLowerCase());
          console.log(`      ${found ? "✓" : "✗"} "${expected}"`);
        });
        console.log(`   📄 Actual output (first 300 chars):`);
        console.log(
          `      "${(output + errorOutput).slice(0, 300).replace(/\n/g, "\\n")}..."`,
        );
        if (code !== 0) {
          console.log(`   🚨 Process exited with code: ${code}`);
        }
      }

      resolve({
        name: test.name,
        passed,
        output: output + errorOutput,
        duration,
        exitCode: code,
      });
    });

    // Handle server errors
    server.on("error", (error) => {
      console.log(`   💥 Server process error: ${error.message}`);
      clearInterval(outputCheck);
      resolve({
        name: test.name,
        passed: false,
        output: `Error: ${error.message}`,
        duration: Date.now() - startTime,
        exitCode: -1,
      });
    });

    // Timeout handler
    setTimeout(() => {
      if (!passed) {
        console.log(`   ⏱️  Test timeout after ${test.timeout}ms`);
        console.log(
          `   🔍 Output so far: "${(output + errorOutput).slice(0, 200)}..."`,
        );
        server.kill("SIGTERM");
        // Force kill if SIGTERM doesn't work
        setTimeout(() => {
          if (!server.killed) {
            console.log(`   💀 Force killing process`);
            server.kill("SIGKILL");
          }
        }, 2000);
      }
    }, test.timeout);
  });
}

async function validatePrerequisites() {
  console.log("\n🔍 Checking Prerequisites");

  const checks = [
    { name: "dist/index.mjs exists", path: "dist/index.mjs" },
    { name: "test directory exists", path: "test" },
    { name: "demo directory exists", path: "demo" },
  ];

  let allValid = true;

  for (const check of checks) {
    try {
      await access(check.path);
      console.log(`   ✅ ${check.name}`);
    } catch (error) {
      console.log(`   ❌ ${check.name} - ${error.message}`);
      allValid = false;
    }
  }

  return allValid;
}

async function validateBuildOutput() {
  console.log("\n📦 Validating Build Output");

  try {
    // Check if dist files exist
    const mjsContent = await readFile(
      join(process.cwd(), "dist/index.mjs"),
      "utf8",
    );
    const cjsContent = await readFile(
      join(process.cwd(), "dist/index.cjs"),
      "utf8",
    );

    const requiredFeatures = [
      "createServer",
      "EventEmitter",
      "parseArgs",
      "createReadStream",
      "text/html",
      "__reload__",
    ];

    let mjsPassed = 0;
    let cjsPassed = 0;

    requiredFeatures.forEach((feature) => {
      if (mjsContent.includes(feature)) mjsPassed++;
      if (cjsContent.includes(feature)) cjsPassed++;
    });

    console.log(
      `   📄 ESM build: ${mjsPassed}/${requiredFeatures.length} features found`,
    );
    console.log(
      `   📄 CJS build: ${cjsPassed}/${requiredFeatures.length} features found`,
    );

    // Check for Result pattern implementation
    const resultPatternFeatures = [
      "success:",
      "failure:",
      "Result<",
      "isSuccess",
    ];

    let resultPatternFound = 0;
    resultPatternFeatures.forEach((feature) => {
      if (mjsContent.includes(feature)) resultPatternFound++;
    });

    console.log(
      `   🔄 Result pattern: ${resultPatternFound}/${resultPatternFeatures.length} features found`,
    );

    if (
      mjsPassed === requiredFeatures.length &&
      cjsPassed === requiredFeatures.length &&
      resultPatternFound >= 3
    ) {
      console.log("   ✅ Build validation passed");
      return true;
    } else {
      console.log("   ❌ Build validation failed");
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Build validation error: ${error.message}`);
    return false;
  }
}

async function main() {
  const results = [];
  const overallStartTime = Date.now();

  // 0. Check prerequisites
  console.log("Starting HTTPath comprehensive test suite...\n");
  const prereqsValid = await validatePrerequisites();
  if (!prereqsValid) {
    console.log(
      "\n💥 Prerequisites failed. Please build the project and ensure test directories exist.",
    );
    console.log("Run: npm run build");
    process.exit(1);
  }

  // 1. Validate build output
  console.log("\n📦 Validating Build Output...");
  const buildValid = await validateBuildOutput();
  results.push({ name: "Build Validation", passed: buildValid, duration: 0 });

  if (!buildValid) {
    console.log(
      "💥 Build validation failed. Cannot continue with server tests.",
    );
    process.exit(1);
  }

  // 2. Run server tests
  console.log("\n🚀 Running Server Tests...");
  for (const test of tests) {
    const result = await runServerTest(test);
    results.push(result);

    // Wait between tests to avoid port conflicts
    console.log("   ⏱️  Waiting 3 seconds before next test...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // 3. Summary
  const totalDuration = Date.now() - overallStartTime;
  console.log("\n" + "=".repeat(60));
  console.log("📊 Final Test Results Summary");
  console.log("=".repeat(60));

  let passed = 0;
  let total = results.length;

  results.forEach((result) => {
    const status = result.passed ? "✅" : "❌";
    const duration = result.duration ? ` (${result.duration}ms)` : "";
    const exitInfo =
      result.exitCode !== undefined && result.exitCode !== 0
        ? ` [exit: ${result.exitCode}]`
        : "";
    console.log(`${status} ${result.name}${duration}${exitInfo}`);
    if (result.passed) passed++;
  });

  console.log("\n📈 Statistics:");
  console.log(
    `   🎯 Success Rate: ${passed}/${total} (${Math.round((passed / total) * 100)}%)`,
  );
  console.log(`   ⏱️  Total Duration: ${Math.round(totalDuration / 1000)}s`);
  console.log(`   📅 Completed: ${new Date().toLocaleString()}`);

  if (passed === total) {
    console.log("\n🎉 All tests passed! HTTPath server is working correctly.");
    console.log("✨ Ready for production use with Result pattern!");
    process.exit(0);
  } else {
    console.log(
      `\n💥 ${total - passed} test(s) failed. Please check the output above.`,
    );
    console.log("🔧 Try running: npm run build");
    process.exit(1);
  }
}

// Handle cleanup
process.on("SIGINT", () => {
  console.log("\n\n👋 Test suite interrupted");
  process.exit(0);
});

// Run tests
main().catch((error) => {
  console.error("💥 Test suite error:", error);
  process.exit(1);
});
