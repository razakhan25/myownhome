#!/usr/bin/env node
// Builds data/states.json: per-state cost assumptions (50 states + DC) for the planner.
//
// Usage (Census ACS table-based summary files, pipe-delimited):
//   node scripts/build-states.mjs <path-to-acsdt5y2024-b25103.dat> <path-to-acsdt5y2024-b25077.dat>
// or (Census API responses saved to files; the API returned "Missing Key" without a key on 2026-11-02):
//   node scripts/build-states.mjs --api <path-to-acs5-states.json> [<path-to-acs5-us.json>]
//     where the files came from
//     https://api.census.gov/data/2024/acs/acs5?get=NAME,B25103_001E,B25077_001E&for=state:*&key=...
//     https://api.census.gov/data/2024/acs/acs5?get=NAME,B25103_001E,B25077_001E&for=us:1&key=...
//
// Property tax (computed here): effective rate = median real estate taxes paid (B25103_E001)
//   / median owner-occupied home value (B25077_E001) x 100, ACS 5-year 2020-2024, state rows
//   (GEO_ID 0400000USxx) and the US row (0100000US).
//   https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25103.dat
//   https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25077.dat
//   Caveat: ACS top-codes taxes at $10,001 and values at $2,000,001, so very expensive
//   states/counties read slightly low.
//
// Insurance and closing costs are hand-entered constants below (sources in the comments);
// the script merges them with the computed tax rates and writes data/states.json.
//
// No dependencies beyond Node built-ins (Node 18+).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// Census state FIPS -> USPS code (Puerto Rico, 72, is in the ACS file but not in the app).
const FIPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE',
  '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA',
  '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM',
  '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY',
};

// ---------------------------------------------------------------------------
// Homeowners insurance: average annual HO-3 premium by state, 2022 (latest year
// published), NAIC data as republished by the Insurance Information Institute,
// "Average Premiums For Homeowners And Renters Insurance By State, 2022",
// https://www.iii.org/fact-statistic/facts-statistics-homeowners-and-renters-insurance
// (fetched 2026-11-02). California data from the California Department of
// Insurance; Texas data from the Texas Department of Insurance (per III footnotes).
// Note: current quotes run well above these 2022 averages; treat as a floor and
// apply a dated uplift in the app.
// ---------------------------------------------------------------------------
const INSURANCE_YEAR = '2022';
const INSURANCE_US = 1569;
const INSURANCE = {
  AK: 1129,
  AL: 1748,
  AR: 1740,
  AZ: 1018,
  CA: 1492,
  CO: 2079,
  CT: 1814,
  DC: 1384,
  DE: 1103,
  FL: 2677,
  GA: 1655,
  HI: 1431,
  IA: 1268,
  ID: 1002,
  IL: 1343,
  IN: 1191,
  KS: 1583,
  KY: 1359,
  LA: 2603,
  MA: 1871,
  MD: 1392,
  ME: 1077,
  MI: 1056,
  MN: 1774,
  MO: 1668,
  MS: 1907,
  MT: 1639,
  NC: 1621,
  ND: 1325,
  NE: 1869,
  NH: 1188,
  NJ: 1417,
  NM: 1322,
  NV: 948,
  NY: 1628,
  OH: 995,
  OK: 2268,
  OR: 893,
  PA: 1120,
  RI: 2074,
  SC: 1571,
  SD: 1756,
  TN: 1492,
  TX: 2397,
  UT: 937,
  VA: 1332,
  VT: 1109,
  WA: 1151,
  WI: 957,
  WV: 1113,
  WY: 1596,
};

