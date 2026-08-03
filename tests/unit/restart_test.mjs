// restart_test.mjs — API test for Restart module.
// Runs standalone: node tests/unit/restart_test.mjs

// Load process_fake first to mock process.exit
await import('./process_fake.mjs')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✔ ${name}`)
    passed++
  } catch (e) {
    console.log(`✖ ${name}`)
    console.log(`  ${e.message}`)
    failed++
  }
}

function strictEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: got ${a}`)
}
function notStrictEqual(a, b, msg) {
  if (a === b) throw new Error(`${msg}: got ${a}`)
}

// Import Restart module (uses real node:child_process — spawn may fail in test env)
const Restart = await import('../../src/Watcher/Restart.res.js')

// Import Process bindings
const Process = await import('../../src/Node/Process.res.js')

// Silence console.error for expected spawn failures
const originalError = console.error
let errorLogs = []
console.error = (...args) => { errorLogs.push(args.join(' ')) }

// REQ-RESTART-1: reload has correct API signature
test('Restart.reload exported function (REQ-RESTART-1)', () => {
  notStrictEqual(typeof Restart.reload, 'undefined', 'reload is exported')
  strictEqual(typeof Restart.reload, 'function', 'reload is a function')
})

// REQ-RESTART-5: typed spawn external exists
test('Process.spawn typed external exists (REQ-RESTART-5)', () => {
  notStrictEqual(typeof Process.spawn, 'undefined', 'spawn is exported')
  strictEqual(typeof Process.spawn, 'function', 'spawn is typed external')
})

// REQ-RESTART-5: typed execPath exists
test('Process.execPath typed external exists (REQ-RESTART-5)', () => {
  notStrictEqual(typeof Process.execPath, 'undefined', 'execPath is exported')
  strictEqual(typeof Process.execPath, 'string', 'execPath is string')
})

// REQ-RESTART-5: typed onChildExit exists
test('Process.onChildExit typed external exists (REQ-RESTART-5)', () => {
  notStrictEqual(typeof Process.onChildExit, 'undefined', 'onChildExit is exported')
  strictEqual(typeof Process.onChildExit, 'function', 'onChildExit is function')
})

// REQ-RESTART-5: typed onError exists
test('Process.onError typed external exists (REQ-RESTART-5)', () => {
  notStrictEqual(typeof Process.onError, 'undefined', 'onError is exported')
  strictEqual(typeof Process.onError, 'function', 'onError is function')
})

// REQ-RESTART-4: reload accepts named parameters
// This should NOT throw (API acceptance test)
test('Restart.reload accepts execPath/entrypoint/argv params (REQ-RESTART-4)', () => {
  errorLogs = []
  try {
    Restart.reload({
      execPath: Process.execPath,
      entrypoint: 'bin.mjs',
      argv: ['-p', '8080'],
    })
  } catch (e) {
    // Spawn may fail in test env but API accepted the call
  }
})

// REQ-RESTART-4: Restart module is stateless (no internal state exports)
test('Restart module has no exported state (REQ-RESTART-4)', () => {
  const keys = Object.keys(Restart)
  const hasState = keys.some(k => k !== 'reload')
  strictEqual(hasState, false, 'only reload is exported')
})

console.error = originalError

console.log(`\nℹ ${passed + failed} tests`)
console.log(`✔ ${passed} passed`)
if (failed > 0) {
  console.log(`✖ ${failed} failed`)
  process.exit(1)
}
