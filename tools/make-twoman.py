"""Build twoman.html (the one-off 2-Man Scramble, opened from Weekend Games) from app.html.

It is the Wednesday Night Scramble code with its own records, so nothing it does shows up in,
or changes, the Wednesday league:
  - every round record (check-ins, round #, pairings, holes, live scores, results, payouts)
    lives in wns2/twoman_<name> instead of wns2/<name>2027
  - handicap overrides typed here are saved in wns2/twoman_state, not the Wednesday list
  - course handicaps use each player's Weekend tee (like the other weekend games)
  - no Wednesday 5:30 RSVP window: check-in is always open
  - its own phone settings (nine, group), no Wednesday service worker, no GHIN check box
It still reads the one master player list and GHIN index/tees, like every other app.

usage: python3 tools/make-twoman.py   (run after changing app.html, then tools/make-dev.py)"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / 'app.html').read_text()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old!r}, found {n}'
    s = s.replace(old, new)


def sub(pattern, new, flags=0):
    global s
    s, n = re.subn(pattern, new, s, flags=flags)
    assert n >= 1, f'no match for {pattern!r}'


# Name and header
rep('<meta name="apple-mobile-web-app-title" content="Wed Scramble">',
    '<meta name="apple-mobile-web-app-title" content="2-Man Scramble">')
rep('<title>Wednesday Night Scramble 2027 ⛳</title>', '<title>2-Man Scramble ⛳</title>')
rep('<h1>Wednesday Night Scramble 2027</h1>', '<h1>2-Man Scramble</h1>')
rep('<a href="2026.html" style="color:#d4af37;font-size:12px;text-decoration:none">📜 2026 final results</a>',
    '<a href="Weekendgames.html" style="color:#d4af37;font-size:12px;text-decoration:none">← Weekend Games</a>')
rep('<button onclick="showPage(\'payout\',this)">Weekly Payout</button>',
    '<button onclick="showPage(\'payout\',this)">Payout</button>')

# Its own records. Shared player list / index & tees stay in wns2 (read the same as everywhere).
rep("const SD = id => db.collection('wns2').doc(id + SEASON);",
    "// 2-MAN SCRAMBLE: its own records, never the Wednesday league's.\n"
    "const SD = id => db.collection('wns2').doc('twoman_' + id);")

# Handicap overrides: start from the shared list, but save changes only to the 2-Man records
rep("await db.collection('wns2').doc('state').set({ hcps: state.hcps }, { merge: true });",
    "await SD('state').set({ hcps: state.hcps }, { merge: true });", count=2)
rep("      if (d.playing) state.playing = d.playing;\n      if (d.weekNum)",
    "      if (d.hcps) Object.assign(state.hcps, d.hcps);\n"
    "      if (d.playing) state.playing = d.playing;\n      if (d.weekNum)")
rep("  db.collection('wns2').doc('state').onSnapshot(doc => {\n"
    "    if (doc.exists && doc.data().hcps) state.hcps = doc.data().hcps;",
    "  SD('state').onSnapshot(doc => {\n"
    "    if (doc.exists && doc.data().hcps) Object.assign(state.hcps, doc.data().hcps);")

# Weekend tee, not the Wednesday tee
rep("const c = hcCourse(name, 'wed'); // index + Wednesday tee, when set",
    "const c = hcCourse(name, 'wkd'); // index + Weekend tee, when set")
rep("hcTeeSelect(p.name, 'wed', `wedPickTee(", "hcTeeSelect(p.name, 'wkd', `wedPickTee(")
rep("if (hcCourse(name, 'wed') !== null) { openHcEditor(name); return; }",
    "if (hcCourse(name, 'wkd') !== null) { openHcEditor(name); return; }")
rep("hcSetTee(db, name, 'wed', teeId)", "hcSetTee(db, name, 'wkd', teeId)")

# No Wednesday RSVP window: always open, "today" wording
rep("function isLiveMode() {\n", "function isLiveMode() {\n  return true; // 2-Man Scramble: check-in always open\n")
rep("title.textContent = 'Live — Playing Tonight';", "title.textContent = '2-Man Scramble — Playing Today';")
rep("sub.textContent = 'Selections are locked in. Admin can now generate teams.';",
    "sub.textContent = 'Tap your name if you are playing. Admin generates the 2-man teams.';")
rep("cd.textContent = 'LIVE NOW';", "cd.textContent = 'TODAY';")
rep('cardTitle.textContent = "Who\'s Playing Tonight?";', 'cardTitle.textContent = "Who\'s Playing Today?";')
rep("countLabel.textContent = 'players in tonight';", "countLabel.textContent = 'players in';")
rep("n + ' playing tonight'", "n + ' playing today'")
rep('<span class="sub" id="hdr-count">0 playing tonight</span>', '<span class="sub" id="hdr-count">0 playing today</span>')
rep('Who\'s Playing This Wednesday?</div>', 'Who\'s Playing Today?</div>')
rep("check in tonight's players first", "check in today's players first")

# Rounds, not Wednesday dates
sub(r'"weekDates":\[[^\]]*\]', '"weekDates":[' + ','.join(['""'] * 34) + ']')
rep("${wk === 17 ? '⬅ ' : ''}Week ${wk} — ${d}", "Round ${wk}")
rep("Week ${i+1} — ${d}", "Round ${i+1}")
rep("This will wipe the season records (2027 check-ins, week number, pairings, holes, live round and results) and start the season over.",
    "This will wipe all 2-Man Scramble records (check-ins, round number, pairings, holes, live round and results).")
rep("The player list, Index & Tees, handicaps and the 2026 season are not touched.",
    "The player list, Index & Tees and the Wednesday league are not touched.")
rep("alert('✅ 2027 season records cleared.');", "alert('✅ 2-Man Scramble records cleared.');")

# 18-hole option (Nov 26): "18 holes" next to Front 9 / Back 9. Scores are stored as one slot
# per hole played (9 or 18); every "9" that meant "holes in the round" now reads HOLE_PARS.length.
rep('        <option value="back">Back 9 (10–18)</option>\n',
    '        <option value="back">Back 9 (10–18)</option>\n        <option value="all">18 holes (1–18)</option>\n')
rep("  back:  { pars: [5,3,4,4,4,3,4,4,5], hdcps: [10,18,14,2,4,16,8,6,12], tb: [3,4,7,6,0,8,2,5,1], offset: 9 }  // holes 10-18\n};",
    "  back:  { pars: [5,3,4,4,4,3,4,4,5], hdcps: [10,18,14,2,4,16,8,6,12], tb: [3,4,7,6,0,8,2,5,1], offset: 9 }  // holes 10-18\n};\n"
    "// 2-Man Scramble: all 18 (tiebreak = hardest hole first by the card's handicap)\n"
    "NINES.all = { pars: NINES.front.pars.concat(NINES.back.pars), hdcps: NINES.front.hdcps.concat(NINES.back.hdcps), offset: 0 };\n"
    "NINES.all.tb = NINES.all.hdcps.map((h, i) => [h, i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);\n"
    "const NINE_LABEL = n => n === 'all' ? '18 holes (1–18)' : n === 'back' ? 'Back 9 (holes 10–18)' : 'Front 9 (holes 1–9)';")
rep("el.textContent = n === 'back' ? 'Back 9 (holes 10–18)' : 'Front 9 (holes 1–9)');",
    "el.textContent = NINE_LABEL(n));")
rep("const nine = (document.getElementById('nine-select') || {}).value === 'back' ? 'back' : 'front';",
    "const nine = NINES[(document.getElementById('nine-select') || {}).value] ? document.getElementById('nine-select').value : 'front';")
rep("on the ${nine === 'back' ? 'BACK nine (holes 10-18)' : 'FRONT nine (holes 1-9)'}?",
    "on ${nine === 'all' ? 'ALL 18 HOLES' : nine === 'back' ? 'the BACK nine (holes 10-18)' : 'the FRONT nine (holes 1-9)'}?")
rep("Array(9).fill(null)", "Array(HOLE_PARS.length).fill(null)", count=7)
rep("Array.from({ length: 9 }, (_, i) => ((s - 1 + i) % 9) + 1)",
    "Array.from({ length: HOLE_PARS.length }, (_, i) => ((s - 1 + i) % HOLE_PARS.length) + 1)")
rep("${done}/9 holes posted", "${done}/${HOLE_PARS.length} holes posted")
rep("const strip = Array.from({ length: 9 }, (_, i) => i + 1)", "const strip = Array.from({ length: HOLE_PARS.length }, (_, i) => i + 1)")
rep("order[(pos + 8) % 9]", "order[(pos + HOLE_PARS.length - 1) % HOLE_PARS.length]")
rep("order[(pos + 1) % 9]", "order[(pos + 1) % HOLE_PARS.length]")
rep("(order.indexOf(_grp.curHole) + dir + 9) % 9]", "(order.indexOf(_grp.curHole) + dir + HOLE_PARS.length) % HOLE_PARS.length]")
rep("${holesPosted}/9 posted", "${holesPosted}/${HOLE_PARS.length} posted")
rep("if (holesIn < 9) {\n    if (!confirm(`Only ${holesIn}/9 holes",
    "if (holesIn < HOLE_PARS.length) {\n    if (!confirm(`Only ${holesIn}/${HOLE_PARS.length} holes")
rep("ranked.every(t => t.holesPlayed === 9)", "ranked.every(t => t.holesPlayed === HOLE_PARS.length)")
rep("t.holesPlayed === 9 ? '✓ F' : `${t.holesPlayed}/9`", "t.holesPlayed === HOLE_PARS.length ? '✓ F' : `${t.holesPlayed}/${HOLE_PARS.length}`")
rep("${t.holesPlayed===9?'complete':'incomplete'}", "${t.holesPlayed===HOLE_PARS.length?'complete':'incomplete'}")
rep("if(n < 1 || n > 9) return 'This round is holes ' + (1 + HOLE_OFFSET) + '–' + (9 + HOLE_OFFSET) + '.';",
    "if(n < 1 || n > HOLE_PARS.length) return 'This round is holes ' + (1 + HOLE_OFFSET) + '–' + (HOLE_PARS.length + HOLE_OFFSET) + '.';")

# ---- No Admin, three tabs, set-your-own buy-in (Nov 26) ----
# Anyone with the link runs the round: no PIN. Admin panel, Leaderboard, Yearly Points,
# Pairing History and Enter Results are hidden. A "Run the Round" card on the Roster tab
# holds the controls (the real buttons are moved there, so app.html fixes still apply).
# Payout tab = today's round only: places and money from the live scorecard.
rep('Generated Teams — Week <span id="teams-wk-label">?</span>', 'Generated Teams<span id="teams-wk-label" style="display:none">?</span>')
rep('🕳️ Hole Assignments — Week <span id="holes-wk-label">?</span> ·', '🕳️ Hole Assignments<span id="holes-wk-label" style="display:none">?</span> ·')
rep('🏌️ Live Leaderboard — Week <span id="sc-wk-label">?</span> ·', '🏌️ Live Leaderboard<span id="sc-wk-label" style="display:none">?</span> ·')
rep("Start the Live Scorecard for Week ${wk} on ", "Start the Live Scorecard on ")
rep("All previous scores for this week will be cleared.", "Any scores from the last round will be cleared.")
rep("Holes have not been assigned for Week ${wk}.", "Holes have not been assigned yet.")
rep("Tap Cancel, then ⛳ Assign Holes on the Roster tab.", "Tap Cancel, then tap Generate Teams on the Roster tab.")
rep("'Tap your name if you are playing. Admin generates the 2-man teams.'", "'Tap your name if you are playing, then use Run the Round below.'")
rep('<div class="card-title">📋 Weekly Results</div>', '<div class="card-title">💰 Today\'s Payout</div><div id="tm-payout"></div><div style="display:none">')
rep('        <tbody id="wp-body"></tbody>\n      </table>\n    </div>\n  </div>\n</div>',
    '        <tbody id="wp-body"></tbody>\n      </table>\n    </div>\n  </div></div>\n</div>')
rep('</body>', r"""<style>
#admin-section, #show-admin-btn, #save-pairings-btn, #teams-note { display: none !important; }
nav button[onclick*="'leaderboard'"], nav button[onclick*="'yearly'"], nav button[onclick*="'history'"], nav button[onclick*="'results'"] { display: none !important; }
.tm-run .tm-step { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 13px; }
.tm-run .tm-step:last-child { border-bottom: 0; }
.tm-run .tm-n { width: 22px; height: 22px; border-radius: 50%; background: #1b4332; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex: none; }
.tm-run select, .tm-run input { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
.tm-run input { width: 70px; }
.tm-pay-row { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
.tm-pay-row .amt { font-weight: 700; color: #1b4332; white-space: nowrap; }
</style>
<script>
// ---- 2-Man Scramble: no Admin, Run the Round card, today's payout ----
_adminUnlocked = true;                       // everyone can run it (tee pickers, voice commands)
editHcp = function (evt) { if (evt && evt.stopPropagation) evt.stopPropagation(); }; // hcps come from GHIN / Wednesday list
let tmBuyIn = 10;
(function buildRunCard() {
  const players = document.getElementById('player-grid').closest('.card');
  const card = document.createElement('div');
  card.className = 'card tm-run';
  card.innerHTML = `<div class="card-title">⛳ Run the Round</div>
    <div class="tm-step"><span class="tm-n">1</span> Tap everyone who's playing above. Not on the list? <button class="btn" onclick="showAddPlayer()">+ Add Player</button></div>
    <div class="tm-step"><span class="tm-n">2</span> Holes: <span id="tm-nine"></span> &nbsp; Buy-in $ <input type="number" id="tm-buyin" min="0" step="1" inputmode="decimal" onchange="tmSetBuyIn(this.value)"> per player</div>
    <div class="tm-step"><span class="tm-n">3</span> <button class="btn" onclick="generateTeams()">🎲 Generate Teams</button> <button class="btn gray" onclick="tmReroll()">↻ New Teams</button> then pick each team's group in 👥 Groups below the teams. Everyone starts on hole 1.</div>
    <div class="tm-step" id="tm-round"><span class="tm-n">4</span> </div>
    <div class="tm-step"><span class="tm-n">5</span> When everyone's done: End Round. The Payout tab shows who gets paid.</div>
    <div class="tm-step"><button class="btn gray" onclick="tmNewDay()" style="font-size:12px">🧹 Uncheck everyone</button></div>`;
  players.after(card);
  document.getElementById('tm-nine').appendChild(document.getElementById('nine-select'));
  const r = document.getElementById('tm-round');
  r.appendChild(document.getElementById('start-round-btn'));
  const end = document.getElementById('end-round-btn');
  end.textContent = '🏁 End Round'; end.setAttribute('onclick', 'tmEndRound()');
  r.appendChild(end);
  const clr = [...document.querySelectorAll('#admin-section button')].find(b => (b.getAttribute('onclick') || '').startsWith('clearRound'));
  if (clr) { clr.classList.add('gray'); r.appendChild(clr); }
  r.appendChild(document.getElementById('round-status-msg'));
  document.getElementById('tm-buyin').value = tmBuyIn;
})();
function tmSetBuyIn(v) {
  const n = Math.max(0, Number(v));
  if (!isFinite(n)) return;
  tmBuyIn = n;
  SD('state').set({ buyIn: n }, { merge: true }).catch(e => console.log('buy-in save failed', e));
  tmRenderPayout();
}
SD('state').onSnapshot(doc => {
  const d = doc.exists ? doc.data() : {};
  if (d.buyIn !== undefined && d.buyIn !== null) { tmBuyIn = Number(d.buyIn); const el = document.getElementById('tm-buyin'); if (el && document.activeElement !== el) el.value = tmBuyIn; tmRenderPayout(); }
});
function tmReroll() {
  const el = document.getElementById('reroll-num');
  el.value = (parseInt(el.value) || 1) + 1; saveAdmin(); generateTeams();
}
function tmNewDay() {
  if (!confirm('Uncheck everyone so the next round starts with an empty list?')) return;
  state.playing = {}; saveState(); renderPlayers();
}
async function tmEndRound() {
  if (!roundState.active) return;
  const ranked = getRankedTeams();
  if (!ranked.length) { alert('No scores entered yet.'); return; }
  const short = ranked.filter(t => t.holesPlayed < HOLE_PARS.length).length;
  if (!confirm('End the round?' + (short ? `\n\n${short} team${short === 1 ? ' has' : 's have'} not posted every hole.` : '') + '\n\nScores lock and the Payout tab shows who gets paid.')) return;
  roundState.active = false; _tmFinal = null;
  tmRenderPayout(); // freeze the final payout so it shows the same on every phone, even after reloads
  try { await SD('payout').set({ at: Date.now(), html: document.getElementById('tm-payout').innerHTML }); } catch (e) { console.log('payout save', e); }
  await saveRoundMeta();
  updateRoundAdminUI(); showRoundUI();
  const b = document.querySelector('nav button[onclick*="\'payout\'"]'); if (b) showPage('payout', b);
}
// Start Round: clear the last round's final payout
const _tmStartRound = startRound;
startRound = async function () { await _tmStartRound(); if (roundState.active) { SD('payout').delete().catch(() => {}); _tmFinal = null; } };
let _tmFinal = null;
SD('payout').onSnapshot(doc => { _tmFinal = doc.exists ? doc.data() : null; tmRenderPayout(); });

function tmNames(label) {
  const clean = label.replace(/^⛳\s*/, '').replace(/\s*\(solo\)\s*$/i, '');
  const n = teamLabelToNames(clean);
  return (n && n.length) ? n : clean.split(/\s*\+\s*/);
}
function tmMoney(x) { return '$' + (Math.round(x * 100) % 100 ? x.toFixed(2) : String(Math.round(x))); }
// Same split as the Wednesday scramble, by number of players:
// 10 or fewer: 1st team takes the pot. 11–16: 2nd team gets its buy-ins back, 1st the rest.
// 17+: 2nd team gets 2 buy-ins each, 3rd its buy-ins back, 1st the rest. Split evenly in a team.
function tmRenderPayout() {
  const box = document.getElementById('tm-payout');
  if (!box) return;
  if (_tmFinal && !roundState.active) { box.innerHTML = _tmFinal.html; return; }
  const labels = Object.keys(roundState.scores || {});
  if (!labels.length) { box.innerHTML = '<p style="color:#888;font-size:13px">No round yet. Start one on the Roster tab.</p>'; return; }
  const B = tmBuyIn, n = labels.reduce((s, l) => s + tmNames(l).length, 0), pool = n * B;
  const ranked = getRankedTeams();
  const size = i => ranked[i] ? tmNames(ranked[i].label).length : 0;
  const share = [0, 0, 0];
  if (n <= 10) share[0] = pool;
  else if (n <= 16) { share[1] = size(1) * B; share[0] = pool - share[1]; }
  else { share[1] = size(1) * 2 * B; share[2] = size(2) * B; share[0] = pool - share[1] - share[2]; }
  const medals = ['🥇', '🥈', '🥉'];
  const live = roundState.active;
  let html = `<p style="font-size:12px;color:#666;margin-bottom:6px">${n} players × ${tmMoney(B)} = <b>${tmMoney(pool)}</b> pot · ${NINE_LABEL(roundState.nine)}${live ? ' · <b style="color:#b26a00">round still going, money can change</b>' : ' · final'}</p>`;
  if (!ranked.length) html += '<p style="color:#888;font-size:13px">No scores posted yet.</p>';
  ranked.forEach((t, i) => {
    const names = tmNames(t.label), amt = i < 3 ? share[i] : 0;
    const d = t.diff, toPar = d === 0 ? 'E' : d > 0 ? '+' + d : String(d);
    const thru = t.holesPlayed === HOLE_PARS.length ? '' : ` · thru ${t.holesPlayed}`;
    html += `<div class="tm-pay-row"><div>${medals[i] || (i + 1) + '.'} <b>${names.join(' + ')}</b><div style="font-size:12px;color:#888">${toPar} (${t.totalScore})${thru}</div></div>` +
      `<div class="amt">${amt ? tmMoney(amt / names.length) + ' each' : ''}</div></div>`;
  });
  box.innerHTML = html;
}
renderPayout = tmRenderPayout;
const _tmShowPage = showPage;
showPage = function (id, btn) { _tmShowPage(id, btn); if (id === 'payout') tmRenderPayout(); };
const _tmRefresh = refreshLiveBoard;
refreshLiveBoard = function () { _tmRefresh(); tmRenderPayout(); };
</script>
</body>""")

# ---- Everyone starts on hole 1 (Nov 26): no shotgun ----
# Generate Teams also makes the groups (two teams each). The Wednesday "hole assignment" is kept
# under the hood as the group list, but every group plays from the first hole of the round.
# Odd number of teams: the extra team plays as a twosome (the solo, if any, joins the smallest group).
rep("  const isOdd = n % 2 === 1;\n", "  const isOdd = false; // 2-Man: never three teams in one group\n")
rep("const holesNeeded = Math.max(1, isOdd ? (n - 1) / 2 : n / 2);", "const holesNeeded = Math.max(1, Math.ceil(n / 2));")
rep("  if (soloLabel) assignment[0].push(soloLabel);", "  if (soloLabel) assignment.reduce((a, b) => (b.length < a.length ? b : a)).push(soloLabel);")
rep('<div class="hole-num">${hIdx+1+HOLE_OFFSET}</div>', '<div class="hole-num" title="Group ${hIdx+1}">G${hIdx+1}</div>')
rep('🕳️ Hole Assignments<span id="holes-wk-label"', '👥 Groups (everyone starts on hole 1)<span id="holes-wk-label"')
rep('💾 Save Hole Assignments', '💾 Save Groups')
rep('✅ No repeat hole pairings — all fresh!', '✅ Groups made.')
rep("Drag a team name onto a different hole row to swap assignments manually.", "Drag a team name onto a different group to move it.")
rep('style="background:#1a6b8a">⛳ Assign Holes</button>', 'style="background:#1a6b8a">👥 Remake Groups</button>')
rep("${gr.startHole ? `<span class=\"gp-hole\">Starts Hole ${gr.startHole + HOLE_OFFSET}</span>` : ''}", "")
rep("${g.startHole ? 'Started on Hole ' + (g.startHole + HOLE_OFFSET) : 'No starting hole'}", "${'Starts on hole ' + (1 + HOLE_OFFSET)}")
rep("n === g.startHole ? 'start' : ''", "n === 1 ? 'start' : ''")
rep('</body>', r"""<style>
#holes-card, #assign-holes-btn { display: none !important; }
.tm-grp-row { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid #eee; }
.tm-grp-row .nm { flex: 1; font-size: 14px; font-weight: 600; }
.tm-grp-row.open .nm { color: #b26a00; }
.tm-grp-row .b { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.tm-grp-row .b button { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #ccc; background: #fff; font-weight: 700; font-size: 14px; cursor: pointer; }
.tm-grp-row .b button.sel { background: #1b4332; border-color: #1b4332; color: #fff; }
.tm-cnt { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; font-size: 14px; }
.tm-cnt button { width: 36px; height: 36px; border-radius: 8px; border: 1px solid #1b4332; background: #fff; font-size: 18px; font-weight: 700; color: #1b4332; }
.tm-sum { font-size: 13px; margin-top: 8px; }
.tm-sum div { padding: 4px 0; }
.tm-sum .warn { border: 1px dashed #b26a00; border-radius: 6px; padding: 6px 8px; color: #b26a00; margin-top: 4px; }
</style>
<script>
// 2-Man: every group plays from the round's first hole, in order (no shotgun).
_grpPlayOrder = function () { return Array.from({ length: HOLE_PARS.length }, (_, i) => i + 1); };
getStartingHole = function () { return 1; };

// ---- Groups picked by hand, team by team (like Stableford's group buttons) ----
// Tap a number on each team; the teams on the same number play together. Saved as the round's
// group list (wns2/twoman_holes, same shape as the Wednesday hole list), so every phone sees it.
let tmGroupOf = {};   // team label -> group number
let tmGroupCount = 2;
const tmWk = () => parseInt(document.getElementById('week-num').value) || state.weekNum || 1;
const tmTeams = () => getGeneratedTeamLabels();
(function buildGroupsCard() {
  const card = document.createElement('div');
  card.className = 'card'; card.id = 'tm-groups-card'; card.style.display = 'none';
  card.innerHTML = '<div class="card-title">👥 Groups</div><div style="font-size:12px;color:#666">Tap a number on each team. Teams on the same number play together. Everyone starts on hole 1.</div><div id="tm-groups"></div>';
  document.getElementById('teams-card').after(card);
})();
function tmSaveGroups() {
  const teams = tmTeams();
  const asgn = Array.from({ length: tmGroupCount }, (_, i) => teams.filter((l) => tmGroupOf[l] === i + 1));
  APP_HOLE_HISTORY[tmWk()] = asgn;
  SD('holes').set({ ['w' + tmWk()]: JSON.stringify(asgn) }, { merge: true }).catch((e) => console.log('groups save', e));
  SD('state').set({ groupCount: tmGroupCount, groupOf: tmGroupOf }, { merge: true }).catch(() => {});
}
function tmPick(label, g) { tmGroupOf[label] = tmGroupOf[label] === g ? undefined : g; if (!tmGroupOf[label]) delete tmGroupOf[label]; tmSaveGroups(); tmRenderGroups(); }
function tmCount(d) {
  const teams = tmTeams();
  tmGroupCount = Math.max(1, Math.min(Math.max(1, teams.length), tmGroupCount + d));
  Object.keys(tmGroupOf).forEach((l) => { if (tmGroupOf[l] > tmGroupCount) delete tmGroupOf[l]; });
  tmSaveGroups(); tmRenderGroups();
}
function tmRenderGroups() {
  const card = document.getElementById('tm-groups-card');
  const teams = tmTeams();
  if (!teams.length || roundState.active) { card.style.display = 'none'; return; }
  card.style.display = '';
  Object.keys(tmGroupOf).forEach((l) => { if (!teams.includes(l)) delete tmGroupOf[l]; }); // teams changed
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const name = (l) => teams.length && !l.includes('+') ? expandTeamLabel(l) + ' (solo)' : expandTeamLabel(l);
  let html = `<div class="tm-cnt">Number of groups: <button onclick="tmCount(-1)">−</button> <b>${tmGroupCount}</b> <button onclick="tmCount(1)">+</button></div>`;
  html += teams.map((l) => `<div class="tm-grp-row${tmGroupOf[l] ? '' : ' open'}"><div class="nm">${name(l)}</div><div class="b">` +
    Array.from({ length: tmGroupCount }, (_, i) => `<button class="${tmGroupOf[l] === i + 1 ? 'sel' : ''}" onclick="tmPick('${esc(l)}', ${i + 1})">${i + 1}</button>`).join('') + '</div></div>').join('');
  html += '<div class="tm-sum">' + Array.from({ length: tmGroupCount }, (_, i) => {
    const m = teams.filter((l) => tmGroupOf[l] === i + 1);
    return `<div><b>Group ${i + 1}</b> · ${m.length} team${m.length === 1 ? '' : 's'}${m.length ? ': ' + m.map(name).join(' vs ') : ''}</div>`;
  }).join('');
  const open = teams.filter((l) => !tmGroupOf[l]);
  if (open.length) html += `<div class="warn">Not in a group yet: ${open.map(name).join(', ')}</div>`;
  document.getElementById('tm-groups').innerHTML = html + '</div>';
}
// New or changed teams: redraw the picker (a new set of teams starts with no groups).
new MutationObserver(() => {
  const teams = tmTeams();
  if (teams.length && !Object.keys(tmGroupOf).some((l) => teams.includes(l))) tmGroupCount = Math.max(1, Math.ceil(teams.length / 2));
  tmRenderGroups();
}).observe(document.getElementById('team-list'), { childList: true, subtree: true });
SD('state').get().then((doc) => {
  const d = doc.exists ? doc.data() : {};
  if (d.groupOf) tmGroupOf = d.groupOf;
  if (d.groupCount) tmGroupCount = d.groupCount;
  tmRenderGroups();
}).catch(() => {});
// Start Round: every team needs a group, and every group a team.
const _tmStart2 = startRound;
startRound = async function () {
  const teams = tmTeams();
  const open = teams.filter((l) => !tmGroupOf[l]);
  if (open.length) { alert('Put every team in a group first (👥 Groups, under the teams).\n\nNot in a group yet: ' + open.map(expandTeamLabel).join(', ')); return; }
  const empty = Array.from({ length: tmGroupCount }, (_, i) => i + 1).filter((g) => !teams.some((l) => tmGroupOf[l] === g));
  if (empty.length) { alert(`Group ${empty.join(', ')} has no teams. Tap − to use fewer groups, or move a team there.`); return; }
  tmSaveGroups();
  await _tmStart2();
  tmRenderGroups();
};
</script>
</body>""")

# This phone's settings kept apart from the Wednesday app
rep("'wns-nine'", "'wns2m-nine'", count=2)
rep("'wns-sc-group-w'", "'wns2m-sc-group-w'")

# Wednesday-only extras off
sub(r"<script>\n// Keep the app on the phone so the home-screen icon opens fast \(see sw\.js\)\n.*?</script>\n", '', re.S)
sub(r'<script src="/ghin-check\.js[^"]*"></script>\n', '')
sub(r"<script>try\{GhinCheck\.mount\(.*?</script>\n", '')
rep('<div id="ghin-check-box"></div>', '')
rep("MSGFeedback.init({ app: 'WNS',", "MSGFeedback.init({ app: '2-Man Scramble',")

assert "id + SEASON" not in s and 'serviceWorker' not in s
(root / 'twoman.html').write_text(s)
print('wrote twoman.html')
