import {
  shouldIgnoreEvent,
  shouldRestartServer,
  shouldTriggerBrowserReload,
} from "../src/watcher/rules.mts";
import { assertEquals } from "@std/assert";

Deno.test("shouldIgnoreEvent: .git path returns true", () => {
  const event = {
    kind: "modify",
    paths: ["/project/.git/config"],
  } as Deno.FsEvent;
  assertEquals(shouldIgnoreEvent(event, [".git"]), true);
});

Deno.test("shouldIgnoreEvent: node_modules path returns true", () => {
  const event = {
    kind: "modify",
    paths: ["/project/node_modules/package/index.js"],
  } as Deno.FsEvent;
  assertEquals(shouldIgnoreEvent(event, ["node_modules"]), true);
});

Deno.test("shouldIgnoreEvent: regular file returns false", () => {
  const event = {
    kind: "modify",
    paths: ["/project/src/index.ts"],
  } as Deno.FsEvent;
  assertEquals(shouldIgnoreEvent(event, [".git", "node_modules"]), false);
});

Deno.test("shouldIgnoreEvent: matches partial string in path", () => {
  const event = {
    kind: "modify",
    paths: ["/project/.gitignore"],
  } as Deno.FsEvent;
  assertEquals(shouldIgnoreEvent(event, [".git"]), true);
});

Deno.test("shouldIgnoreEvent: .DS_Store path returns true", () => {
  const event = {
    kind: "modify",
    paths: ["/project/.DS_Store"],
  } as Deno.FsEvent;
  assertEquals(shouldIgnoreEvent(event, [".DS_Store"]), true);
});

Deno.test("shouldRestartServer: deno.json returns true", () => {
  assertEquals(shouldRestartServer(["/project/deno.json"]), true);
});

Deno.test("shouldRestartServer: deno.lock returns true", () => {
  assertEquals(shouldRestartServer(["/project/deno.lock"]), true);
});

Deno.test("shouldRestartServer: package.json returns true", () => {
  assertEquals(shouldRestartServer(["/project/package.json"]), true);
});

Deno.test("shouldRestartServer: .ts file returns true", () => {
  assertEquals(shouldRestartServer(["/project/src/server.ts"]), true);
});

Deno.test("shouldRestartServer: .js file returns true", () => {
  assertEquals(shouldRestartServer(["/project/src/app.js"]), true);
});

Deno.test("shouldRestartServer: .json file returns true", () => {
  assertEquals(shouldRestartServer(["/project/data.json"]), true);
});

Deno.test("shouldRestartServer: .toml file returns true", () => {
  assertEquals(shouldRestartServer(["/project/config.toml"]), true);
});

Deno.test("shouldRestartServer: .yaml file returns true", () => {
  assertEquals(shouldRestartServer(["/project/config.yaml"]), true);
});

Deno.test("shouldRestartServer: .yml file returns true", () => {
  assertEquals(shouldRestartServer(["/project/config.yml"]), true);
});

Deno.test("shouldRestartServer: .html file returns false", () => {
  assertEquals(shouldRestartServer(["/project/index.html"]), false);
});

Deno.test("shouldRestartServer: .css file returns false", () => {
  assertEquals(shouldRestartServer(["/project/style.css"]), false);
});

Deno.test("shouldTriggerBrowserReload: .html file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/index.html"]), true);
});

Deno.test("shouldTriggerBrowserReload: .htm file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/index.htm"]), true);
});

Deno.test("shouldTriggerBrowserReload: .css file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/style.css"]), true);
});

Deno.test("shouldTriggerBrowserReload: .scss file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/style.scss"]), true);
});

Deno.test("shouldTriggerBrowserReload: .sass file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/style.sass"]), true);
});

Deno.test("shouldTriggerBrowserReload: .less file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/style.less"]), true);
});

Deno.test("shouldTriggerBrowserReload: .js file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/app.js"]), true);
});

Deno.test("shouldTriggerBrowserReload: .jsx file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/App.jsx"]), true);
});

Deno.test("shouldTriggerBrowserReload: .ts file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/app.ts"]), true);
});

Deno.test("shouldTriggerBrowserReload: .tsx file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/App.tsx"]), true);
});

Deno.test("shouldTriggerBrowserReload: .vue file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/App.vue"]), true);
});

Deno.test("shouldTriggerBrowserReload: .svelte file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/App.svelte"]), true);
});

Deno.test("shouldTriggerBrowserReload: .md file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/README.md"]), true);
});

Deno.test("shouldTriggerBrowserReload: .png file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/image.png"]), true);
});

Deno.test("shouldTriggerBrowserReload: .jpg file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/photo.jpg"]), true);
});

Deno.test("shouldTriggerBrowserReload: .jpeg file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/photo.jpeg"]), true);
});

Deno.test("shouldTriggerBrowserReload: .gif file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/anim.gif"]), true);
});

Deno.test("shouldTriggerBrowserReload: .svg file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/icon.svg"]), true);
});

Deno.test("shouldTriggerBrowserReload: .webp file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/icon.webp"]), true);
});

Deno.test("shouldTriggerBrowserReload: .ico file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/favicon.ico"]), true);
});

Deno.test("shouldTriggerBrowserReload: .woff file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/font.woff"]), true);
});

Deno.test("shouldTriggerBrowserReload: .woff2 file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/font.woff2"]), true);
});

Deno.test("shouldTriggerBrowserReload: .ttf file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/font.ttf"]), true);
});

Deno.test("shouldTriggerBrowserReload: .eot file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/font.eot"]), true);
});

Deno.test("shouldTriggerBrowserReload: .json file returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/data.json"]), true);
});

Deno.test("shouldTriggerBrowserReload: deno.json returns true", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/deno.json"]), true);
});

Deno.test("shouldTriggerBrowserReload: .py file returns false", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/script.py"]), false);
});

Deno.test("shouldTriggerBrowserReload: .go file returns false", () => {
  assertEquals(shouldTriggerBrowserReload(["/project/main.go"]), false);
});
