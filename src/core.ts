// Pure core for egg-prices-grocery-prices-mcp. The only I/O is keyless reads of FRED series CSV files through an injected fetchText.
//
// Data: U.S. Bureau of Labor Statistics, CPI Average Price Data (survey series AP). Series ids are APU<area><item>:
//   area 0000 U.S. city average, 0100 Northeast, 0200 Midwest, 0300 South, 0400 West; item is the BLS item code (708111 eggs).
// Read from the St. Louis Fed's FRED copy of each series:
//   https://fred.stlouisfed.org/graph/fredgraph.csv?id=APU0000708111   ->  "observation_date,APU0000708111\n1980-01-01,0.879\n..."
// Months with no published price have an empty value. A series FRED does not carry answers 404.
// Why FRED: from Cloudflare the BLS public API v1 answers REQUEST_NOT_PROCESSED (the keyless per-IP daily quota is shared) and
// download.bls.gov answers 403 (checked 2026-11-17). Every series id below was read live from FRED on 2026-11-17; latest month 2026-10.
import type { FetchText } from './types.js';

export const REPO = 'egg-prices-grocery-prices-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const more = () => `${SITE}/servers/?${UTM}`;
export const CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=';
export const SOURCE =
  'U.S. Bureau of Labor Statistics, CPI Average Price Data (monthly average retail prices collected for the Consumer Price Index), ' +
  'read from the St. Louis Fed FRED copy of each series (https://fred.stlouisfed.org/series/<series_id>). ' +
  'These are averages across stores in urban areas, not the price at a particular store.';
export const LAG_NOTE =
  'BLS publishes each month\'s average prices with the Consumer Price Index, about two weeks after the month ends, so the newest month is last month or the month before.';
const TTL = 6 * 3600;

export class InputError extends Error {}
export class UpstreamError extends Error {}

export interface Item { id: string; code: string; name: string; unit: string; category: string; aliases: string[] }

