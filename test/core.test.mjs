// Fixtures in test/fixtures/ are FRED series CSV files downloaded on 2026-11-17 (latest month 2026-10): the U.S. city average
// for the default basket, gasoline, electricity and orange juice, eggs for the Northeast, Midwest and South (FRED has no West
// eggs series: 404) and ground beef for all four regions. Expected values were computed separately in Python from the same
// files (~/mcp-servers-work/s1117w4/egg/expect.py): eggs 2026-10 $2.320, 2026-09 $2.272 (+2.1%); no October 2025 value in any
// series, so the year-ago comparison uses 2025-09 $3.488 (-33.5%); 2021-10 $1.821 (+27.4%); record high $6.227 in 2025-03.
// Eggs 2024-11..2026-10: 23 published months, high 2025-03, low $2.141 in 2026-06, 2025 average $4.252 over 11 months.
// Default basket 12-month changes: ground beef +6.8, rice +3.9, cheddar +1.3; eggs -33.5, butter -16.9, bacon -8.3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  parseCsv, parseMonth, money, resolveItem, resolveRegion, addMonths, groceryPrice, groceryPriceHistory, groceryPricesCompare,
  groceryPriceItems, ITEMS, CSV, GAP_NOTE, InputError, UpstreamError,
} from '../dist/core.js';

const seen = [];
const f = async (u) => {
  seen.push(u);
  assert.ok(u.startsWith(CSV), u);
  const id = u.slice(CSV.length);
  const p = new URL(`./fixtures/${id}.csv`, import.meta.url);
  if (!existsSync(p)) throw new Error('HTTP 404');
  return readFileSync(p, 'utf8');
};

test('parsing: FRED CSV with empty months, money, months, items and regions', () => {
  const o = parseCsv('observation_date,APU0000708111\n2025-09-01,3.488\n2025-10-01,\n2025-11-01,2.86\n', 'x');
  assert.deepEqual(o, [{ month: '2025-09', price: 3.488 }, { month: '2025-11', price: 2.86 }]);
  assert.throws(() => parseCsv('<!DOCTYPE html>', 'x'), UpstreamError);
  assert.equal(money(2.32), '$2.32'); assert.equal(money(0.19), '$0.190');
  assert.equal(parseMonth('2025-3'), '2025-03'); assert.equal(parseMonth('March 2025'), '2025-03'); assert.equal(parseMonth('2024'), '2024-12');
  assert.equal(addMonths('2026-01', -1), '2025-12'); assert.equal(addMonths('2026-10', -60), '2021-10');
  assert.equal(resolveItem('egg prices').id, 'eggs'); assert.equal(resolveItem('price of a dozen eggs').id, 'eggs');
  assert.equal(resolveItem('beef').id, 'ground_beef'); assert.equal(resolveItem('natural gas bill').id, 'natural_gas');
  assert.equal(resolveItem('gas').id, 'gasoline'); assert.equal(resolveItem('APU0000717311').id, 'coffee'); assert.equal(resolveItem('chicken breasts').id, 'chicken_breast');
  assert.throws(() => resolveItem('caviar'), InputError);
  assert.equal(resolveRegion().region.code, '0000'); assert.equal(resolveRegion('Texas').region.key, 'south');
  assert.equal(resolveRegion('CA').region.key, 'west'); assert.equal(resolveRegion('Midwest region').region.code, '0200');
  assert.throws(() => resolveRegion('Mars'), InputError);
  assert.equal(ITEMS.length, 31);
});

test('grocery_price eggs: latest, month and year changes across the missing October 2025, record high', async () => {
  const r = await groceryPrice(f, { item: 'eggs' });
  assert.equal(r.series_id, 'APU0000708111'); assert.equal(r.as_of, '2026-10');
  assert.equal(r.latest.price, 2.32);
  assert.equal(r.previous_month.price, 2.272); assert.equal(r.previous_month.change_pct, 2.1);
  assert.equal(r.year_ago.month, '2025-09'); assert.equal(r.year_ago.instead_of, '2025-10'); assert.equal(r.year_ago.price, 3.488); assert.equal(r.year_ago.change_pct, -33.5);
  assert.equal(r.five_years_ago.price, 1.821); assert.equal(r.five_years_ago.change_pct, 27.4);
  assert.deepEqual(r.record_high, { month: '2025-03', price: 6.227 }); assert.equal(r.is_record_high, false);
  assert.ok(r.notes.includes(GAP_NOTE));
  assert.match(r.summary, /\$2\.32 per dozen in October 2026/);
  assert.match(r.summary, /no price was published for October 2025/);
  const m = await groceryPrice(f, { item: 'eggs', month: '2025-03' });
  assert.equal(m.latest.price, 6.227); assert.equal(m.is_record_high, true); assert.equal(m.year_ago.change_pct, 108.1); assert.equal(m.year_ago.instead_of, undefined);
  const e = await groceryPrice(f, { item: 'electricity' });
  assert.match(e.summary, /\$0\.190 per kWh/);
  const oj = await groceryPrice(f, { item: 'orange juice' });
  assert.equal(oj.as_of, '2026-07'); assert.equal(oj.year_ago.change_pct, 3.8);
});

