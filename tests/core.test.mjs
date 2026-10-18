// Run: node tests/core.test.mjs   (extracts the CORE block from index.html)
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const core = html.split('/*CORE:START*/')[1].split('/*CORE:END*/')[0];
const ctx = {}; vm.createContext(ctx);
vm.runInContext(core + '\nthis.api={CONFIG,pointsFor,leanOf,canonicalColumn,cardModel,randomize,tCrit,summarize,analyze,histogram};', ctx);
const {CONFIG, pointsFor, leanOf, canonicalColumn, cardModel, randomize, tCrit, summarize, analyze} = ctx.api;
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

ok('matrix endpoints match spec', () => {
  assert.equal(JSON.stringify(pointsFor('A', 1)), JSON.stringify({ingroup: 7, outgroup: 1}));
  assert.equal(JSON.stringify(pointsFor('A', 7)), JSON.stringify({ingroup: 13, outgroup: 13}));
  assert.equal(JSON.stringify(pointsFor('A', 13)), JSON.stringify({ingroup: 19, outgroup: 25}));
  assert.equal(JSON.stringify(pointsFor('B', 1)), JSON.stringify({ingroup: 19, outgroup: 7}));
  assert.equal(JSON.stringify(pointsFor('B', 7)), JSON.stringify({ingroup: 13, outgroup: 13}));
  assert.equal(JSON.stringify(pointsFor('B', 13)), JSON.stringify({ingroup: 7, outgroup: 19}));
  for (let c = 1; c <= 13; c++) assert.equal(pointsFor('B', c).ingroup + pointsFor('B', c).outgroup, 26);
});
ok('lean = 7 - c, range -6..6', () => {
  assert.equal(leanOf(1), 6); assert.equal(leanOf(7), 0); assert.equal(leanOf(13), -6);
});
ok('position -> canonical column across all direction x row-order x matrix', () => {
  for (const key of ['A', 'B']) for (const dir of ['asc', 'desc']) for (const ro of ['ingroup_first', 'outgroup_first']) {
    const seen = new Set(); let fairPos = null;
    for (let pos = 0; pos < 13; pos++) {
      const m = cardModel(key, dir, ro, pos), c = canonicalColumn(dir, pos);
      assert.equal(m.c, c); seen.add(c);
      // displayed numbers must be the canonical column's points, in the requested row order
      const p = pointsFor(key, c);
      assert.equal(m.cells[0].who, ro === 'ingroup_first' ? 'ingroup' : 'outgroup');
      for (const cell of m.cells) assert.equal(cell.pts, p[cell.who]);
      if (m.cells[0].pts === 13 && m.cells[1].pts === 13) fairPos = pos;
    }
    assert.equal(seen.size, 13);
    assert.notEqual(fairPos, null);
    assert.equal(leanOf(canonicalColumn(dir, fairPos)), 0, `fair pick must be lean 0 (${key},${dir},${ro})`);
  }
});
ok('direction desc reverses display; bad input throws', () => {
  assert.equal(canonicalColumn('asc', 0), 1); assert.equal(canonicalColumn('desc', 0), 13);
  assert.equal(canonicalColumn('desc', 12), 1);
  assert.throws(() => canonicalColumn('asc', 13)); assert.throws(() => canonicalColumn('up', 0));
});
ok('randomization balanced over 1,000 simulated clients', () => {
  const N = 1000, tally = {}, bump = (k, v) => { tally[k + '=' + v] = (tally[k + '=' + v] || 0) + 1; };
  for (let i = 0; i < N; i++) {
    const r = randomize();
    for (const k of ['color', 'matrix_order', 'a_row_order', 'b_row_order', 'a_direction', 'b_direction']) bump(k, r[k]);
    assert.notEqual(r.codes.ingroup, r.codes.outgroup);
    for (const v of Object.values(r.codes)) assert.ok(v >= 10 && v <= 99);
  }
  for (const [k, v] of Object.entries(tally)) assert.ok(v > 440 && v < 560, `${k} count ${v} outside 44-56%`); // ~3.8 SD
  console.log('    ', JSON.stringify(tally));
});
ok('t critical values and CI', () => {
  assert.ok(Math.abs(tCrit(10) - 2.228) < 1e-3); assert.ok(Math.abs(tCrit(60) - 2.000) < 2e-3);
  assert.ok(Math.abs(tCrit(199) - 1.972) < 2e-3);
  const s = summarize([1, 2, 3, 4, 5]); assert.equal(s.mean, 3);
  assert.ok(Math.abs(s.hi - (3 + 2.776 * Math.sqrt(2.5) / Math.sqrt(5))) < 1e-9);
});
ok('analyze', () => {
  const rows = [{a_lean: 0, b_lean: 2, color: 'purple', matrix_order: 'AB'}, {a_lean: 0, b_lean: 0, color: 'green', matrix_order: 'BA'}];
  const a = analyze(rows);
  assert.equal(a.n, 2); assert.equal(a.diff.mean, 1); assert.equal(a.histB[2], 1); assert.equal(a.bubbles.length, 2);
  assert.equal(a.byColor.purple.mean, 1); assert.equal(analyze([]).A.n, 0);
});
console.log(`\n${n} test groups passed`);