/** Curated catalog. Names and units are the BLS item titles as FRED shows them (checked 2026-11-17). */
export const ITEMS: Item[] = [
  { id: 'eggs', code: '708111', name: 'Eggs, grade A, large', unit: 'dozen', category: 'dairy and eggs', aliases: ['egg', 'eggs', 'egg prices', 'dozen eggs', 'large eggs', 'grade a eggs'] },
  { id: 'milk', code: '709112', name: 'Milk, fresh, whole, fortified', unit: 'gallon', category: 'dairy and eggs', aliases: ['milk', 'whole milk', 'gallon of milk'] },
  { id: 'butter', code: 'FS1101', name: 'Butter, stick', unit: 'lb', category: 'dairy and eggs', aliases: ['butter'] },
  { id: 'cheddar_cheese', code: '710212', name: 'Cheddar cheese, natural', unit: 'lb', category: 'dairy and eggs', aliases: ['cheese', 'cheddar', 'cheddar cheese'] },
  { id: 'ice_cream', code: '710411', name: 'Ice cream, prepackaged, bulk, regular', unit: 'half gallon', category: 'dairy and eggs', aliases: ['ice cream'] },
  { id: 'ground_beef', code: '703112', name: 'Ground beef, 100% beef', unit: 'lb', category: 'meat', aliases: ['beef', 'beef prices', 'ground beef', 'hamburger', 'hamburger meat', 'minced beef'] },
  { id: 'sirloin_steak', code: '703613', name: 'Steak, sirloin, USDA Choice, boneless', unit: 'lb', category: 'meat', aliases: ['steak', 'sirloin', 'sirloin steak', 'steak prices'] },
  { id: 'round_steak', code: '703511', name: 'Steak, round, USDA Choice, boneless', unit: 'lb', category: 'meat', aliases: ['round steak'] },
  { id: 'chicken_whole', code: '706111', name: 'Chicken, fresh, whole', unit: 'lb', category: 'meat', aliases: ['chicken', 'whole chicken', 'chicken prices'] },
  { id: 'chicken_breast', code: 'FF1101', name: 'Chicken breast, boneless', unit: 'lb', category: 'meat', aliases: ['chicken breast', 'boneless chicken breast', 'chicken breasts'] },
  { id: 'bacon', code: '704111', name: 'Bacon, sliced', unit: 'lb', category: 'meat', aliases: ['bacon'] },
  { id: 'pork_chops', code: '704212', name: 'Pork chops, boneless', unit: 'lb', category: 'meat', aliases: ['pork', 'pork chops', 'chops'] },
  { id: 'bread', code: '702111', name: 'Bread, white, pan', unit: 'lb', category: 'bakery and cereals', aliases: ['bread', 'white bread', 'loaf of bread'] },
  { id: 'flour', code: '701111', name: 'Flour, white, all purpose', unit: 'lb', category: 'bakery and cereals', aliases: ['flour', 'all purpose flour'] },
  { id: 'rice', code: '701312', name: 'Rice, white, long grain, uncooked', unit: 'lb', category: 'bakery and cereals', aliases: ['rice', 'white rice'] },
  { id: 'cookies', code: '702421', name: 'Cookies, chocolate chip', unit: 'lb', category: 'bakery and cereals', aliases: ['cookies', 'chocolate chip cookies'] },
  { id: 'coffee', code: '717311', name: 'Coffee, 100%, ground roast, all sizes', unit: 'lb', category: 'beverages', aliases: ['coffee', 'coffee prices', 'ground coffee'] },
  { id: 'orange_juice', code: '713111', name: 'Orange juice, frozen concentrate, 12 ounce can', unit: '16 oz', category: 'beverages', aliases: ['orange juice', 'oj', 'juice'] },
  { id: 'beer', code: '720111', name: 'Malt beverages, all types, all sizes, any origin', unit: '16 oz', category: 'beverages', aliases: ['beer', 'malt beverages'] },
  { id: 'sugar', code: '715211', name: 'Sugar, white, all sizes', unit: 'lb', category: 'other foods', aliases: ['sugar', 'white sugar'] },
  { id: 'bananas', code: '711211', name: 'Bananas', unit: 'lb', category: 'fruits and vegetables', aliases: ['banana', 'bananas'] },
  { id: 'oranges', code: '711311', name: 'Oranges, navel', unit: 'lb', category: 'fruits and vegetables', aliases: ['orange', 'oranges', 'navel oranges'] },
  { id: 'lemons', code: '711412', name: 'Lemons', unit: 'lb', category: 'fruits and vegetables', aliases: ['lemon', 'lemons'] },
  { id: 'tomatoes', code: '712311', name: 'Tomatoes, field grown', unit: 'lb', category: 'fruits and vegetables', aliases: ['tomato', 'tomatoes'] },
  { id: 'potatoes', code: '712112', name: 'Potatoes, white', unit: 'lb', category: 'fruits and vegetables', aliases: ['potato', 'potatoes'] },
  { id: 'lettuce', code: '712211', name: 'Lettuce, iceberg', unit: 'lb', category: 'fruits and vegetables', aliases: ['lettuce', 'iceberg lettuce'] },
  { id: 'gasoline', code: '74714', name: 'Gasoline, unleaded regular', unit: 'gallon', category: 'energy', aliases: ['gas', 'gasoline', 'gas prices', 'regular gas', 'unleaded'] },
  { id: 'gasoline_premium', code: '74716', name: 'Gasoline, unleaded premium', unit: 'gallon', category: 'energy', aliases: ['premium gas', 'premium gasoline'] },
  { id: 'diesel', code: '74717', name: 'Automotive diesel fuel', unit: 'gallon', category: 'energy', aliases: ['diesel', 'diesel fuel'] },
  { id: 'electricity', code: '72610', name: 'Electricity', unit: 'kWh', category: 'energy', aliases: ['electricity', 'electric', 'power', 'electricity prices', 'kwh'] },
  { id: 'natural_gas', code: '72620', name: 'Utility (piped) gas', unit: 'therm', category: 'energy', aliases: ['natural gas', 'utility gas', 'piped gas', 'gas bill'] },
];

/** The everyday basket used when grocery_prices_compare gets no items. */
export const BASKET = ['eggs', 'milk', 'bread', 'ground_beef', 'chicken_breast', 'bacon', 'coffee', 'butter', 'cheddar_cheese', 'bananas', 'sugar', 'rice'];

