// GHIN index update for the master player list (wns2/players.roster).
// Runs from GitHub Actions on Tuesday and Thursday nights (.github/workflows/ghin-update.yml).
//
// For each active player on the master list:
//   - "No GHIN" ticked            -> skipped; the index typed in by hand stays.
//   - has a GHIN number           -> looks up the current index and saves it with an "as of" date.
//   - no GHIN number yet          -> searches GHIN by last name in Texas; saves the GHIN # and index
//                                    only when exactly one golfer clearly matches. Otherwise skipped.
//   - lookup fails or no match    -> skipped; whatever index is there now stays as it is.
// A summary is saved to wns2/ghinbot (shown in 👥 Players) and to the GitHub run page.
//
// env: GHIN_USER, GHIN_PASSWORD (GitHub secrets), TARGET=live|dev, DRY_RUN=true|false

import { GhinClient } from 'ghin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, setDoc, FieldPath } from 'firebase/firestore';
import { appendFileSync } from 'node:fs';

const PROJECTS = {
  live: { apiKey: 'AIzaSyASZm6VJsOHeEi1TfXXG4S1HisZ_HuC-fI', authDomain: 'wns-scramble.firebaseapp.com', projectId: 'wns-scramble' },
  dev: { apiKey: 'AIzaSyBiiE5BRUO_fUPVFVWi2C6IdiZUgzRhp6c', authDomain: 'wns-scramble-dev.firebaseapp.com', projectId: 'wns-scramble-dev' },
};
const TARGET = process.env.TARGET === 'dev' ? 'dev' : 'live';
const DRY_RUN = process.env.DRY_RUN === 'true';
// Clubs our players belong to; used only to pick between golfers with the same name.
const HOME_CLUBS = /margaritaville|conroe|walden|montgomery|bentwater|april sound|woodlands|panorama|del lago|wedgewood/i;

const NICK = {
  dave: 'david', mike: 'michael', tom: 'thomas', tommy: 'thomas', dan: 'daniel', danny: 'daniel', jim: 'james', jimmy: 'james',
  bill: 'william', billy: 'william', will: 'william', bob: 'robert', bobby: 'robert', rob: 'robert', chris: 'christopher',
  ed: 'edward', eddie: 'edward', jake: 'jacob', andy: 'andrew', drew: 'andrew', alan: 'allen', allan: 'allen', ron: 'ronald',
  ronnie: 'ronald', larry: 'lawrence', pat: 'patrick', matt: 'matthew', steve: 'steven', stephen: 'steven', joe: 'joseph',
  tony: 'anthony', rick: 'richard', rich: 'richard', richie: 'richard', dick: 'richard', jerry: 'gerald', greg: 'gregory',
  ken: 'kenneth', kenny: 'kenneth', jeff: 'jeffrey', sam: 'samuel', nick: 'nicholas', tim: 'timothy', ben: 'benjamin',
  charlie: 'charles', chuck: 'charles', doug: 'douglas', fred: 'frederick', hank: 'henry', jack: 'john', johnny: 'john',
  jon: 'john', walt: 'walter', zach: 'zachary', curt: 'curtis', marc: 'mark', bryan: 'brian', harvey: 'harvey',
};
const firstKey = (s) => { const w = String(s || '').toLowerCase().replace(/[^a-z]/g, ''); return NICK[w] || w; };
const clean = (name) => name.replace(/\(.*?\)/g, ' ').replace(/\b(jr|sr|ii|iii|iv)\.?$/i, '').trim().split(/\s+/);

