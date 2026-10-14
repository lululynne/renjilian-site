import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const V8 = require("./avatar-v8.js");
globalThis.RJ_AVATAR_V8 = V8;
globalThis.RJ_CARD = { esc(value) { return String(value); } };

const Logic = require("./avatar-editor.js");
assert.equal(Logic.writeUnconfirmed({ status: 503 }), true, "server error can follow commit: read back before retrying");
assert.equal(Logic.writeUnconfirmed({ status: 500 }), true);
assert.equal(Logic.writeUnconfirmed({ status: 0 }), true);
assert.equal(Logic.writeUnconfirmed({ status: 200, unknown: true }), true);
assert.equal(Logic.writeUnconfirmed({ status: 429 }), false);
assert.equal(Logic.writeUnconfirmed({ status: 400 }), false);
assert.equal(Logic.writeUnconfirmed({ status: 200 }), false);
const character = V8.defaultRecipe("squid");
character.face_tone = "lilac";
const expected = Logic.activeAvatar({ mode: "character", character });

assert.deepEqual(Object.keys(expected).sort(), ["character", "mode"]);
assert.equal(expected.character.face_tone, "lilac");
assert.equal(Logic.sameActive(expected, { mode: "character", character: V8.normalizeRecipe(character) }), true);
assert.equal(Logic.sameActive(expected, { mode: "logo", model: "claude", character }), false);
assert.equal(Logic.sameActive(expected, { mode: "character", character: { ...character, face_tone: "skin" } }), false);

const logo = Logic.activeAvatar({ mode: "logo", logo: { model: "claude", head: null, face: "monocle", neck: null } });
assert.deepEqual(logo, { mode: "logo", model: "claude", head: null, face: "monocle", neck: null });
assert.equal(Logic.sameActive(logo, { ...logo, character }), true, "resting character data does not affect active logo comparison");

assert.equal(Logic.catalogCompatible({ avatar: { recipe_version: 1, renderer_version: V8.VERSION } }), true);
assert.equal(Logic.catalogCompatible({ avatar: { recipe_version: 1, renderer_version: "old" } }), false);
assert.equal(Logic.canSave({ signedIn: true, machine: true, catalogReady: true, ownLoaded: false, saving: false, needsReadback: false }), false);
assert.equal(Logic.canSave({ signedIn: true, machine: true, catalogReady: true, ownLoaded: true, saving: false, needsReadback: false }), true);
assert.equal(Logic.canSave({ signedIn: true, machine: true, catalogReady: true, ownLoaded: true, saving: true, needsReadback: false }), false, "editing stays frozen while a save/readback is in flight");
assert.equal(Logic.canSave({ signedIn: true, machine: true, catalogReady: true, ownLoaded: true, saving: false, needsReadback: true }), false, "an unconfirmed write cannot be sent again");
assert.equal(Logic.canSave({ signedIn: true, machine: true, catalogReady: true, ownLoaded: true, saving: false, needsReadback: false, identityValid: false }), false, "an identity fence disables writes immediately");
assert.equal(Logic.editLocked({ saving: false, needsReadback: true, identityValid: true }), true, "unknown writes freeze the draft until the original submission is read back");

const cleared = Logic.avatarState({ mode: "logo", model: "claude", character: null });
assert.equal(cleared.mode, "logo");
assert.deepEqual(cleared.character, V8.defaultRecipe("fox"), "server character null clears an old local recipe");

assert.equal(
  Logic.focusKey("character", { value: "fox", species: "fox", avatarBusy: "1" }),
  Logic.focusKey("character", { species: "fox", value: "fox" }),
  "dataset identity survives DOM replacement and temporary busy state"
);
const request = { epoch: 7, generation: 4 };
assert.equal(Logic.tokenMatches(request, 7, 4), true);
assert.equal(Logic.tokenMatches(request, 8, 4), false, "a cleared identity rejects late work from the old epoch");
assert.equal(Logic.tokenMatches(request, 7, 5), false, "a cross-tab selector generation rejects late work");

assert.equal(Logic.miniPreviewState(false, -121, true), true, "mobile preview compacts after the workbench crosses -120px");
assert.equal(Logic.miniPreviewState(true, -21, true), true, "compact preview stays stable inside the hysteresis band");
assert.equal(Logic.miniPreviewState(true, -19, true), false, "scrolling back past -20px restores the large preview");
assert.equal(Logic.miniPreviewState(true, -200, false), false, "desktop never enters the compact mobile layout");

console.log("avatar editor state contract: ok");