export interface Region { key: string; code: string; name: string; states: string }
export const REGIONS: Region[] = [
  { key: 'us', code: '0000', name: 'U.S. city average', states: 'all urban areas' },
  { key: 'northeast', code: '0100', name: 'Northeast', states: 'CT, MA, ME, NH, NJ, NY, PA, RI, VT' },
  { key: 'midwest', code: '0200', name: 'Midwest', states: 'IA, IL, IN, KS, MI, MN, MO, ND, NE, OH, SD, WI' },
  { key: 'south', code: '0300', name: 'South', states: 'AL, AR, DC, DE, FL, GA, KY, LA, MD, MS, NC, OK, SC, TN, TX, VA, WV' },
  { key: 'west', code: '0400', name: 'West', states: 'AK, AZ, CA, CO, HI, ID, MT, NM, NV, OR, UT, WA, WY' },
];
const STATE_NAMES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut', DE: 'delaware',
  DC: 'district of columbia', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa',
  KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota',
  MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey',
  NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon',
  PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah',
  VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Region key, a census region name, "national"/"US", a state code or state name -> region. "all" is handled by callers. */
export function resolveRegion(q?: string): { region: Region; from_state?: string } {
  if (q === undefined || q === null || !String(q).trim()) return { region: REGIONS[0] };
  const n = norm(String(q));
  if (['us', 'u s', 'usa', 'national', 'nationwide', 'united states', 'us city average', 'u s city average'].includes(n)) return { region: REGIONS[0] };
  const r = REGIONS.find((x) => x.key === n || norm(x.name) === n || x.key === n.replace(/ region$/, ''));
  if (r) return { region: r };
  const code = n.length === 2 ? n.toUpperCase() : Object.keys(STATE_NAMES).find((k) => STATE_NAMES[k] === n);
  if (code && STATE_NAMES[code]) {
    const reg = REGIONS.find((x) => x.code !== '0000' && x.states.split(', ').includes(code));
    if (reg) return { region: reg, from_state: code };
  }
  throw new InputError(`Unknown region "${q}". Use us, northeast, midwest, south, west, all, or a US state (BLS publishes averages for the four census regions, not for states).`);
}

/** Item id, alias, BLS item code or full series id -> catalog item. */
export function resolveItem(q: string): Item {
  const raw = String(q ?? '').trim();
  if (!raw) throw new InputError('Give an item, for example eggs, ground_beef, coffee or milk (grocery_price_items lists all).');
  const up = raw.toUpperCase();
  const byCode = ITEMS.find((i) => i.code === up || `APU0000${i.code}` === up || /^APU0[0-4]00/.test(up) && up.slice(7) === i.code);
  if (byCode) return byCode;
  let n = norm(raw).replace(/^(the )?(average )?(price|prices|cost) (of|for) (a |an )?/, '').replace(/ (price|prices|cost)$/, '').trim();
  const exact = ITEMS.find((i) => i.id === n.replace(/ /g, '_') || i.aliases.includes(n) || norm(i.name) === n);
  if (exact) return exact;
  // Longest alias contained in the query wins ("price of a dozen eggs in march" -> eggs, "natural gas bill" -> natural_gas).
  let best: { item: Item; len: number } | null = null;
  for (const i of ITEMS) for (const a of i.aliases) {
    if (new RegExp(`(^| )${a}( |$)`).test(n) && (!best || a.length > best.len)) best = { item: i, len: a.length };
  }
  if (best) return best.item;
  if (n.endsWith('s')) { n = n.slice(0, -1); const s = ITEMS.find((i) => i.aliases.includes(n)); if (s) return s; }
  throw new InputError(`No BLS average price series for "${raw}". Items: ${ITEMS.map((i) => i.id).join(', ')}.`);
}

export const seriesId = (item: Item, region: Region) => `APU${region.code}${item.code}`;
export const seriesUrl = (id: string) => `https://fred.stlouisfed.org/series/${id}`;

export interface Obs { month: string; price: number }

/** FRED CSV -> observations with a value, oldest first. */
export function parseCsv(text: string, id: string): Obs[] {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  if (!/^observation_date,/i.test(lines[0] ?? '')) throw new UpstreamError(`FRED did not return a CSV for ${id}`);
  const out: Obs[] = [];
  for (const l of lines.slice(1)) {
    const [d, v] = l.split(',');
    if (!d || v === undefined) continue;
    const t = v.trim();
    if (!t || t === '.') continue;
    const x = Number(t);
    if (!Number.isFinite(x) || !/^\d{4}-\d{2}-01$/.test(d.trim())) continue;
    out.push({ month: d.trim().slice(0, 7), price: x });
  }
  return out;
}

