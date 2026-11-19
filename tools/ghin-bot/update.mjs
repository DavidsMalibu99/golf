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
const STATE = 'TX';
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
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (/^\+\d+(\.\d+)?$/.test(s)) return -Number(s.slice(1)); // plus handicap
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return null; // "NH" (no handicap yet) or missing
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

  const updated = [], newGhin = [], skipped = [], noGhin = [];
  let lookups = 0, failures = 0;
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
        lookups++;
        const found = await ghin.golfers.search({ last_name: last, state: STATE, status: 'Active', per_page: 100, page: 1 });
        await pause();
        let hits = (found || []).filter((g) => String(g.last_name).toLowerCase() === last.toLowerCase()
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
        p.ghin = String(golfer.ghin);
        newGhin.push(`${p.name} → GHIN ${golfer.ghin}${golfer.club_name ? ` (${golfer.club_name})` : ''}`);
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
    updated: updated.length, newGhin, skipped, noGhin: noGhin.length, failures,
  };
  if (!DRY_RUN) await setDoc(doc(db, 'wns2', 'ghinbot'), result);

  log(`## GHIN update ${today} (${TARGET}${DRY_RUN ? ', dry run, nothing saved' : ''})`);
  log(`- Indexes updated: ${updated.length}`);
  log(`- New GHIN numbers found: ${newGhin.length}`);
  newGhin.forEach((s) => log(`  - ${s}`));
  log(`- No GHIN (index kept as entered): ${noGhin.length}`);
  log(`- Skipped, index left as it was: ${skipped.length}`);
  skipped.forEach((s) => log(`  - ${s}`));
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
