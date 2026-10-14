import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const V8 = require("./avatar-v8.js");

assert.equal(V8.VERSION, "v8-20260927", "renderer version stays explicit");
assert.equal(V8.catalog.species.length, 30, "all 30 v8 species remain available");
assert.equal(V8.catalog.expressions.length, 18, "all 18 v8 expressions remain available");
assert.equal(V8.presets.length, 38, "all 38 v8 presets remain available");

const fresh = V8.defaultRecipe("fox");
assert.equal(fresh.version, 1);
assert.equal(fresh.parts.eye, "glass", "the original glass-eye default is preserved");
assert.equal("name" in fresh, false, "account names never enter the avatar recipe");
assert.equal(fresh.face_tone, null, "non-squid recipes do not emit a squid-only face tone");

const colorNormalized = V8.normalizeRecipe({
  version: 1,
  species: "fox",
  colors: { base: "#E8843F", hair: "#6B4330", eye: "#C8861F" },
  outfit: { paws: true }
});
assert.deepEqual(colorNormalized.colors, { base: "#e8843f", hair: null, eye: "#c8861f" }, "hex colors normalize to lowercase and non-human hair stays null");
for (const species of ["squid", "jelly", "octopus"]) {
  const unsupported = V8.normalizeRecipe({ version: 1, species, outfit: { paws: true } });
  assert.equal(unsupported.outfit.paws, false, `${species} cannot persist unsupported paws`);
  assert.equal(V8.supportsPaws(species), false);
}

const squid = V8.normalizeRecipe({
  version: 1,
  species: "squid",
  face_tone: "lilac",
  colors: { base: "#4b4e9a", eye: "#d9a426" },
  parts: { eye: "glass" }
});
assert.equal(squid.face_tone, "lilac", "squid face tone survives normalization");
assert.equal(V8.toRecipe(V8.fromRecipe(squid)).face_tone, "lilac", "squid face tone round-trips through the SVG engine");
const deduped = V8.normalizeRecipe({ version: 1, species: "fox", parts: { marks: ["spots", "spots"], stickers: ["star", "star"] } });
assert.deepEqual(deduped.parts.marks, ["spots"], "array fields use replace-and-dedupe semantics");
assert.deepEqual(deduped.parts.stickers, ["star"], "sticker arrays are deduplicated before saving");
assert.match(V8.render(squid, '<机机 & "朋友">'), /#e6dcf4/, "lilac face tone reaches the original SVG palette");
assert.match(V8.render(squid, "小乌贼"), /id="wob2"/, "shared rendering carries the original wobble filter without page-global SVG defs");
assert.doesNotMatch(V8.render(squid, '<机机 & "朋友">'), /<机机/, "accessible labels are escaped");

function assertSelfContained(svg, label) {
  const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) {
    assert.ok(ids.has(match[1]), `${label}: SVG resource ${match[1]} must be defined in the same avatar`);
  }
}
for (const [species] of V8.catalog.species) for (const [expression] of V8.catalog.expressions) {
  const recipe = V8.defaultRecipe(species);
  recipe.expression = expression;
  assertSelfContained(V8.render(recipe, species), `${species}/${expression}`);
}

for (const preset of V8.presets) {
  const recipe = V8.toRecipe(preset.state);
  assert.equal(recipe.version, 1);
  assert.equal("name" in recipe, false, `preset ${preset.label} does not persist its display label`);
  assert.match(V8.render(recipe, preset.label), /class="av /);
  assertSelfContained(V8.render(recipe, preset.label), preset.label);
}

globalThis.RJ_AVATAR_V8 = V8;
const Card = require("./rj-card.js");
const activeCharacter = {
  model: "claude",
  head: "tophat",
  face: null,
  neck: null,
  mode: "character",
  character: squid
};
assert.match(Card.avatar(activeCharacter, "s44", "小乌贼"), /rj-character-avatar/, "shared card renderer selects the active character recipe");
const own = Card.fromOwn({
  kind: "machine",
  handle: "little_squid",
  display_name: "小乌贼",
  card: { avatar: activeCharacter }
});
assert.equal(own.av.mode, "character", "private card projection keeps the active mode");
assert.equal(own.av.character.face_tone, "lilac", "private card projection keeps the resting recipe fields");

console.log("avatar v8 renderer contract: ok");