class NotPublished extends Error {}

async function readSeries(fetchText: FetchText, id: string): Promise<Obs[]> {
  let text: string;
  try {
    text = await fetchText(`${CSV}${id}`, { accept: 'text/csv,*/*', cacheTtl: TTL, timeoutMs: 20000 });
  } catch (e) {
    const m = (e as Error).message;
    if (/HTTP 404/.test(m)) throw new NotPublished(id);
    throw new UpstreamError(`FRED did not answer for ${id} (${m})`);
  }
  const obs = parseCsv(text, id);
  if (!obs.length) throw new NotPublished(id);
  return obs;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export function addMonths(m: string, k: number): string {
  const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7))) - (Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7)));
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;
export const money = (x: number) => (x < 1 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`);
const pct = (a: number, b: number) => r1(((a - b) / b) * 100);
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);
const per = (i: Item) => `per ${i.unit}`;

/** "YYYY-MM", "YYYY-MM-DD", "March 2025", "2025" (-> December, or the latest month of that year). */
export function parseMonth(s: string, end = true): string {
  const t = String(s).trim();
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(t);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = /^(\d{4})$/.exec(t);
  if (m) return `${m[1]}-${end ? '12' : '01'}`;
  m = /^([a-z]+)\.?\s+(\d{4})$/i.exec(t);
  if (m) {
    const i = MONTH_NAMES.findIndex((x) => x.toLowerCase().startsWith(m![1].toLowerCase().slice(0, 3)));
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, '0')}`;
  }
  throw new InputError(`Could not read the month "${s}". Use YYYY-MM, for example 2025-03.`);
}

interface Point { month: string; price: number; change?: number; change_pct?: number; instead_of?: string; months_apart?: number }
/** BLS published no average prices for October 2025: there was no price collection during the October-November 2025 federal government shutdown. */
export const GAP_NOTE = 'BLS published no average prices for October 2025 (no price collection during the 2025 federal government shutdown), so a comparison that needs that month uses the nearest published month and says so.';
export interface Stats {
  latest: Point; previous_month: Point | null; year_ago: Point | null; five_years_ago: Point | null;
  record_high: Point; record_low_since_2000: Point | null; is_record_high: boolean; last_13_months: Point[];
}

function at(obs: Obs[], month: string): Obs | undefined { return obs.find((o) => o.month === month); }
/** The target month, or the month before it, or the month after it (if still before latest) when the target was not published. */
function near(obs: Obs[], target: string, latest: Obs): Obs | undefined {
  return at(obs, target) ?? at(obs, addMonths(target, -1)) ?? (addMonths(target, 1) < latest.month ? at(obs, addMonths(target, 1)) : undefined);
}
function cmp(obs: Obs[], target: string, latest: Obs): Point | null {
  const o = near(obs, target, latest);
  if (!o) return null;
  const p: Point = { month: o.month, price: o.price, change: r3(latest.price - o.price), change_pct: pct(latest.price, o.price) };
  if (o.month !== target) { p.instead_of = target; p.months_apart = monthsBetween(o.month, latest.month); }
  return p;
}

/** Stats as of a month (default the latest published month). */
export function stats(obs: Obs[], asOf?: string): Stats {
  const upto = asOf ? obs.filter((o) => o.month <= asOf) : obs;
  const latest = upto[upto.length - 1];
  if (!latest) throw new InputError(`No price was published on or before ${asOf}.`);
  let hi = upto[0];
  for (const o of upto) if (o.price > hi.price) hi = o;
  let lo: Obs | undefined;
  for (const o of upto) if (o.month >= '2000-01' && (!lo || o.price < lo.price)) lo = o;
  return {
    latest: { month: latest.month, price: latest.price },
    previous_month: cmp(upto, addMonths(latest.month, -1), latest),
    year_ago: cmp(upto, addMonths(latest.month, -12), latest),
    five_years_ago: cmp(upto, addMonths(latest.month, -60), latest),
    record_high: { month: hi.month, price: hi.price },
    record_low_since_2000: lo ? { month: lo.month, price: lo.price } : null,
    is_record_high: hi.month === latest.month,
    last_13_months: upto.filter((o) => o.month >= addMonths(latest.month, -12)).map((o) => ({ month: o.month, price: o.price })),
  };
}

