// process_fake.mjs — intercepts process.exit so test runner survives.
// Loaded via retest.env.js BEFORE any test modules run.

let lastExitCode = null;

export function processExit(code) {
  lastExitCode = code;
  // Do NOT call real process.exit — let the test runner continue
}

export function getLastExitCode() {
  return lastExitCode;
}

export function resetExitCode() {
  lastExitCode = null;
}

// Replace global process.exit with our recording no-op.
// This runs when this file is imported via retest.env.js,
// BEFORE Process.res.js loads. The compiled Process.exit
// will call this replaced function (property lookup at call time).
process.exit = (code) => {
  lastExitCode = code;
  // Do NOT call original process.exit — don't actually terminate the test runner
};
