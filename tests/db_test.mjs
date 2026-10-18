// Run: SUPABASE_URL=... ANON_KEY=... INSTRUCTOR_KEY=... node tests/db_test.mjs [--load]
// Checks RLS (no anon read), duplicate handling, range checks, and optionally 250 inserts over ~60 s.
// WARNING: calls reset_data at the start and end. Run only against a pilot/empty database.
import assert from 'node:assert/strict';
const {SUPABASE_URL: U, ANON_KEY: K, INSTRUCTOR_KEY: IK} = process.env;
if (!U || !K || !IK) { console.error('set SUPABASE_URL, ANON_KEY, INSTRUCTOR_KEY'); process.exit(2); }
const H = {apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json'};
const rpc = async (fn, body) => { const r = await fetch(`${U}/rest/v1/rpc/${fn}`, {method: 'POST', headers: H, body: JSON.stringify(body)}); return {status: r.status, data: await r.json().catch(() => null)}; };
const insert = (row) => fetch(`${U}/rest/v1/submissions?on_conflict=token`, {method: 'POST',
  headers: {...H, Prefer: 'resolution=ignore-duplicates,return=minimal'}, body: JSON.stringify(row)});
const mk = (i, o = {}) => ({token: `t-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`, color: i % 2 ? 'purple' : 'green',
  matrix_order: 'AB', a_row_order: 'ingroup_first', a_direction: 'asc', b_row_order: 'outgroup_first', b_direction: 'desc',
  a_col: 1 + (i % 13), b_col: 1 + ((i * 5) % 13), ...o});
const count = async () => (await rpc('instructor_results', {p_key: IK})).data.length;
const ok = (m) => console.log('ok  ' + m);

await rpc('reset_data', {p_key: IK}); assert.equal(await count(), 0);
let r = await fetch(`${U}/rest/v1/submissions?select=*`, {headers: H});
assert.ok(r.status === 401 || r.status === 403 || (r.status === 200 && (await r.json()).length === 0)); ok('anon select returns nothing (status ' + r.status + ')');
r = await fetch(`${U}/rest/v1/config?select=*`, {headers: H});
assert.ok(r.status === 401 || r.status === 403 || (r.status === 200 && (await r.json()).length === 0)); ok('anon cannot read config');
assert.equal((await rpc('instructor_results', {p_key: 'wrong'})).status >= 400, true); ok('wrong key rejected');
r = await fetch(`${U}/rest/v1/submissions?id=not.is.null`, {method: 'DELETE', headers: H}); await rpc('instructor_results', {p_key: IK});
assert.equal(await count(), 0); ok('anon delete is a no-op / rejected');

const row = mk(1); assert.ok((await insert(row)).ok); assert.ok((await insert(row)).ok); assert.equal(await count(), 1); ok('duplicate token ignored');
const res = (await rpc('instructor_results', {p_key: IK})).data[0];
assert.equal(res.a_lean, 7 - res.a_col); assert.equal('token' in res, false); ok('lean generated in DB; token not returned');
assert.equal((await insert(mk(2, {a_col: 14}))).ok, false); assert.equal((await insert(mk(3, {color: 'red'}))).ok, false); ok('out-of-range values rejected');
assert.equal((await insert(mk(4, {a_lean: 5}))).ok, false); ok('cannot write generated column');
await rpc('set_submissions_open', {p_key: IK, p_open: false});
assert.equal((await insert(mk(5))).ok, false); assert.equal(await count(), 1); ok('insert refused when closed');
await rpc('set_submissions_open', {p_key: IK, p_open: true});
assert.ok((await insert(mk(6))).ok); assert.equal(await count(), 2); ok('insert works when reopened');

if (process.argv.includes('--load')) {
  await rpc('reset_data', {p_key: IK});
  const N = 250, T = 60000, t0 = Date.now(); let fails = 0; const lat = [];
  const jobs = Array.from({length: N}, (_, i) => (async () => {
    await new Promise(res => setTimeout(res, Math.random() * T));
    const row = mk(i), s = Date.now();
    for (let rep = 0; rep < (i % 10 === 0 ? 2 : 1); rep++) { const x = await insert(row); if (!x.ok) { fails++; console.error(x.status, await x.text()); } }
    lat.push(Date.now() - s);
  })());
  await Promise.all(jobs);
  lat.sort((a, b) => a - b);
  assert.equal(fails, 0); assert.equal(await count(), N);
  ok(`load: ${N} inserts (+${N / 10} duplicate resends) in ${((Date.now() - t0) / 1000).toFixed(0)}s, 0 errors, ${N} rows; p50 ${lat[N >> 1]}ms p95 ${lat[Math.floor(N * .95)]}ms`);
}
await rpc('reset_data', {p_key: IK}); assert.equal(await count(), 0); ok('cleaned up');