function changeText(p: Point | null, label: string): string | null {
  if (!p || p.change === undefined) return null;
  const dir = p.change > 0 ? 'up' : p.change < 0 ? 'down' : 'unchanged';
  const sub = p.instead_of ? `; no price was published for ${monthName(p.instead_of)}` : '';
  return dir === 'unchanged' ? `unchanged from ${label} (${monthName(p.month)}${sub})` : `${dir} ${money(Math.abs(p.change))} (${signed(p.change_pct as number)}%) from ${label} (${money(p.price)} in ${monthName(p.month)}${sub})`;
}

const regionLabel = (r: Region, st?: string) => (r.code === '0000' ? 'U.S. city average' : `${r.name} region average${st ? ` (${st} is in the BLS ${r.name} region)` : ''}`);

interface Got { item: Item; id: string; obs: Obs[] | null; st: Stats | null; missing?: string }
interface RegionRow {
  region: string; name: string; states: string; series_id: string; published: boolean; current: boolean;
  month?: string; price?: number; year_ago_change_pct?: number | null; vs_us_pct?: number;
}

async function oneRegion(fetchText: FetchText, item: Item, region: Region, month?: string): Promise<{ id: string; obs: Obs[]; st: Stats }> {
  const id = seriesId(item, region);
  const obs = await readSeries(fetchText, id);
  return { id, obs, st: stats(obs, month) };
}

// ---------- tools ----------

export async function groceryPrice(fetchText: FetchText, a: { item: string; region?: string; month?: string }) {
  const item = resolveItem(a.item);
  const month = a.month ? parseMonth(a.month) : undefined;
  if (a.region && norm(a.region) === 'all') return allRegions(fetchText, item, month);
  const { region, from_state } = resolveRegion(a.region);
  let res: { id: string; obs: Obs[]; st: Stats };
  try { res = await oneRegion(fetchText, item, region, month); } catch (e) {
    if (e instanceof NotPublished) {
      if (region.code === '0000') throw new UpstreamError(`FRED has no data for ${e.message}`);
      throw new InputError(`BLS does not publish a ${region.name} average price for ${item.name.toLowerCase()}. Ask for the U.S. city average, or region "all" to see which regions have one.`);
    }
    throw e;
  }
  const { id, obs, st } = res;
  const notes = [LAG_NOTE];
  if ([st.previous_month, st.year_ago, st.five_years_ago].some((p) => p?.instead_of === '2025-10')) notes.push(GAP_NOTE);
  let natLatest: string | undefined;
  if (region.code !== '0000' && !month) {
    try { natLatest = (await readSeries(fetchText, seriesId(item, REGIONS[0]))).at(-1)?.month; } catch { /* the regional answer stands on its own */ }
    if (natLatest && monthsBetween(st.latest.month, natLatest) >= 3) notes.unshift(`BLS stopped publishing (or paused) this ${region.name} series: its last month is ${monthName(st.latest.month)}, while the U.S. city average runs to ${monthName(natLatest)}.`);
  }
  if (month && st.latest.month !== month) notes.unshift(`No price was published for ${monthName(month)}; the nearest earlier month is ${monthName(st.latest.month)}.`);
  const lines = [
    `${item.name}, ${regionLabel(region, from_state)}: ${money(st.latest.price)} ${per(item)} in ${monthName(st.latest.month)} (BLS average price).`,
    [changeText(st.previous_month, 'the month before'), changeText(st.year_ago, 'a year earlier')].filter(Boolean).join('; ') + (st.previous_month || st.year_ago ? '.' : ''),
    changeText(st.five_years_ago, 'five years earlier') ? `Five years earlier: ${money(st.five_years_ago!.price)} (${signed(st.five_years_ago!.change_pct!)}%).` : '',
    st.is_record_high ? `This is the highest price in the series (since ${monthName(obs[0].month)}).`
      : `Record high: ${money(st.record_high.price)} in ${monthName(st.record_high.month)}; the price is ${Math.abs(pct(st.latest.price, st.record_high.price))}% below it.`,
  ].filter((x) => x && x !== '.');
  return {
    summary: lines.join(' '),
    item: item.id, item_name: item.name, unit: item.unit, region: region.key, region_name: region.name, state: from_state ?? null,
    series_id: id, ...st, series_starts: obs[0].month,
    as_of: st.latest.month, source: SOURCE, source_url: seriesUrl(id), notes, more: more(),
  };
}

