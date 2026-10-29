import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { isEndgamer } from '../endgamers.js';

const testHashes = new Set(['ExampleEndgamer', 'OtherExampleEndgamer'].map(name =>
  createHash('sha256').update(name.toLowerCase()).digest('hex')));
const checkFixture = raw => isEndgamer(raw, testHashes);
const page = readFileSync(new URL('../../endgame.html', import.meta.url), 'utf8');
const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*;$/gm, '');
const answer = { textContent: page.match(/<div id="answer">([^<]*)<\/div>/)[1] };
const errorMessage = { textContent: '' };
let checkAccount = checkFixture;
let loader;
vm.runInNewContext(script, {
  document: { getElementById: id => {
    assert.ok(id === 'answer' || id === 'check-error');
    return id === 'answer' ? answer : errorMessage;
  } },
  isEndgamer: raw => checkAccount(raw),
  initSaveLoader: options => { loader = options; }
});
assert.equal(loader.auth, true);
assert.equal(loader.skipLoad, true);
assert.equal(loader.target, '#save-area');
assert.equal(answer.textContent, '', 'No answer appears before a save loads');
assert.equal(typeof loader.onLoad, 'function');
for (const raw of [null, {}, { data: {} }, { data: { Lv0_0: [9999] } }]) {
  await loader.onLoad(null, raw);
  assert.equal(answer.textContent, 'NO', 'An account without a listed name is not flagged');
  assert.equal(answer.className, 'no');
}
for (const charNames of [
  ['ExampleEndgamer'],
  ['UnlistedCharacter', 'OtherExampleEndgamer'],
  ['UnlistedCharacter', ' EXAMPLEENDGAMER '],
  [null, 123, 'ExampleEndgamer']
]) {
  await loader.onLoad(null, { data: {}, charNames });
  assert.equal(answer.textContent, 'YES', 'Any listed account character flags the account');
  assert.equal(answer.className, 'yes');
}
for (const charNames of [
  ['UnlistedCharacter'],
  ['ExampleEndgamerExtra'],
  [],
  { 0: 'ExampleEndgamer' }
]) {
  await loader.onLoad(null, { data: {}, charNames });
  assert.equal(answer.textContent, 'NO', 'Nonmatches clear a previous YES without substring matching');
  assert.equal(answer.className, 'no');
}
await loader.onLoad(null, { data: {}, charNames: ['ExampleEndgamer'] });
await loader.onLoad(null, { data: {} });
assert.equal(answer.textContent, 'NO', 'Missing names cannot retain the previous account result');
let finishOld;
checkAccount = () => new Promise(resolve => { finishOld = resolve; });
const oldLoad = loader.onLoad(null, {});
checkAccount = async () => false;
await loader.onLoad(null, {});
finishOld(true);
await oldLoad;
assert.equal(answer.textContent, 'NO', 'An older asynchronous check cannot replace the latest account');
assert.equal(answer.className, 'no', 'Superseded checks cannot change the latest result color');
checkAccount = async () => { throw new Error('Hashing unavailable'); };
await loader.onLoad(null, {});
assert.equal(answer.textContent, '', 'Failed checks do not display a misleading result');
assert.equal(answer.className, '', 'Failed checks clear the previous result color');
assert.match(errorMessage.textContent, /Hashing unavailable/);
checkAccount = checkFixture;
await loader.onLoad(null, { charNames: ['ExampleEndgamer'] });
assert.equal(answer.textContent, 'YES');
assert.equal(errorMessage.textContent, '', 'A later successful check clears the error');
assert.ok(page.includes('<h1>Are you endgame?</h1>'));
assert.ok(page.includes('aria-live="polite"'));
assert.match(page, /#answer\.yes\s*\{\s*color:\s*var\(--green\)/);
assert.match(page, /#answer\.no\s*\{\s*color:\s*var\(--red\)/);
const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
assert.ok(index.includes('href="endgame.html"'));
console.log('Endgame check tests passed.');