function parseIndex(g) {
  const v = g.hi_value ?? g.handicap_index;
  if (typeof v === 'number') return v >= 99 ? null : v; // 999 = no handicap
  const s = String(v ?? '').trim();
  if (/^\+\d+(\.\d+)?$/.test(s)) return -Number(s.slice(1)); // plus handicap
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) >= 99 ? null : Number(s);
  return null; // "NH" (no handicap yet) or missing
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Name search. The ghin client's own search() drops the name filters (only GHIN # works),
// so send the golfer search ourselves over the client's signed-in connection.
let diag = '';
async function searchByName(client, last, first) {
  // GHIN's Golfer Lookup (by name) lives at golfers/search.json; the client only knows golfers.json.
  const tok = await client.httpClient.lock.runExclusive(() => client.httpClient.getAccessToken());
  if (tok.isErr()) throw tok.error;
  const url = new URL('https://api2.ghin.com/api/v1/golfers/search.json');
  const q = { per_page: '100', page: '1', last_name: last, state: 'TX', country: 'USA', status: 'Active', source: 'GHINcom' };
  if (first) q.first_name = first;
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: {
    'Content-Type': 'application/json', source: 'GHINcom', Authorization: `Bearer ${tok.value}`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
  } });
  const body = await res.json().catch(() => ({}));
  if (!diag) diag = `name search answered HTTP ${res.status}, fields: ${Object.keys(body).join(', ') || '(none)'}`;
  if (res.status === 429) throw new Error('GHIN rate limit');
  if (!res.ok) throw new Error(`GHIN name search HTTP ${res.status}`);
  return Array.isArray(body.golfers) ? body.golfers : [];
}
const inTexas = (g) => /(^|-)TX$/i.test(String(g.state || '').trim()) || /texas/i.test(String(g.state || ''));
const pause = () => sleep(2500 + Math.random() * 3500); // spaced out like a person looking people up

const summary = [];
const log = (line) => { console.log(line); summary.push(line); };