async function allRegions(fetchText: FetchText, item: Item, month?: string) {
  const rows = await Promise.all(REGIONS.map(async (r): Promise<Got & { region: Region }> => {
    try { const x = await oneRegion(fetchText, item, r, month); return { item, region: r, ...x }; } catch (e) {
      if (e instanceof NotPublished) return { item, region: r, id: seriesId(item, r), obs: null, st: null, missing: 'not published' };
      if (r.code === '0000') throw e;
      return { item, region: r, id: seriesId(item, r), obs: null, st: null, missing: (e as Error).message };
    }
  }));
  const nat = rows[0];
  if (!nat.st) throw new UpstreamError(`FRED has no U.S. city average for ${item.name}`);
  const ref = nat.st.latest.month;
  const regions = rows.map((r): RegionRow => {
    if (!r.st) return { region: r.region.key, name: r.region.name, states: r.region.states, series_id: r.id, published: false, current: false };
    const current = monthsBetween(r.st.latest.month, ref) < 3;
    return {
      region: r.region.key, name: r.region.name, states: r.region.states, series_id: r.id, published: true, current,
      month: r.st.latest.month, price: r.st.latest.price, year_ago_change_pct: r.st.year_ago?.change_pct ?? null,
      vs_us_pct: r.region.code === '0000' ? 0 : pct(r.st.latest.price, nat.st!.latest.price),
    };
  });
  const cur = regions.filter((r) => r.current && r.region !== 'us');
  const parts = cur.map((r) => `${r.name} ${money(r.price as number)}${r.month !== ref ? ` (${monthName(r.month as string)})` : ''}`);
  const stale = regions.filter((r) => r.published && !r.current).map((r) => `${r.name} (last ${monthName(r.month as string)}, ${money(r.price as number)})`);
  const none = regions.filter((r) => !r.published).map((r) => r.name);
  const lines = [`${item.name} ${per(item)}, ${monthName(ref)}: U.S. city average ${money(nat.st.latest.price)}.`];
  if (parts.length) lines.push(`Regions: ${parts.join(', ')}.`);
  if (cur.length > 1) {
    const s = [...cur].sort((x, y) => (y.price as number) - (x.price as number));
    lines.push(`Highest ${s[0].name}, lowest ${s[s.length - 1].name}.`);
  }
  if (stale.length) lines.push(`No current BLS average for ${stale.join('; ')}.`);
  if (none.length) lines.push(`BLS publishes no average for ${none.join(', ')}.`);
  return {
    summary: lines.join(' '), item: item.id, item_name: item.name, unit: item.unit, region: 'all', month: ref, regions,
    as_of: ref, source: SOURCE, source_url: seriesUrl(nat.id),
    notes: ['BLS publishes averages for the four census regions only, not for states or cities in this series family, and only where the sample is large enough.', LAG_NOTE],
    more: more(),
  };
}

