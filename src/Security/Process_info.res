// src/Security/Process_info.res — injectable process info (uid, platform, cwd).
// Used by ProtectedDir to avoid direct process.* external coupling in tests.

@val external getuid: unit => int = "process.getuid"
@val external platform: string = "process.platform"
@val external cwd: unit => string = "process.cwd"