// ---------------------------------------------------------------------------
// Buyer closing costs by state, 2025 LodeStar data as published by Bankrate,
// "Average closing costs by state" table (columns: avg. sales price, avg. total
// closing costs incl. taxes, closing costs as % of sales price).
// https://www.bankrate.com/real-estate/average-closing-costs-by-state/ (fetched
// 2026-11-02; the URL now redirects to
// https://www.bankrate.com/mortgages/what-are-closing-costs/, which carries the
// same 51-row table). Covers title, settlement and government/transfer charges
// only; lender fees, points and prepaids are NOT included. National figures per
// the same article: $4,528 on an average sales price of $433,632.
// ---------------------------------------------------------------------------
const CLOSING_YEAR = '2025';
const CLOSING_US = { avgPrice: 433632, avgClosing: 4528 };
const CLOSING = {
  AK: { avgPrice: 406786, avgClosing: 2946, pct: 0.72 },
  AL: { avgPrice: 319589, avgClosing: 2867, pct: 0.90 },
  AR: { avgPrice: 305565, avgClosing: 2666, pct: 0.87 },
  AZ: { avgPrice: 480399, avgClosing: 3507, pct: 0.73 },
  CA: { avgPrice: 747854, avgClosing: 5577, pct: 0.75 },
  CO: { avgPrice: 546627, avgClosing: 2737, pct: 0.50 },
  CT: { avgPrice: 487089, avgClosing: 4222, pct: 0.87 },
  DC: { avgPrice: 616476, avgClosing: 13836, pct: 2.24 },
  DE: { avgPrice: 415814, avgClosing: 12707, pct: 3.06 },
  FL: { avgPrice: 462390, avgClosing: 8128, pct: 1.76 },
  GA: { avgPrice: 395899, avgClosing: 4944, pct: 1.25 },
  HI: { avgPrice: 913449, avgClosing: 5977, pct: 0.65 },
  IA: { avgPrice: 276382, avgClosing: 1541, pct: 0.56 },
  ID: { avgPrice: 524073, avgClosing: 3351, pct: 0.64 },
  IL: { avgPrice: 353221, avgClosing: 4974, pct: 1.41 },
  IN: { avgPrice: 287866, avgClosing: 1980, pct: 0.69 },
  KS: { avgPrice: 301116, avgClosing: 2435, pct: 0.81 },
  KY: { avgPrice: 288452, avgClosing: 2608, pct: 0.90 },
  LA: { avgPrice: 298903, avgClosing: 3492, pct: 1.17 },
  MA: { avgPrice: 612580, avgClosing: 4759, pct: 0.78 },
  MD: { avgPrice: 469782, avgClosing: 9486, pct: 2.02 },
  ME: { avgPrice: 424302, avgClosing: 3662, pct: 0.86 },
  MI: { avgPrice: 359012, avgClosing: 3907, pct: 1.09 },
  MN: { avgPrice: 395314, avgClosing: 3282, pct: 0.83 },
  MO: { avgPrice: 301167, avgClosing: 1748, pct: 0.58 },
  MS: { avgPrice: 246219, avgClosing: 2366, pct: 0.96 },
  MT: { avgPrice: 470721, avgClosing: 3173, pct: 0.67 },
  NC: { avgPrice: 422364, avgClosing: 2462, pct: 0.58 },
  ND: { avgPrice: 327746, avgClosing: 2228, pct: 0.68 },
  NE: { avgPrice: 325800, avgClosing: 2299, pct: 0.71 },
  NH: { avgPrice: 501296, avgClosing: 6445, pct: 1.29 },
  NJ: { avgPrice: 615580, avgClosing: 5382, pct: 0.87 },
  NM: { avgPrice: 363174, avgClosing: 2980, pct: 0.82 },
  NV: { avgPrice: 511891, avgClosing: 4159, pct: 0.81 },
  NY: { avgPrice: 534697, avgClosing: 12418, pct: 2.32 },
  OH: { avgPrice: 301017, avgClosing: 3187, pct: 1.06 },
  OK: { avgPrice: 274110, avgClosing: 2979, pct: 1.09 },
  OR: { avgPrice: 517921, avgClosing: 3398, pct: 0.66 },
  PA: { avgPrice: 359521, avgClosing: 8366, pct: 2.33 },
  RI: { avgPrice: 551287, avgClosing: 3719, pct: 0.67 },
  SC: { avgPrice: 403313, avgClosing: 2753, pct: 0.68 },
  SD: { avgPrice: 354327, avgClosing: 1386, pct: 0.39 },
  TN: { avgPrice: 433721, avgClosing: 5184, pct: 1.20 },
  TX: { avgPrice: 402804, avgClosing: 3754, pct: 0.93 },
  UT: { avgPrice: 578787, avgClosing: 4143, pct: 0.72 },
  VA: { avgPrice: 523332, avgClosing: 7294, pct: 1.39 },
  VT: { avgPrice: 390822, avgClosing: 9164, pct: 2.34 },
  WA: { avgPrice: 609890, avgClosing: 5261, pct: 0.86 },
  WI: { avgPrice: 357202, avgClosing: 2789, pct: 0.78 },
  WV: { avgPrice: 278279, avgClosing: 3238, pct: 1.16 },
  WY: { avgPrice: 469306, avgClosing: 3046, pct: 0.65 },
};

