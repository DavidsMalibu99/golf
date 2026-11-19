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

// Same person by name? Last names equal, and the first name matches (Mike = Michael) or appears
// in GHIN's first/middle name ("D Marc McKeehan").
function sameGolfer(rosterName, g) {
  const parts = clean(rosterName);
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1].toLowerCase();
  if (String(g.last_name || '').toLowerCase().replace(/\s+(jr|sr|ii|iii|iv)\.?$/, '') !== last) return false;
  const words = `${g.first_name || ''} ${g.middle_name || ''}`.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const want = parts[0].toLowerCase();
  return words.some((w) => w === want || firstKey(w) === firstKey(want) || (want.length >= 3 && w.startsWith(want)));
}

function parseIndex(g) {
  const v = g.hi_value ?? g.handicap_index ?? g.HandicapIndex ?? g.hi_display;
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
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
async function ghinGet(client, path, params = {}) {
  const tok = await client.httpClient.lock.runExclusive(() => client.httpClient.getAccessToken());
  if (tok.isErr()) throw tok.error;
  const url = new URL('https://api2.ghin.com/api/v1/' + path);
  for (const [k, v] of Object.entries({ source: 'GHINcom', ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', source: 'GHINcom', Authorization: `Bearer ${tok.value}`, 'User-Agent': UA } });
  if (res.status === 429) throw new Error('GHIN rate limit');
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
const listOf = (body) => ((Array.isArray(body) ? body : Object.values(body || {}).find(Array.isArray)) || []).map(norm);
// Field names differ a little between GHIN screens; line them up.
const norm = (g) => ({ ...g,
  ghin: g.ghin ?? g.ghin_number ?? g.golfer_id ?? g.id,
  first_name: g.first_name ?? g.FirstName ?? '', last_name: g.last_name ?? g.LastName ?? '',
  club_name: g.club_name ?? g.ClubName ?? g.club ?? '', state: g.state ?? g.State ?? '' });
let followingFields = '';

// The golfers David follows in GHIN (same list as the GHIN app's Golfers > Following).
async function followedGolfers(client, me) {
  const { status, body } = await ghinGet(client, `followed_golfers/${me}.json`);
  if (status !== 200) throw new Error(`Following list HTTP ${status}`);
  const raw = (Array.isArray(body) ? body : Object.values(body || {}).find(Array.isArray)) || [];
  followingFields = raw[0] ? Object.keys(raw[0]).slice(0, 25).join(', ') : '(empty)';
  return listOf(body);
}

// GHIN's own "Search full name or GHIN #" (golfers.json?full_name=...).
async function searchByName(client, fullName) {
  const { status, body } = await ghinGet(client, 'golfers.json', {
    full_name: fullName, status: 'Active', per_page: '100', page: '1', from_ghin: 'true', sorting_criteria: 'full_name', order: 'asc',
  });
  if (!diag) diag = `name search HTTP ${status}`;
  if (status !== 200) throw new Error(`GHIN name search HTTP ${status}`);
  return listOf(body);
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
  // Following list first: David picked these people himself, so their GHIN # is taken as is.
  const me = /^\d+$/.test(process.env.GHIN_USER) ? process.env.GHIN_USER
    : (roster.find((r) => r.name === 'David Meyer' && r.ghin) || {}).ghin;
  let following = [];
  try { if (me) { following = await followedGolfers(ghin, me); await pause(); } }
  catch (e) { log(`Note: could not read the GHIN Following list (${e.message}).`); }
  let fromFollowing = 0;
  let lookups = 0, failures = 0, rawSeen = 0;
  const nextRoster = roster.map((p) => ({ ...p }));

  for (const p of nextRoster) {
    if (p.active === false) continue;
    if (p.noGhin) { noGhin.push(p.name); continue; }
    try {
      let golfer = null;
      const fol = following.filter((g) => (p.ghin && String(g.ghin) === p.ghin) || (!p.ghin && sameGolfer(p.name, g)));
      if (fol.length === 1) {
        golfer = fol[0];
        if (!p.ghin) {
          p.ghin = String(golfer.ghin);
          newGhin.push(`${p.name} → GHIN ${golfer.ghin}, ${golfer.club_name || 'no club'} (from your GHIN Following list)`);
        }
        fromFollowing++;
      } else if (p.ghin) {
        lookups++;
        golfer = await ghin.golfers.getOne(Number(p.ghin));
        await pause();
        if (!golfer) { skipped.push(`${p.name}: GHIN ${p.ghin} not found`); continue; }
      } else {
        const parts = clean(p.name);
        if (parts.length < 2) { skipped.push(`${p.name}: needs a last name to search GHIN`); continue; }
        // Search with the first name as written, then (if nothing) with its full form (Mike -> Michael).
        // GHIN's full-name search, once as written and once with the full first name (Mike -> Michael).
        const byGhin = new Map();
        const full = firstKey(parts[0]);
        for (const q of [...new Set([parts.join(' '), [full, ...parts.slice(1)].join(' ')])]) {
          lookups++;
          for (const g of await searchByName(ghin, q)) byGhin.set(String(g.ghin), g);
          await pause();
        }
        const found = [...byGhin.values()];
        rawSeen += found.length;
        let hits = found.filter((g) => inTexas(g) && sameGolfer(p.name, g));
        if (hits.length > 1) {
          const local = hits.filter((g) => HOME_CLUBS.test(g.club_name || ''));
          if (local.length === 1) hits = local;
        }
        if (hits.length !== 1) {
          skipped.push(`${p.name}: ${hits.length ? `${hits.length} possible GHIN matches in Texas` : 'no GHIN match in Texas'}`);
          continue;
        }
        golfer = hits[0];
        // Only take a new GHIN # on its own when the golfer is at one of our home clubs. Anyone else
        // (even with a similar index - there are two Tom Bledsoes) goes on the please-check list,
        // where David confirms with one tap in 👥 Players.
        const gi = parseIndex(golfer), cur = hc[p.name]?.index;
        const home = HOME_CLUBS.test(golfer.club_name || '');
        const desc = `GHIN ${golfer.ghin}, ${golfer.club_name || 'no club'}, index ${gi ?? 'none'}`;
        if (!home) {
          review.push({ name: p.name, ghin: String(golfer.ghin), club: golfer.club_name || '', index: gi, have: typeof cur === 'number' ? cur : null });
          continue;
        }
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
  await setDoc(doc(db, 'wns2', 'ghinbot'), result); // summary only; a dry run saves no indexes or GHIN numbers

  log(`## GHIN update ${today} (${TARGET}${DRY_RUN ? ', dry run, nothing saved' : ''})`);
  log(`- Indexes updated: ${updated.length}`);
  log(`- New GHIN numbers found: ${newGhin.length}`);
  newGhin.forEach((s) => log(`  - ${s}`));
  log(`- Please check (possible match, not saved; enter the GHIN # in 👥 Players if it's right): ${review.length}`);
  review.forEach((r) => log(`  - ${r.name}: GHIN ${r.ghin}, ${r.club || 'no club'}, index ${r.index ?? 'none'}${r.have !== null ? ` (we have ${r.have})` : ''}`));
  log(`- No GHIN (index kept as entered): ${noGhin.length}`);
  log(`- Skipped, index left as it was: ${skipped.length}`);
  skipped.forEach((s) => log(`  - ${s}`));
  log(`- From your GHIN Following list: ${fromFollowing} players (list has ${following.length}; fields: ${followingFields})`);
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
