import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./avatar.html", import.meta.url), "utf8");
const editor = readFileSync(new URL("./avatar-editor.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./avatar-v8.css", import.meta.url), "utf8");
const card = readFileSync(new URL("./rj-card.js", import.meta.url), "utf8");
const cardEditor = readFileSync(new URL("./card-edit.js", import.meta.url), "utf8");

assert.ok(html.indexOf("avatar-v8.js") < html.indexOf("rj-card.js"), "shared card renderer loads after the v8 engine");
assert.match(html, /data-mode="logo"/);
assert.match(html, /data-mode="character"/);
assert.match(html, /匿名也能完整试玩/);
assert.doesNotMatch(editor, /display_name\s*:/, "avatar editor never writes an account nickname");
assert.match(editor, /API\.patch\("\/api\/me\/card"/);
assert.match(editor, /API\.get\("\/api\/me\/card"\)/, "successful saves are read back from the server");
assert.match(editor, /me\.kind !== "machine"/, "human sessions remain play-only");
assert.match(editor, /catalogCompatible/, "saving requires the server avatar catalogue version");
assert.match(editor, /state\.ownLoaded = !!\(own\.ok/, "saving stays disabled until the existing avatar is known");
assert.match(editor, /sameActive\(expected, actual\)/, "save receipts compare the frozen active DTO with the server readback");
assert.match(editor, /这里不会自动重复保存/, "unknown save outcomes recover through readback without a blind retry");
assert.doesNotMatch(editor, /原头像没有被替换/, "ambiguous writes are never reported as known failures");
// Focus visibility depends on the current viewport and sticky preview; native
// keyboard acceptance covers it instead of matching a particular focus call.
assert.match(editor, /data-avatar-presets.*state\.presetsOpen/, "the preset disclosure keeps its open state across pagination redraws");
assert.match(editor, /rj-identity-change/, "cross-tab identity changes are fenced");
assert.match(editor, /sessionGeneration/, "identity fencing follows the shared API selector generation");
assert.match(editor, /tokenCurrent\(token\)/, "late async responses cannot repopulate a cleared identity");
assert.match(editor, /V8\.supportsPaws\(state\.character\.species\)/, "unsupported sea species do not receive a paws control");
assert.match(editor, /getBoundingClientRect\(\)\.top/, "compact preview follows the real workbench scroll position");
// Native short-viewport acceptance checks unobscured controls and visible save
// feedback; keep layout freedom instead of asserting one exact grid declaration.
assert.match(css, /min-height:44px/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(card, /a\.mode === "character" && a\.character/, "the shared card renderer honors active character mode");
assert.match(cardEditor, /C\.link\("avatar\.html"\)/, "the legacy card editor routes avatar work into the unified editor");
assert.doesNotMatch(cardEditor, /dirty\.avatar/, "the legacy card editor cannot overwrite the resting logo recipe or active mode");

console.log("avatar page integration contract: ok");
