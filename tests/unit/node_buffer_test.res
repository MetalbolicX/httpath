open Test

test("Buffer.length returns correct byte length", () => {
  let buf = Buffer.fromString("hello", "utf8")
  assertion(
    ~message="length of 'hello' is 5",
    ~operator="=",
    (a, b) => a == b,
    Buffer.length(buf),
    5,
  )
})

test("Buffer.concat of single buffer returns identical bytes", () => {
  let original = Buffer.fromString("hello", "utf8")
  let combined = Buffer.concat([original])
  let i = ref(0)
  let pass = ref(true)
  while i.contents < 5 {
    let expected = Buffer.readUInt8(original, i.contents)
    let actual = Buffer.readUInt8(combined, i.contents)
    if expected != actual {
      pass := false
    }
    i.contents = i.contents + 1
  }
  assertion(
    ~message="concat identity preserves all 5 bytes",
    ~operator="=",
    (a, b) => a == b,
    pass.contents,
    true,
  )
})

test("Buffer.fromString round-trip via readUInt8 recovers correct bytes", () => {
  let buf = Buffer.fromString("reload", "utf8")
  // "reload" = [114, 101, 108, 111, 97, 100] in ASCII/UTF-8
  let expected = [114, 101, 108, 111, 97, 100]
  let i = ref(0)
  let pass = ref(true)
  while i.contents < 6 {
    let exp = switch expected[i.contents] {
    | Some(v) => v
    | None => -1
    }
    let act = Buffer.readUInt8(buf, i.contents)
    if exp != act {
      pass := false
    }
    i.contents = i.contents + 1
  }
  assertion(
    ~message="fromString round-trip via readUInt8 recovers [114,101,108,111,97,100]",
    ~operator="=",
    (a, b) => a == b,
    pass.contents,
    true,
  )
})