export async function groceryPriceHistory(fetchText: FetchText, a: { item: string; region?: string; from?: string; to?: string }) {
  const item = resolveItem(a.item);
  const { region, from_state } = resolveRegion(a.region && norm(a.region) === 'all' ? undefined : a.region);
  let obs: Obs[];
  try { obs = await readSeries(fetchText, seriesId(item, region)); } catch (e) {
    if (e instanceof NotPublished && region.code !== '0000') throw new InputError(`BLS does not publish a ${region.name} average price for ${item.name.toLowerCase()}.`);
    throw e;
  }
  const last = obs[obs.length - 1].month;
  const to = a.to ? parseMonth(a.to, true) : last;
  const from = a.from ? parseMonth(a.from, false) : addMonths(to > last ? last : to, -23);
  if (from > to) throw new InputError('from is after to.');
  const pts = obs.filter((o) => o.month >= from && o.month <= to);
  if (!pts.length) throw new InputError(`No published prices between ${from} and ${to}. The series runs ${obs[0].month} to ${last}.`);
  let hi = pts[0], lo = pts[0];
  for (const o of pts) { if (o.price > hi.price) hi = o; if (o.price < lo.price) lo = o; }
  const byYear = new Map<string, number[]>();
  for (const o of pts) { const y = o.month.slice(0, 4); byYear.set(y, [...(byYear.get(y) ?? []), o.price]); }
  const yearly = [...byYear].map(([year, v]) => ({ year: Number(year), average: r3(v.reduce((s, x) => s + x, 0) / v.length), months: v.length }));
  const first = pts[0], end = pts[pts.length - 1];
  const showYearly = yearly.length > 1 ? ` Yearly averages: ${yearly.map((y) => `${y.year} ${money(y.average)}${y.months < 12 ? ` (${y.months} mo)` : ''}`).join(', ')}.` : '';
  const recent = pts.slice(-6).map((o) => `${o.month} ${money(o.price)}`).join(', ');
  const summary = `${item.name} ${per(item)}, ${regionLabel(region, from_state)}, ${monthName(first.month)} to ${monthName(end.month)} (${pts.length} months): ` +
    `${money(first.price)} to ${money(end.price)} (${signed(pct(end.price, first.price))}%). High ${money(hi.price)} in ${monthName(hi.month)}, low ${money(lo.price)} in ${monthName(lo.month)}.` +
    `${showYearly} Latest months: ${recent}.`;
  return {
    summary, item: item.id, item_name: item.name, unit: item.unit, region: region.key, region_name: region.name, state: from_state ?? null,
    series_id: seriesId(item, region), from: first.month, to: end.month, months: pts.length,
    change: r3(end.price - first.price), change_pct: pct(end.price, first.price),
    high: { month: hi.month, price: hi.price }, low: { month: lo.month, price: lo.price }, yearly_averages: yearly,
    monthly: pts.map((o) => ({ month: o.month, price: o.price })), series_starts: obs[0].month, series_latest: last,
    as_of: last, source: SOURCE, source_url: seriesUrl(seriesId(item, region)),
    notes: from <= '2025-10' && to >= '2025-10' && !at(obs, '2025-10') ? [LAG_NOTE, GAP_NOTE] : [LAG_NOTE], more: more(),
  };
}

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (next < xs.length) { const i = next++; out[i] = await fn(xs[i]); }
  }));
  return out;
}