// ---------------------------------------------------------------------------
// Property tax from the ACS files / API
// ---------------------------------------------------------------------------
const round2 = (x) => Math.round(x * 100) / 100;

// Returns { us: { tax, value }, states: { TX: { tax, value }, ... } } with raw medians.
function readDatTable(path, estimateColumn) {
  const lines = readFileSync(resolve(path), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const header = lines[0].split('|');
  const col = header.indexOf(estimateColumn);
  if (header[0] !== 'GEO_ID' || col < 0) {
    throw new Error(`${path}: expected a GEO_ID|...|${estimateColumn}|... header, got "${lines[0]}"`);
  }
  const out = { us: null, states: {} };
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const geo = line.slice(0, line.indexOf('|'));
    if (geo === '0100000US') {
      out.us = Number(line.split('|')[col]);
    } else if (geo.startsWith('0400000US')) {
      const code = FIPS[geo.slice(9)];
      if (code) out.states[code] = Number(line.split('|')[col]);
    }
  }
  if (out.us === null) throw new Error(`${path}: no United States row (0100000US)`);
  return out;
}

function taxRatesFromDat(taxPath, valuePath) {
  const taxes = readDatTable(taxPath, 'B25103_E001');
  const values = readDatTable(valuePath, 'B25077_E001');
  const states = {};
  for (const code of Object.keys(STATES)) {
    const t = taxes.states[code];
    const v = values.states[code];
    if (!(t > 0) || !(v > 0)) throw new Error(`missing ACS tax/value for ${code}: taxes=${t} value=${v}`);
    states[code] = round2((t / v) * 100);
  }
  return { us: round2((taxes.us / values.us) * 100), states };
}

// Census API shape: [["NAME","B25103_001E","B25077_001E","state"], ["Texas","4232","283800","48"], ...]
// for `for=state:*`, or [["NAME","B25103_001E","B25077_001E","us"], ["United States","3119","332700","1"]]
// for `for=us:1`. The state query has no US row, so pass the us:1 response as a second
// file; without it us.propertyTaxPct is null.
function readApiTable(path) {
  const rows = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const header = rows[0];
  const iTax = header.indexOf('B25103_001E');
  const iVal = header.indexOf('B25077_001E');
  const iState = header.indexOf('state');
  const iUs = header.indexOf('us');
  if (iTax < 0 || iVal < 0 || (iState < 0 && iUs < 0)) {
    throw new Error(`${path}: expected B25103_001E, B25077_001E and a "state" or "us" column`);
  }
  const out = { us: null, states: {} };
  for (const r of rows.slice(1)) {
    const t = Number(r[iTax]);
    const v = Number(r[iVal]);
    if (!(t > 0) || !(v > 0)) continue; // Census uses negative codes for suppressed cells
    if (iUs >= 0) out.us = round2((t / v) * 100);
    else if (FIPS[r[iState]]) out.states[FIPS[r[iState]]] = round2((t / v) * 100);
  }
  return out;
}

