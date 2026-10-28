import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../humor.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function openImage(row) {');
const end = source.indexOf("byId('dialogClose')", start);
assert.ok(start >= 0 && end > start);
function fixture() {
  class Element extends EventTarget {
    constructor(tag, text) { super(); this.tagName = tag; this.textContent = text; this.firstElementChild = null; }
    replaceChildren(...children) { this.firstElementChild = children[0] || null; }
  }
  const elements = Object.fromEntries(['dialogTitle', 'dialogMedia', 'dialogMeaning', 'dialogDownload'].map((id) => [id, new Element('div')]));
  const context = { byId: (id) => elements[id], make: (tag, text) => new Element(tag, text), dialog: { showModal() {} } };
  runInNewContext(source.slice(start, end), context);
  const row = (id) => ({ title: id, alt: id, meaning: id, original: { path: id + '.png', width: 1, height: 1 } });
  return { open: (id) => { context.openImage(row(id)); return elements.dialogMedia.firstElementChild; }, close: () => elements.dialogMedia.replaceChildren(), elements };
}

test('late errors from a closed original do not replace the next original', () => {
  const f = fixture();
  const a = f.open('A'); f.close(); const b = f.open('B');
  a.dispatchEvent(new Event('error'));
  assert.equal(f.elements.dialogMedia.firstElementChild, b);
  assert.equal(f.elements.dialogTitle.textContent, 'B');
  b.dispatchEvent(new Event('error'));
  assert.equal(f.elements.dialogMedia.firstElementChild.tagName, 'p');
});
test('late errors do not repopulate a closed original dialog', () => {
  const f = fixture(); const a = f.open('A'); f.close();
  a.dispatchEvent(new Event('error'));
  assert.equal(f.elements.dialogMedia.firstElementChild, null);
});