export async function groceryPricesCompare(fetchText: FetchText, a: { items?: string[]; region?: string; sort?: 'change' | 'price' | 'name' | 'basket' }) {
  const ids = a.items && a.items.length ? a.items : BASKET;
  if (ids.length > ITEMS.length) throw new InputError(`At most ${ITEMS.length} items.`);
  const items: Item[] = [];
  for (const q of ids) { const it = resolveItem(q); if (!items.includes(it)) items.push(it); }
  const { region, from_state } = resolveRegion(a.region && norm(a.region) === 'all' ? undefined : a.region);
  const got = await pool(items, 6, async (item): Promise<Got> => {
    try { const x = await oneRegion(fetchText, item, region); return { item, ...x }; } catch (e) {
      if (e instanceof NotPublished) return { item, id: seriesId(item, region), obs: null, st: null, missing: 'no published series' };
      return { item, id: seriesId(item, region), obs: null, st: null, missing: (e as Error).message };
    }
  });
  const ok = got.filter((g) => g.st);
  if (!ok.length) throw new UpstreamError('FRED did not return any of the requested series.');
  const ref = ok.map((g) => g.st!.latest.month).sort().at(-1) as string;
  let rows = ok.map((g) => ({
    item: g.item.id, name: g.item.name, unit: g.item.unit, series_id: g.id, month: g.st!.latest.month, price: g.st!.latest.price,
    month_change_pct: g.st!.previous_month?.change_pct ?? null, year_change_pct: g.st!.year_ago?.change_pct ?? null,
    year_ago_price: g.st!.year_ago?.price ?? null, year_ago_month: g.st!.year_ago?.month ?? null, record_high: g.st!.record_high, is_record_high: g.st!.is_record_high,
  }));
  const sort = a.sort ?? 'basket';
  if (sort === 'change') rows = [...rows].sort((x, y) => (y.year_change_pct ?? -1e9) - (x.year_change_pct ?? -1e9));
  else if (sort === 'price') rows = [...rows].sort((x, y) => y.price - x.price);
  else if (sort === 'name') rows = [...rows].sort((x, y) => x.name.localeCompare(y.name));
  const withYoY = rows.filter((r) => r.year_change_pct !== null);
  const up = [...withYoY].sort((x, y) => (y.year_change_pct as number) - (x.year_change_pct as number));
  const risers = up.filter((r) => (r.year_change_pct as number) > 0).slice(0, 3);
  const fallers = up.reverse().filter((r) => (r.year_change_pct as number) < 0).slice(0, 3);
  const line = (r: typeof rows[number]) => `${r.item.replace(/_/g, ' ')} ${money(r.price)}/${r.unit}${r.year_change_pct !== null ? ` (${signed(r.year_change_pct)}% y/y)` : ''}${r.month !== ref ? ` [${monthName(r.month)}]` : ''}`;
  const lines = [`BLS average prices, ${regionLabel(region, from_state)}, ${monthName(ref)}: ${rows.map(line).join('; ')}.`];
  if (risers.length) lines.push(`Biggest increases over 12 months: ${risers.map((r) => `${r.item.replace(/_/g, ' ')} ${signed(r.year_change_pct as number)}%`).join(', ')}.`);
  if (fallers.length) lines.push(`Biggest decreases: ${fallers.map((r) => `${r.item.replace(/_/g, ' ')} ${r.year_change_pct}%`).join(', ')}.`);
  const recs = rows.filter((r) => r.is_record_high && r.month === ref);
  if (recs.length) lines.push(`At a record high: ${recs.map((r) => r.item.replace(/_/g, ' ')).join(', ')}.`);
  const missing = got.filter((g) => !g.st).map((g) => ({ item: g.item.id, series_id: g.id, reason: g.missing ?? 'unavailable' }));
  if (missing.length) lines.push(`Not available: ${missing.map((m) => `${m.item} (${m.reason})`).join(', ')}.`);
  if (!a.items?.length) lines.push(`(Default basket; pass items to choose others, see grocery_price_items.)`);
  const notes = [LAG_NOTE, 'Year-over-year change compares the same month a year earlier. Units differ by item (dozen, lb, gallon, kWh), so the prices are not a basket total.'];
  const subs = ok.filter((g) => g.st!.year_ago?.instead_of);
  if (subs.length) {
    const s0 = subs[0].st!.year_ago!;
    lines.splice(1, 0, `No price was published for ${monthName(s0.instead_of as string)}, so the year-ago comparison uses ${monthName(s0.month)} (${s0.months_apart} months earlier).`);
    if (s0.instead_of === '2025-10') notes.push(GAP_NOTE);
  }
  return {
    summary: lines.join(' '), region: region.key, region_name: region.name, state: from_state ?? null, month: ref, sort, items: rows, missing,
    as_of: ref, source: SOURCE, notes, more: more(),
  };
}

export function groceryPriceItems(a: { category?: string } = {}) {
  const cats = [...new Set(ITEMS.map((i) => i.category))];
  let list = ITEMS;
  if (a.category) {
    const c = norm(a.category);
    list = ITEMS.filter((i) => norm(i.category).includes(c) || c.includes(norm(i.category).split(' ')[0]));
    if (!list.length) throw new InputError(`Unknown category "${a.category}". Categories: ${cats.join(', ')}.`);
  }
  const items = list.map((i) => ({ id: i.id, name: i.name, unit: i.unit, category: i.category, aliases: i.aliases, us_series_id: `APU0000${i.code}`, source_url: seriesUrl(`APU0000${i.code}`) }));
  const byCat = cats.map((c) => `${c}: ${list.filter((i) => i.category === c).map((i) => `${i.id} (per ${i.unit})`).join(', ')}`).filter((s) => !s.endsWith(': '));
  return {
    summary: `${items.length} BLS average price items. ${byCat.join('. ')}. Regions: us (default), northeast, midwest, south, west, or all; a state maps to its census region.`,
    items, categories: cats, regions: REGIONS.map((r) => ({ region: r.key, name: r.name, states: r.states, series_prefix: `APU${r.code}` })),
    as_of: '2026-11-17', source: SOURCE,
    notes: ['The catalog is fixed; prices are read live by grocery_price, grocery_price_history and grocery_prices_compare. Regional averages exist only for some items (grocery_price with region "all" shows which).'],
    more: more(),
  };
}
