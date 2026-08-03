// Logger.res — minimal logger for the watcher module.

type logLevel = Info | Debug | Error

let currentLevel: ref<logLevel> = ref(Info)

let setLevel = (level: logLevel) => {
  currentLevel := level
}

let log = (level: logLevel, msg: string) => {
  let levelOk = switch (currentLevel.contents, level) {
  | (Error, Info) => false
  | (Error, Debug) => false
  | (Info, Debug) => false
  | _ => true
  }

  if !levelOk {
    ()
  } else {
    let levelStr = switch level {
    | Info => "INFO"
    | Debug => "DEBUG"
    | Error => "ERROR"
    }
    let d = Date.make()
    let ts = d->Date.toISOString
    let formatted = `[${ts}] ${levelStr}  ${msg}`
    switch level {
    | Error => Console.error(formatted)
    | _ => Console.log(formatted)
    }
  }
}
