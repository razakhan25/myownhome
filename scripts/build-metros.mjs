#!/usr/bin/env node
// Builds data/metros.json from the two Zillow ZHVI metro CSVs (mid tier + bottom tier).
//
// Usage:
//   node scripts/build-metros.mjs <path-to-mid-tier.csv> <path-to-bottom-tier.csv>
//
// Sources (Zillow Research, https://www.zillow.com/research/data/):
//   mid tier (33rd-67th pct):  https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
//   bottom tier (0-33rd pct):  https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.0_0.33_sm_sa_month.csv
//
// CSV columns: RegionID, SizeRank, RegionName ("Dallas, TX"), RegionType ("msa"; first row is
// "United States" with RegionType "country"), StateName ("TX"), then one column per month
// ("2000-01-31" ... latest). Month cells may be empty for metros Zillow does not cover yet.
//
// No dependencies beyond Node built-ins (Node 18+).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE =
  'Zillow Home Value Index (ZHVI), smoothed, seasonally adjusted, single-family + condo, Zillow Research';
const SOURCE_URL = 'https://www.zillow.com/research/data/';
const META_COLUMNS = ['RegionID', 'SizeRank', 'RegionName', 'RegionType', 'StateName'];

// ---------------------------------------------------------------------------
// Tiny RFC 4180-style CSV parser: handles quoted fields, "" escapes, CRLF.
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// ---------------------------------------------------------------------------
// Load one tier file into { months: [...], rows: Map<RegionID, record> }
// ---------------------------------------------------------------------------
function loadTier(path) {
  const rows = parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  const header = rows[0];
  for (let i = 0; i < META_COLUMNS.length; i++) {
    if (header[i] !== META_COLUMNS[i]) {
      throw new Error(`${path}: expected column ${i} to be ${META_COLUMNS[i]}, got ${header[i]}`);
    }
  }
  const months = header.slice(META_COLUMNS.length);
  for (const m of months) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m)) throw new Error(`${path}: unexpected month column "${m}"`);
  }
  const records = new Map();
  for (const r of rows.slice(1)) {
    const values = r.slice(META_COLUMNS.length).map((v) => (v === '' ? null : Number(v)));
    records.set(r[0], {
      regionId: r[0],
      rank: Number(r[1]),
      name: fixName(r[2]),
      type: r[3],
      state: r[4] === '' ? null : r[4],
      values,
    });
  }
  return { months, records };
}

// Latest non-empty value for a row, with the month it belongs to.
function latest(months, values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && Number.isFinite(values[i])) {
      return { value: values[i], date: months[i], index: i };
    }
  }
  return null;
}

// Percent change versus the same month one year earlier (matched on YYYY-MM so
// leap-day month-ends still line up). null when either value is missing.
function yoyPct(months, values, latestPoint) {
  if (!latestPoint) return null;
  const [y, m] = latestPoint.date.split('-');
  const target = `${Number(y) - 1}-${m}`;
  const idx = months.findIndex((d) => d.startsWith(target));
  if (idx < 0) return null;
  const prior = values[idx];
  if (prior === null || !Number.isFinite(prior) || prior === 0) return null;
  return Math.round(((latestPoint.value / prior) - 1) * 1000) / 10;
}

// "the latest month column that has data for most metros"
function pickAsOf(months, records) {
  const total = records.size;
  for (let i = months.length - 1; i >= 0; i--) {
    let n = 0;
    for (const rec of records.values()) if (rec.values[i] !== null) n++;
    if (n > total / 2) return months[i];
  }
  throw new Error('no month column has data for most metros');
}

// Zillow's CSV encodes "ñ" as U+00B1 ("Ca±on City, CO", "Espa±ola, NM"); restore it.
function fixName(name) {
  return name.replace(/±/g, 'ñ');
}

