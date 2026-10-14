import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const V8 = require("./avatar-v8.js");
const css = readFileSync(new URL("./avatar-v8.css", import.meta.url), "utf8");
const engine = css.slice(css.indexOf("/* v8 shared renderer:"));

const keyframes = [
  "blink", "flt", "ear", "nosem", "puff", "tail", "wool", "tilt", "sway", "curl",
  "glowb", "lamp", "drift", "swing", "bob", "ahoge", "hairb", "smileup", "pulse", "spin",
  "shy", "emoup", "emobounce", "emodrip", "emosway", "twinkle", "nod", "shake", "boing", "heart",
  "bubl", "pad", "quill", "rub", "gill", "wing", "wave2", "steam", "tcshy", "emodot",
  "ding", "rays", "emowave", "spinhop", "hop", "shiver", "bow", "pup", "flap", "dazeup",
  "dazefade", "dpop", "seaglow", "seabreathe"
];
for (const name of keyframes) assert.match(engine, new RegExp(`@keyframes av8-${name}\\b`), `namespaced keyframe ${name}`);
assert.equal([...engine.matchAll(/@keyframes\s+([\w-]+)/g)].length, keyframes.length, "the extracted engine keeps the complete original keyframe set");
assert.doesNotMatch(engine, /@keyframes\s+(?!av8-)/, "no renderer keyframe leaks a global unnamespaced name");

for (const match of engine.matchAll(/animation:(av8-[\w-]+)/g)) {
  assert.match(engine, new RegExp(`@keyframes ${match[1]}\\b`), `animation ${match[1]} has a keyframe`);
}
assert.doesNotMatch(engine, /animation:(?!av8-|none)[a-z]/, "every renderer animation shorthand uses the av8 namespace");

assert.match(engine, /\.rj-character-avatar \.shyrise\{transform:translateY\(100px\)\}/, "squid blush mask is hidden by default");
assert.match(engine, /\.rj-character-avatar \.shysteam\{opacity:0\}/, "squid steam is hidden by default");
assert.match(engine, /\.rj-character-avatar \.bubl\{opacity:0\}/, "octopus bubbles begin hidden");
assert.match(engine, /\.rj-character-avatar\.s44 \.mono\{display:none\}/, "monocle stays absent at 44px");
assert.ok(engine.lastIndexOf("@media(prefers-reduced-motion:reduce)") > engine.lastIndexOf("@keyframes"), "reduced-motion override comes after every animation rule");

const emitted = new Set();
for (const [species] of V8.catalog.species) {
  for (const [expression] of V8.catalog.expressions) {
    const recipe = V8.defaultRecipe(species);
    recipe.expression = expression;
    recipe.idle = "special";
    const output = V8.render(recipe, `${species}-${expression}`);
    assert.match(output, /class="rj-character-avatar bub"/);
    for (const match of output.matchAll(/class="([^"]+)"/g)) {
      for (const token of match[1].split(/\s+/)) emitted.add(token);
    }
  }
}
for (const preset of V8.presets) {
  for (const match of V8.render(preset.recipe, preset.label).matchAll(/class="([^"]+)"/g)) {
    for (const token of match[1].split(/\s+/)) emitted.add(token);
  }
}

const requiredEmittedClasses = [
  "blink", "flt", "ear", "nosem", "puff", "tail", "wool", "tilt", "sway", "curl",
  "glowb", "lamp", "drift", "twin", "braid", "bunm", "pom", "ahoge", "hairb",
  "shyrise", "shysteam", "bubl", "pad", "quill", "rub", "gill", "wing", "pup",
  "daze", "pop", "emo-up", "emo-bounce", "emo-drip", "emo-twinkle", "emo-dot",
  "emo-wave", "emo-nod", "emo-shake", "emo-hop", "emo-shiver", "emo-bow"
];
for (const token of requiredEmittedClasses) {
  assert.ok(emitted.has(token), `renderer emits ${token} across the 30 species, 18 expressions and 38 presets`);
  assert.ok(engine.includes(`.${token}`), `scoped CSS covers emitted class ${token}`);
}

const selectorLines = engine.split("\n").filter(line => line && !line.startsWith("/*") && !line.startsWith("@") && !/^\s*\d/.test(line));
for (const line of selectorLines) assert.ok(line.startsWith(".rj-character-avatar"), `engine selector is scoped: ${line.slice(0, 80)}`);

console.log(`avatar v8 motion contract: ok (${V8.catalog.species.length} species, ${V8.catalog.expressions.length} expressions, ${keyframes.length} keyframes)`);
