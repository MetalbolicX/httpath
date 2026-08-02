// retest.env.js — loaded by retest BEFORE any test modules.
// Stubs process.exit so the test runner survives.
import "./tests/unit/process_fake.mjs";