function taxRatesFromApi(statesPath, usPath) {
  const { states } = readApiTable(statesPath);
  for (const code of Object.keys(STATES)) {
    if (!(code in states)) throw new Error(`${statesPath}: no usable row for ${code}`);
  }
  const us = usPath ? readApiTable(usPath).us : null;
  if (!usPath) console.warn('no us:1 response given; us.propertyTaxPct will be null');
  return { us, states };
}

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let tax;
if (args[0] === '--api' && args[1]) {
  tax = taxRatesFromApi(args[1], args[2]);
} else if (args.length === 2) {
  tax = taxRatesFromDat(args[0], args[1]);
} else {
  console.error('usage: node scripts/build-states.mjs <acsdt5y2024-b25103.dat> <acsdt5y2024-b25077.dat>');
  console.error('   or: node scripts/build-states.mjs --api <acs5-state-response.json> [<acs5-us-response.json>]');
  process.exit(1);
}

const states = {};
for (const code of Object.keys(STATES).sort()) {
  if (!(code in INSURANCE)) throw new Error(`no insurance value for ${code}`);
  if (!(code in CLOSING)) throw new Error(`no closing-cost value for ${code}`);
  states[code] = {
    name: STATES[code],
    propertyTaxPct: tax.states[code],
    insuranceAnnual: INSURANCE[code],
    closingPct: CLOSING[code].pct,
  };
}

const out = {
  retrieved: localDate(),
  sources: {
    propertyTax: {
      name: 'U.S. Census Bureau, American Community Survey 5-Year Estimates 2020-2024, tables B25103 (median real estate taxes paid) and B25077 (median owner-occupied home value), state level',
      url: 'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/',
      asOf: 'ACS 5-year 2020-2024',
      note: 'propertyTaxPct = median real estate taxes paid / median home value x 100 (effective rate, % of value per year). ACS top-codes taxes at $10,001 and values at $2,000,001, so the rate reads slightly low in the most expensive areas. Statewide medians; county rates vary widely.',
    },
    insurance: {
      name: 'NAIC average annual HO-3 homeowners premium by state, republished by the Insurance Information Institute',
      url: 'https://www.iii.org/fact-statistic/facts-statistics-homeowners-and-renters-insurance',
      asOf: INSURANCE_YEAR,
      note: 'insuranceAnnual = average premium in dollars for an HO-3 owner-occupied policy, latest year published (2022). California from the CA Dept. of Insurance, Texas from the Texas Dept. of Insurance. Current quotes run higher; apply a dated uplift before using as an estimate.',
    },
    closing: {
      name: 'LodeStar 2025 average purchase closing costs by state (with taxes), as published by Bankrate',
      url: 'https://www.bankrate.com/real-estate/average-closing-costs-by-state/',
      asOf: CLOSING_YEAR,
      note: 'closingPct = average total closing costs (title, settlement, recording and transfer taxes) as a percent of the average sales price. Excludes lender fees, discount points, prepaids and escrow; all-in buyer cash to close typically runs 2-5%. US value = $4,528 / $433,632 from the same report.',
    },
  },
  us: {
    propertyTaxPct: tax.us,
    insuranceAnnual: INSURANCE_US,
    closingPct: round2((CLOSING_US.avgClosing / CLOSING_US.avgPrice) * 100),
  },
  states,
};

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'states.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

// ---------------------------------------------------------------------------
// Summary for eyeballing
// ---------------------------------------------------------------------------
console.log(`wrote ${outPath}`);
console.log(`states: ${Object.keys(states).length} (50 states + DC)`);
console.log(`US: tax ${out.us.propertyTaxPct}%  insurance $${out.us.insuranceAnnual}  closing ${out.us.closingPct}%`);
for (const code of ['TX', 'CA', 'NJ', 'FL', 'HI', 'NY', 'DC']) {
  const s = states[code];
  console.log(`${code} ${s.name.padEnd(22)} tax ${String(s.propertyTaxPct).padStart(5)}%  insurance $${String(s.insuranceAnnual).padStart(5)}  closing ${s.closingPct.toFixed(2)}%`);
}
