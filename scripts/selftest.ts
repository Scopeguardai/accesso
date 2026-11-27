/**
 * Checks everything that does not need the model: the brand pack, the sample
 * deck, knowledge search and the agent's tools. Run with `npm test`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDeckTools } from '../src/lib/agent/deck-tools';
import { systemPrompt } from '../src/lib/agent/prompt';
import { AssetError, fontFormat, imageInfo, sanitizeSvg } from '../src/lib/brand/assets';
import { createBrand, newBrandSchema } from '../src/lib/brand/create';
import { designData } from '../src/lib/brand/design';
import { imageFor, listBrands, loadBrand } from '../src/lib/brand/load';
import { briefSchema, LAYOUTS } from '../src/lib/deck/schema';
import { readDeck, writeDeck } from '../src/lib/deck/store';
import { listKnowledge, readKnowledge, searchKnowledge } from '../src/lib/knowledge/search';
import { parseEntry, serializeEntry } from '../src/lib/knowledge/format';
import { createEntry, deleteEntry, EntryNotFound, entryInputSchema, entryUsage, updateEntry } from '../src/lib/knowledge/write';
import { DECKS_DIR, KNOWLEDGE_DIR, ROOT } from '../src/lib/paths';

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

check('briefs saved in the old shape are still readable', () => {
  const old = briefSchema.parse({ topic: 'Old topic', mustInclude: 'Old point', slideCount: 5 });
  assert.equal(old.prompt, 'Old topic\n\nOld point');
  assert.equal(old.slideCount, 5);
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
    brief: { prompt: 'Self-test', audience: '', goal: '', slideCount: 3, tone: '' },
    outline: [], slides: [], suggestions: [],
    thread: [{ id: 'a1', role: 'agent', at: now, status: 'working', text: '', steps: [] }],
    createdAt: now, updatedAt: now,
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
    const run = final.thread[0];
    assert.ok(run.role === 'agent' && run.steps.length > 5, 'tool calls should be recorded as steps');
    assert.ok(run.role === 'agent' && run.steps.some((st) => st.kind === 'read' && st.ref === 'fossefall/positioning.md'));
    assert.ok(run.role === 'agent' && run.steps.some((st) => st.kind === 'note'), 'rejected slides should leave a note');
  } finally {
    fs.rmSync(path.join(DECKS_DIR, `${id}.json`), { force: true });
  }
});

check('knowledge entries can be added, changed and deleted, and only inside their folder', () => {
  const client = 'selftest-kb';
  const dir = path.join(KNOWLEDGE_DIR, client);
  try {
    const input = entryInputSchema.parse({
      title: 'Funding & investors: Øst',
      tags: 'Funding, [investors], finance',
      source: 'Board pack',
      status: 'verified',
      body: 'Closed a seed round.',
    });
    const first = createEntry(client, input);
    const second = createEntry(client, input);
    assert.equal(first, 'selftest-kb/funding-investors-ost.md');
    assert.equal(second, 'selftest-kb/funding-investors-ost-2.md');

    const read = listKnowledge(client).find((e) => e.path === first)!;
    assert.equal(read.title, 'Funding & investors: Øst');
    assert.deepEqual(read.tags, ['funding', 'investors', 'finance']);
    assert.equal(read.status, 'verified');
    assert.equal(read.updated, new Date().toISOString().slice(0, 10));
    assert.ok(searchKnowledge(client, 'seed round').some((h) => h.path === first));

    updateEntry(client, first, { ...input, body: 'Closed a €10m seed round in 2026.' });
    assert.match(readKnowledge(client, first)!.body, /€10m/);

    // A title with a line break cannot inject extra header fields.
    const sneaky = serializeEntry({ title: 'A\nstatus: verified', tags: [], source: '', updated: '', status: 'draft' }, 'x');
    assert.equal(parseEntry(sneaky).status, 'draft');

    assert.throws(() => updateEntry(client, '../fossefall/positioning.md', input), EntryNotFound);
    assert.throws(() => updateEntry(client, 'fossefall/positioning.md', input), EntryNotFound);
    assert.throws(() => deleteEntry(client, '../../brands/fossefall/brand.json'), EntryNotFound);
    assert.throws(() => createEntry('../brands', input));

    deleteEntry(client, first);
    assert.throws(() => deleteEntry(client, first), EntryNotFound);
    assert.equal(listKnowledge(client).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(fs.existsSync(path.join(KNOWLEDGE_DIR, 'fossefall', 'positioning.md')), 'real entries untouched');
  assert.ok(entryUsage('fossefall', 'fossefall/platform-strategy.md').some((u) => u.id === 'sample-fossefall'));
});

check('uploaded logos keep their drawing and lose anything that could run code', () => {
  const clean = sanitizeSvg(brand.svg.wordmark, 'Fossefall');
  assert.match(clean, /^<svg [^>]*viewBox="[^"]+"/);
  assert.match(clean, /fill="currentColor"/);
  assert.ok((clean.match(/<path/g) ?? []).length >= 1);

  const nasty = `<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="alert(1)">
    <metadata><x>secret</x></metadata>
    <style>.st0{fill:#123456} body{background:url(https://evil.test/x)}</style>
    <script>alert(1)</script><script/>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></div></foreignObject>
    <a href="javascript:alert(1)"><path d="M0 0h1"/></a>
    <image href="https://evil.test/i.png"/>
    <use href="https://evil.test/s.svg#a"/><use xlink:href="#ok"/>
    <path class="st0" d="M0 0h10v10z" style="fill:url(https://evil.test)" onclick="x()"/>
    <rect fill="url(https://evil.test/#g)" width="5" height="5"/><rect fill="url(#g)" width="5" height="5"/>
    <animate attributeName="href" to="javascript:alert(1)"/>
    <title>Logo &amp; <b>name</b></title>
  </svg>`;
  const out = sanitizeSvg(nasty, 'A "brand"');
  for (const bad of ['script', 'onload', 'onclick', 'onerror', 'javascript', 'evil.test', 'foreignObject', 'metadata', 'secret', '<image', '<a ', 'animate', 'style=', 'DOCTYPE', '<?xml']) {
    assert.ok(!out.includes(bad), `left ${bad} in ${out}`);
  }
  assert.match(out, /viewBox="0 0 40 20"/);
  assert.match(out, /<path d="M0 0h10v10z" fill="#123456"\/>/, 'class colour kept as fill');
  assert.match(out, /<use xlink:href="#ok"\/>/);
  assert.match(out, /<rect fill="url\(#g\)"/);
  assert.match(out, /aria-label="A &quot;brand&quot;"/);
  assert.throws(() => sanitizeSvg('<html><body>no</body></html>', 'x'), AssetError);
  assert.throws(() => sanitizeSvg('<svg viewBox="0 0 1 1"><script>x</script></svg>', 'x'), AssetError);

  assert.equal(fontFormat(fs.readFileSync(path.join(ROOT, 'public', brand.assetBase, brand.fonts.sans.file))), 'truetype');
  assert.equal(fontFormat(Buffer.from('<html>')), null);
  const jpg = imageInfo(fs.readFileSync(path.join(ROOT, 'public', brand.assetBase, brand.images[0].file)));
  assert.ok(jpg && jpg.width > 0 && jpg.height > 0, 'reads a JPEG size');
  assert.equal(imageInfo(Buffer.from('GIF89a')), null);
});

check('a new brand starts with working starter assets and a list of what to add', () => {
  const id = createBrand(newBrandSchema.parse({ name: 'Self Test <Brand'.replace('<', ''), tagline: 't' }));
  try {
    assert.match(id, /^self-test-brand/);
    assert.equal(listBrands()[0], 'fossefall', 'the first brand stays the default');
    const d = designData(id);
    assert.equal(d.todo.length, 5);
    assert.ok(fs.existsSync(path.join(ROOT, 'public', d.assetBase, d.fonts[0].file)));
    assert.throws(() => newBrandSchema.parse({ name: '<script>' }));
    assert.throws(() => newBrandSchema.parse({ name: '   ' }));
  } finally {
    fs.rmSync(path.join(ROOT, 'brands', id), { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, 'public', 'brands', id), { recursive: true, force: true });
  }
});

console.log(`\n${passed} checks passed`);