async function main() {
  if (!process.env.GHIN_USER || !process.env.GHIN_PASSWORD) throw new Error('GHIN_USER / GHIN_PASSWORD secrets are not set.');
  const db = getFirestore(initializeApp(PROJECTS[TARGET]));
  const playersRef = doc(db, 'wns2', 'players');
  const hcRef = doc(db, 'wns2', 'handicaps');
  const roster = (await getDoc(playersRef)).data()?.roster;
  if (!Array.isArray(roster) || !roster.length) throw new Error('The master player list (wns2/players.roster) is empty.');
  const hc = (await getDoc(hcRef)).data()?.players || {};

  const ghin = new GhinClient({ username: process.env.GHIN_USER, password: process.env.GHIN_PASSWORD });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD

  const updated = [], newGhin = [], skipped = [], noGhin = [], review = [];
  let lookups = 0, failures = 0, rawSeen = 0;
  const nextRoster = roster.map((p) => ({ ...p }));

  for (const p of nextRoster) {
    if (p.active === false) continue;
    if (p.noGhin) { noGhin.push(p.name); continue; }
    try {
      let golfer = null;
      if (p.ghin) {
        lookups++;
        golfer = await ghin.golfers.getOne(Number(p.ghin));
        await pause();
        if (!golfer) { skipped.push(`${p.name}: GHIN ${p.ghin} not found`); continue; }
      } else {
        const parts = clean(p.name);
        if (parts.length < 2) { skipped.push(`${p.name}: needs a last name to search GHIN`); continue; }
        const last = parts[parts.length - 1], first = firstKey(parts[0]);
        // Search with the first name as written, then (if nothing) with its full form (Mike -> Michael).
        // Search the first name as written and its full form (Mike + Michael) and combine both.
        const byGhin = new Map();
        for (const fn of [...new Set([parts[0].toLowerCase(), first])]) {
          lookups++;
          for (const g of await searchByName(ghin, last, fn)) byGhin.set(String(g.ghin), g);
          await pause();
        }
        const found = [...byGhin.values()];
        rawSeen += found.length;
        let hits = found.filter((g) => inTexas(g) && String(g.last_name).toLowerCase() === last.toLowerCase()
          && (firstKey(g.first_name) === first || String(g.first_name).toLowerCase().startsWith(parts[0].toLowerCase())));
        if (hits.length > 1) {
          const local = hits.filter((g) => HOME_CLUBS.test(g.club_name || ''));
          if (local.length === 1) hits = local;
        }
        if (hits.length !== 1) {
          skipped.push(`${p.name}: ${hits.length ? `${hits.length} possible GHIN matches in Texas` : 'no GHIN match in Texas'}`);
          continue;
        }
        golfer = hits[0];
        // Only take a new GHIN # on its own when it's clearly our player: a home club, or an index
        // within 3 strokes of the one we have. Otherwise list it for David to check.
        const gi = parseIndex(golfer), cur = hc[p.name]?.index;
        const home = HOME_CLUBS.test(golfer.club_name || '');
        const close = typeof cur === 'number' && gi !== null && Math.abs(gi - cur) <= 3;
        const desc = `GHIN ${golfer.ghin}, ${golfer.club_name || 'no club'}, index ${gi ?? 'none'}`;
        if (!home && !close) { review.push(`${p.name}: ${desc}${typeof cur === 'number' ? ` (we have ${cur})` : ''}`); continue; }
        p.ghin = String(golfer.ghin);
        newGhin.push(`${p.name} → ${desc}`);
      }
      const index = parseIndex(golfer);
      if (index === null) { skipped.push(`${p.name}: no index on GHIN yet`); continue; }
      const old = hc[p.name]?.index;
      updated.push(`${p.name}: ${old ?? '—'} → ${index}`);
      if (!DRY_RUN) {
        await updateDoc(hcRef,
          new FieldPath('players', p.name, 'index'), index,
          new FieldPath('players', p.name, 'indexAsOf'), today,
          new FieldPath('players', p.name, 'indexSource'), 'ghin');
      }
    } catch (e) {
      failures++;
      skipped.push(`${p.name}: lookup failed (${e.message.slice(0, 80)})`);
      if (/auth/i.test(e.name || e.message) && lookups <= 1) throw new Error(`GHIN sign-in failed: ${e.message}`);
    }
  }

  if (!DRY_RUN && newGhin.length) await updateDoc(playersRef, { roster: nextRoster });
  const result = {
    ranAt: new Date().toISOString(), asOf: today, target: TARGET, dryRun: DRY_RUN,
    updated: updated.length, newGhin, review, skipped, noGhin: noGhin.length, failures,
  };
  if (!DRY_RUN) await setDoc(doc(db, 'wns2', 'ghinbot'), result);

  log(`## GHIN update ${today} (${TARGET}${DRY_RUN ? ', dry run, nothing saved' : ''})`);
  log(`- Indexes updated: ${updated.length}`);
  log(`- New GHIN numbers found: ${newGhin.length}`);
  newGhin.forEach((s) => log(`  - ${s}`));
  log(`- Please check (possible match, not saved; enter the GHIN # in 👥 Players if it's right): ${review.length}`);
  review.forEach((s) => log(`  - ${s}`));
  log(`- No GHIN (index kept as entered): ${noGhin.length}`);
  log(`- Skipped, index left as it was: ${skipped.length}`);
  skipped.forEach((s) => log(`  - ${s}`));
  log(`- GHIN lookups: ${lookups}; golfers returned by name searches: ${rawSeen}${diag ? ` (${diag})` : ''}`);
  log('');
  log('<details><summary>Index changes</summary>\n');
  updated.forEach((s) => log(`- ${s}`));
  log('</details>');

  // Fail the run (GitHub emails David) only when most lookups broke, e.g. GHIN changed or blocked us.
  if (lookups >= 5 && failures / lookups > 0.5) throw new Error(`${failures} of ${lookups} GHIN lookups failed.`);
}

main()
  .then(() => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n'); process.exit(0); })
  .catch((e) => {
    console.error(e);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## GHIN update failed\n\n${e.message}\n\n${summary.join('\n')}\n`);
    process.exit(1);
  });
