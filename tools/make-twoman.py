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
