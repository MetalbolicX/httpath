// src/Utils/Logger.res — minimal logger for the watcher module.
// Supports Json (default) and Plain modes via setMode/getMode.
// In Json mode, emits one JSON object per line to stderr with
// ts (ISO8601), level, msg, and optional request_id.
// In Plain mode, emits the legacy [ts] LEVEL  msg format.

type logLevel = Info | Debug | Error

type mode = Json | Plain

let currentLevel: ref<logLevel> = ref(Info)

let currentMode: ref<mode> = ref(Json)

let setLevel = (level: logLevel) => {
  currentLevel := level
}

let setMode = (m: mode) => {
  currentMode := m
}

let getMode = (): mode => currentMode.contents

let getLevel = (): logLevel => currentLevel.contents

let levelToStr = (level: logLevel): string => {
  switch level {
  | Info => "info"
  | Debug => "debug"
  | Error => "error"
  }
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
    switch currentMode.contents {
    | Plain => {
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
    | Json => {
        let ts = Date.make()->Date.toISOString
        // Hand-roll JSON: a flat object with ts/level/msg. msg is sanitized by JSON.stringify.
        let sanitizedMsg = msg->String.replaceAll("\\", "\\\\")->String.replaceAll("\"", "\\\"")->String.replaceAll("\n", "\\n")
        let line = `{"ts":"${ts}","level":"${levelToStr(level)}","msg":"${sanitizedMsg}"}`
        switch level {
        | Error => Console.error(line)
        | _ => Console.log(line)
        }
      }
    }
  }
}