test('grocery_price regions: a state maps to its census region, stale and missing regions are explained', async () => {
  const tx = await groceryPrice(f, { item: 'eggs', region: 'Texas' });
  assert.equal(tx.series_id, 'APU0300708111'); assert.equal(tx.latest.price, 2.372); assert.equal(tx.state, 'TX'); assert.equal(tx.year_ago.change_pct, -25.2);
  const ne = await groceryPrice(f, { item: 'eggs', region: 'northeast' });
  assert.equal(ne.as_of, '2024-10'); assert.match(ne.notes[0], /stopped publishing/);
  await assert.rejects(groceryPrice(f, { item: 'eggs', region: 'west' }), InputError);
  const all = await groceryPrice(f, { item: 'eggs', region: 'all' });
  const by = Object.fromEntries(all.regions.map((x) => [x.region, x]));
  assert.equal(by.us.price, 2.32); assert.equal(by.south.current, true); assert.equal(by.northeast.current, false);
  assert.equal(by.midwest.current, false); assert.equal(by.west.published, false);
  assert.match(all.summary, /BLS publishes no average for West/);
  const beef = await groceryPrice(f, { item: 'ground beef', region: 'all' });
  assert.equal(beef.regions.filter((x) => x.current).length, 5);
  assert.match(beef.summary, /Highest West, lowest South/);
});

test('grocery_price_history: default 24 months, high, low and yearly averages', async () => {
  const h = await groceryPriceHistory(f, { item: 'eggs' });
  assert.equal(h.from, '2024-11'); assert.equal(h.to, '2026-10'); assert.equal(h.months, 23);
  assert.deepEqual(h.high, { month: '2025-03', price: 6.227 }); assert.deepEqual(h.low, { month: '2026-06', price: 2.141 });
  assert.deepEqual(h.yearly_averages.find((y) => y.year === 2025), { year: 2025, average: 4.252, months: 11 });
  assert.ok(h.notes.includes(GAP_NOTE));
  const y = await groceryPriceHistory(f, { item: 'eggs', from: '2019', to: '2019' });
  assert.equal(y.months, 12); assert.equal(y.yearly_averages[0].average, 1.396);
  await assert.rejects(groceryPriceHistory(f, { item: 'eggs', from: '2026-01', to: '2025-01' }), InputError);
});

test('grocery_prices_compare: default basket, movers, substituted year-ago month and an unavailable item', async () => {
  const c = await groceryPricesCompare(f, {});
  assert.equal(c.items.length, 12); assert.equal(c.month, '2026-10');
  assert.match(c.summary, /Biggest increases over 12 months: ground beef \+6\.8%, rice \+3\.9%, cheddar cheese \+1\.3%/);
  assert.match(c.summary, /Biggest decreases: eggs -33\.5%, butter -16\.9%, bacon -8\.3%/);
  assert.match(c.summary, /uses September 2025 \(13 months earlier\)/);
  const s = await groceryPricesCompare(f, { items: ['coffee', 'steak', 'eggs'], sort: 'price' });
  assert.deepEqual(s.items.map((x) => x.item), ['coffee', 'eggs']);
  assert.equal(s.missing[0].item, 'sirloin_steak');
});

test('grocery_price_items: catalog and category filter', () => {
  const all = groceryPriceItems();
  assert.equal(all.items.length, 31);
  assert.equal(groceryPriceItems({ category: 'meat' }).items.length, 7);
  assert.throws(() => groceryPriceItems({ category: 'toys' }), InputError);
});

test('upstream failures are UpstreamError, not crashes', async () => {
  await assert.rejects(groceryPrice(async () => 'not csv', { item: 'eggs' }), UpstreamError);
  await assert.rejects(groceryPrice(async () => { throw new Error('HTTP 503'); }, { item: 'eggs' }), UpstreamError);
});

test('stdio: initialize, tools/list with annotations and a tools/call error over JSON-RPC (offline)', async () => {
  const child = spawn(process.execPath, [new URL('../dist/stdio.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = []; let buf = '';
  const got = (id) => new Promise((res) => { const iv = setInterval(() => { const m = lines.find((l) => l.id === id); if (m) { clearInterval(iv); res(m); } }, 10); });
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal((await got(1)).result.serverInfo.name, 'egg-prices-grocery-prices-mcp');
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  const tools = (await got(2)).result.tools;
  assert.deepEqual(tools.map((t) => t.name), ['grocery_price', 'grocery_price_history', 'grocery_prices_compare', 'grocery_price_items']);
  for (const t of tools) { assert.ok(t.title); assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.annotations.destructiveHint, false); assert.equal(t.annotations.openWorldHint, true); }
  send({ id: 3, method: 'tools/call', params: { name: 'grocery_price', arguments: { item: 'caviar' } } });
  const r3 = await got(3);
  child.kill();
  assert.equal(r3.result?.isError ?? Boolean(r3.error), true);
});