// "Washington, DC" -> "washington-dc", "Cañon City, CO" -> "canon-city-co"
function slug(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics before dropping non-alphanumerics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const [midPath, bottomPath] = process.argv.slice(2);
if (!midPath || !bottomPath) {
  console.error('usage: node scripts/build-metros.mjs <path-to-mid-tier.csv> <path-to-bottom-tier.csv>');
  process.exit(1);
}

const mid = loadTier(resolve(midPath));
const bottom = loadTier(resolve(bottomPath));
const asOf = pickAsOf(mid.months, mid.records);

const metros = [];
const dropped = [];
for (const rec of mid.records.values()) {
  const midPoint = latest(mid.months, rec.values);
  if (!midPoint) {
    dropped.push(rec.name);
    continue; // no mid-tier value at all: drop the metro
  }
  const bRec = bottom.records.get(rec.regionId);
  const bottomPoint = bRec ? latest(bottom.months, bRec.values) : null;
  metros.push({
    id: rec.type === 'country' ? 'us' : slug(rec.name),
    regionId: rec.regionId,
    name: rec.name,
    state: rec.state,
    rank: rec.rank,
    mid: Math.round(midPoint.value),
    bottom: bottomPoint ? Math.round(bottomPoint.value) : null,
    midDate: midPoint.date,
    bottomDate: bottomPoint ? bottomPoint.date : null,
    mid12moPct: yoyPct(mid.months, rec.values, midPoint),
    bottom12moPct: bRec && bottomPoint ? yoyPct(bottom.months, bRec.values, bottomPoint) : null,
  });
}

metros.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

// Resolve id collisions: the first metro (by rank) keeps the clean slug, later
// ones get "-<RegionID>" appended.
const seen = new Map();
for (const m of metros) {
  if (seen.has(m.id)) {
    const clash = seen.get(m.id);
    console.warn(`id collision: "${m.name}" (${m.regionId}) vs "${clash.name}" (${clash.regionId}); using ${m.id}-${m.regionId}`);
    m.id = `${m.id}-${m.regionId}`;
  }
  seen.set(m.id, m);
}
for (const m of metros) delete m.regionId;

const out = {
  asOf,
  source: SOURCE,
  sourceUrl: SOURCE_URL,
  retrieved: localDate(),
  metros,
};

// One metro per line keeps the file small and diffs readable.
const json =
  '{\n' +
  `  "asOf": ${JSON.stringify(out.asOf)},\n` +
  `  "source": ${JSON.stringify(out.source)},\n` +
  `  "sourceUrl": ${JSON.stringify(out.sourceUrl)},\n` +
  `  "retrieved": ${JSON.stringify(out.retrieved)},\n` +
  '  "metros": [\n' +
  metros.map((m) => '    ' + JSON.stringify(m)).join(',\n') +
  '\n  ]\n}\n';

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'metros.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json);

// ---------------------------------------------------------------------------
// Summary for eyeballing
// ---------------------------------------------------------------------------
const byName = new Map(metros.map((m) => [m.name, m]));
const show = (name) => {
  const m = byName.get(name);
  if (!m) return `  ${name}: MISSING`;
  return `  ${m.name.padEnd(18)} rank ${String(m.rank).padStart(3)}  mid ${String(m.mid).padStart(8)} (${m.midDate}, ${m.mid12moPct}% yoy)  bottom ${String(m.bottom).padStart(8)} (${m.bottomDate}, ${m.bottom12moPct}% yoy)`;
};
const noBottom = metros.filter((m) => m.bottom === null).length;
const stale = metros.filter((m) => m.midDate !== asOf).length;
console.log(`wrote ${outPath}`);
console.log(`metros: ${metros.length} (${noBottom} without bottom tier, ${stale} with midDate older than asOf, ${dropped.length} dropped for no mid-tier data)`);
if (dropped.length) console.log(`dropped: ${dropped.join('; ')}`);
console.log(`asOf: ${asOf}   latest mid column: ${mid.months.at(-1)}   latest bottom column: ${bottom.months.at(-1)}`);
console.log(show('United States'));
console.log(show('Dallas, TX'));
console.log(show('Austin, TX'));
console.log(show('Los Angeles, CA'));
