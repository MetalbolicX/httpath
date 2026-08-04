#!/usr/bin/env node
// bin.mjs — CLI entrypoint for httpath.
// Invokes Httpath.main() which parses Process.argv and runs the full lifecycle.

import { main } from "./src/Httpath.res.mjs";

main();
