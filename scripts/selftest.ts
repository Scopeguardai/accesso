/**
 * Checks everything that does not need the model: the brand pack, the sample
 * deck, knowledge search and the agent's tools. Run with `npm test`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDeckTools } from '../src/lib/agent/deck-tools';
import { systemPrompt } from '../src/lib/agent/prompt';
import { imageFor, loadBrand } from '../src/lib/brand/load';
import { LAYOUTS } from '../src/lib/deck/schema';
import { readDeck, writeDeck } from '../src/lib/deck/store';
import { listKnowledge, readKnowledge, searchKnowledge } from '../src/lib/knowledge/search';
import { DECKS_DIR, ROOT } from '../src/lib/paths';

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
};

const brand = loadBrand('fossefall');

check('brand pack loads and its files exist', () => {
  for (const f of [brand.fonts.sans.file, brand.fonts.mono.file, ...brand.images.map((i) => i.file)]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', brand.assetBase, f)), `missing ${f}`);
  }
  assert.match(brand.svg.wordmark, /<svg/);
  assert.ok(brand.palettes[brand.defaultPalette]);
});

check('sample deck is valid and references only known images and sources', () => {
  const deck = readDeck('sample-fossefall');
  assert.ok(deck);
  assert.equal(deck.slides[0].layout, 'cover');
  assert.equal(deck.slides.at(-1)!.layout, 'closing');
  assert.equal(new Set(deck.slides.map((s) => s.id)).size, deck.slides.length, 'duplicate slide ids');
  for (const s of deck.slides) {
    for (const src of s.sources ?? []) assert.ok(readKnowledge(deck.client, src), `bad source ${src}`);
    const imgs = [
      ...('image' in s && s.image ? [s.image] : []),
      ...('images' in s ? s.images : []),
    ];
    for (const i of imgs) assert.ok(imageFor(brand, i.asset), `bad image ${i.asset}`);
  }
});

check('knowledge search finds the right entry and stays inside the client folder', () => {
  assert.ok(listKnowledge('fossefall').length >= 4);
  assert.equal(searchKnowledge('fossefall', 'GPU capacity platform')[0].path, 'fossefall/platform-strategy.md');
  assert.equal(searchKnowledge('fossefall', 'who is the CEO')[0].path, 'fossefall/leadership.md');
  assert.equal(searchKnowledge('fossefall', 'zzzz').length, 0);
  assert.equal(readKnowledge('fossefall', '../README.md'), null);
  assert.throws(() => listKnowledge('../brands'));
});

check('system prompt carries the brand guide, layouts and all three skills', () => {
  const prompt = systemPrompt(brand);
  for (const l of LAYOUTS) assert.ok(prompt.includes(`- ${l}:`), `layout ${l} missing`);
  for (const s of ['content-flow', 'deck-design', 'deck-review']) assert.ok(prompt.includes(`<skill name="${s}">`));
  assert.ok(prompt.includes('pure AI power'));
});

check('agent tools accept good input and reject bad input with a reason', () => {
  const id = 'selftest-tmp';
  const now = new Date().toISOString();
  writeDeck({
    id, brand: 'fossefall', client: 'fossefall', title: 'Self-test', palette: 'fjord', status: 'ready',
    brief: { topic: 'Self-test', audience: '', goal: '', slideCount: 3, tone: '', mustInclude: '' },
    outline: [], slides: [], suggestions: [], activity: [], createdAt: now, updatedAt: now,
  });
  try {
    const t = createDeckTools(id);
    assert.ok(t.search_knowledge({ query: 'platform strategy' }).text.includes('fossefall/platform-strategy.md'));
    assert.ok(t.read_knowledge({ path: 'fossefall/positioning.md' }).ok);
    assert.equal(t.read_knowledge({ path: 'nope.md' }).ok, false);

    assert.ok(t.upsert_slide({ slide: { id: 'cover', layout: 'cover' } }).ok);
    assert.ok(t.upsert_slide({ slide: { id: 'close', layout: 'closing', title: 'Thank you' } }).ok);
    assert.ok(
      t.upsert_slide({
        slide: { id: 'why', layout: 'split', heading: 'Why now', image: { asset: 'waterfall' }, sources: ['fossefall/positioning.md'] },
        afterId: 'cover',
      }).ok,
    );
    assert.deepEqual(readDeck(id)!.slides.map((s) => s.id), ['cover', 'why', 'close']);

    const tooLong = t.upsert_slide({ slide: { id: 'x', layout: 'statement', heading: 'h'.repeat(200) } });
    assert.equal(tooLong.ok, false);
    assert.match(tooLong.text, /heading/);
    assert.match(t.upsert_slide({ slide: { id: 'x', layout: 'photo', title: 'T', image: { asset: 'unicorn' } } }).text, /Unknown image/);
    assert.match(t.upsert_slide({ slide: { id: 'x', layout: 'section', title: 'T', sources: ['made/up.md'] } }).text, /not knowledge-base paths/);
    assert.equal(t.upsert_slide({ slide: { id: 'x', layout: 'hologram' } }).ok, false);
    assert.equal(readDeck(id)!.slides.length, 3, 'rejected slides must not be saved');

    assert.ok(t.upsert_slide({ slide: { id: 'why', layout: 'statement', heading: 'Why now, restated' } }).ok);
    assert.equal(readDeck(id)!.slides[1].layout, 'statement');

    assert.equal(t.set_deck({ palette: 'neon' }).ok, false);
    assert.ok(t.set_deck({ palette: 'forest', title: 'Renamed' }).ok);
    assert.equal(t.reorder_slides({ ids: ['cover', 'close'] }).ok, false);
    assert.ok(t.reorder_slides({ ids: ['cover', 'close', 'why'] }).ok);
    assert.ok(t.remove_slide({ id: 'why' }).ok);
    assert.equal(t.remove_slide({ id: 'why' }).ok, false);
    assert.ok(t.set_suggestions({ suggestions: [{ kind: 'content', text: 'Add the funding figure.' }] }).ok);

    const final = readDeck(id)!;
    assert.equal(final.palette, 'forest');
    assert.equal(final.title, 'Renamed');
    assert.equal(final.suggestions.length, 1);
    assert.ok(final.activity.length > 5);
  } finally {
    fs.rmSync(path.join(DECKS_DIR, `${id}.json`), { force: true });
  }
});

console.log(`\n${passed} checks passed`);
