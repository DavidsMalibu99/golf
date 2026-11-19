#!/usr/bin/env python3
"""Wednesday Night Scramble season rollover (2026 -> 2027).

Run once against the 2026 app.html:
    python3 tools/season-rollover.py app.html 2026.html
    python3 tools/season-rollover.py dev/app.html dev/2026.html

It writes two pages from the 2026 app:
  * <archive>  - the 2026 season frozen: same data, same records (wns2/results, wns2/pairings, ...),
                 but view-only. Nothing on the page can write to the database.
  * <app>      - the 2027 season: same roster and settings, empty standings, 2027 Wednesdays.
                 Its week-by-week records live in their own documents (state2027, results2027,
                 pairings2027, holes2027, round2027) so the 2026 records are never touched.
                 The player list (wns2/players), Index & Tees (wns2/handicaps) and handicap
                 overrides (wns2/state.hcps) stay shared with Weekend Games, More Games and KC vs CH.
Then run tools/season-tables.py on the new app (lists everyone, no medals before week 1).
"""
import datetime as dt
import json
import re
import sys

SEASON = 2027
FIRST_WEDNESDAY = dt.date(2027, 3, 10)
WEEKS = 34


def must_replace(text, old, new, count=1):
    n = text.count(old)
    if n != count:
        raise SystemExit(f'expected {count} of {old[:70]!r}, found {n}')
    return text.replace(old, new)


def make_archive(src):
    t = src
    t = must_replace(t, 'Wednesday Night Scramble 2026 ⛳</title>',
                     'Wednesday Night Scramble 2026 · Final ⛳</title>')
    t = must_replace(t, '<h1>Wednesday Night Scramble 2026</h1>',
                     '<h1>Wednesday Night Scramble 2026</h1>')
    t = must_replace(t, '</style>',
                     '#show-admin-btn,#admin-section{display:none!important}\n'
                     '#season-bar{background:#1b4332;color:#fff;text-align:center;padding:8px 12px;'
                     'font:600 13px/1.4 -apple-system,system-ui,sans-serif}\n'
                     '#season-bar a{color:#d4af37}\n</style>')
    t = must_replace(t, '<header>',
                     '<div id="season-bar">📜 2026 season final results. View only. '
                     '<a href="app.html">Go to the current season →</a></div>\n<header>')
    # View-only: every database write on this page does nothing.
    t = must_replace(t, 'const db = firebase.firestore();',
                     'const db = firebase.firestore();\n'
                     '// 2026 ARCHIVE: view only. Block every write so this page can never change the records.\n'
                     '(function () {\n'
                     '  const F = firebase.firestore, none = function () { return Promise.resolve(); };\n'
                     "  ['set', 'update', 'delete'].forEach(m => { F.DocumentReference.prototype[m] = none; });\n"
                     '  F.CollectionReference.prototype.add = none;\n'
                     '  F.WriteBatch.prototype.commit = none;\n'
                     '})();')
    return t


def make_season(src):
    t = src
    t = must_replace(t, 'Wednesday Night Scramble 2026 ⛳</title>',
                     f'Wednesday Night Scramble {SEASON} ⛳</title>')
    t = must_replace(t, '<h1>Wednesday Night Scramble 2026</h1>',
                     f'<h1>Wednesday Night Scramble {SEASON}</h1>\n'
                     '    <a href="2026.html" style="color:#d4af37;font-size:12px;text-decoration:none">📜 2026 final results</a>')

    # Fresh season data: same roster, empty standings, 2027 Wednesdays.
    start = t.index('const APP_DATA = ') + len('const APP_DATA = ')
    data, length = json.JSONDecoder().raw_decode(t[start:])
    dates = [(FIRST_WEDNESDAY + dt.timedelta(weeks=i)) for i in range(WEEKS)]
    fresh = {
        'roster': data['roster'],
        'leaderboard': [],
        # every roster player listed from day one (Yearly Points / Weekly Payout), all at zero
        'yearly': [{'name': p['name'], 'hcp': p['hcp'], 'pts': 0, 'scores': [0] * WEEKS} for p in data['roster']],
        'weekDates': [f'{d.month}/{d.day}' for d in dates],
        'weeklyPayout': [{'name': p['name'], 'results': [''] * WEEKS, 'total': 0} for p in data['roster']],
        'pairingHistory': {},
    }
    t = t[:start] + json.dumps(fresh, separators=(',', ':')) + t[start + length:]

    t = must_replace(t, 'const FIREBASE_RESULTS_START_IDX = 14;',
                     'const FIREBASE_RESULTS_START_IDX = 0; // no locked weeks this season')

    # Season-only records live in their own documents; shared ones stay in wns2.
    t = must_replace(t, 'const db = firebase.firestore();',
                     'const db = firebase.firestore();\n'
                     f'// {SEASON} SEASON: week-by-week records (check-ins, week #, pairings, holes, live round, results)\n'
                     f"// live in wns2/<name>{SEASON}. The 2026 records stay as they were for /2026.html.\n"
                     '// Player list, Index & Tees and handicap overrides stay shared in wns2.\n'
                     f'const SEASON = {SEASON};\n'
                     "const SD = id => db.collection('wns2').doc(id + SEASON);")
    for doc in ('pairings', 'holes', 'round', 'results'):
        t = t.replace(f"db.collection('wns2').doc('{doc}')", f"SD('{doc}')")

    # loadState: season fields from the season doc, handicap overrides from the shared doc.
    t = must_replace(t,
        "    const doc = await db.collection('wns2').doc('state').get();\n"
        "    if (doc.exists) {\n"
        "      const d = doc.data();\n"
        "      if (d.playing) state.playing = d.playing;\n"
        "      if (d.hcps)    state.hcps    = d.hcps;\n",
        "    const shared = await db.collection('wns2').doc('state').get();\n"
        "    if (shared.exists && shared.data().hcps) state.hcps = shared.data().hcps;\n"
        "    const doc = await SD('state').get();\n"
        "    if (doc.exists) {\n"
        "      const d = doc.data();\n"
        "      if (d.playing) state.playing = d.playing;\n")
    # saveState: season fields to the season doc, handicap overrides to the shared doc.
    t = must_replace(t,
        "    await db.collection('wns2').doc('state').set({\n"
        "      playing: state.playing,\n"
        "      hcps: state.hcps,\n"
        "      weekNum: state.weekNum,\n",
        "    await db.collection('wns2').doc('state').set({ hcps: state.hcps }, { merge: true });\n"
        "    await SD('state').set({\n"
        "      playing: state.playing,\n"
        "      weekNum: state.weekNum,\n")
    # Reset only wipes this season's records, never the shared player list or 2026.
    t = must_replace(t,
        "    ['state','results','players','pairings','holes','round'].forEach(docId => {\n"
        "      batch.delete(db.collection('wns2').doc(docId));\n"
        "    });",
        "    ['state','results','pairings','holes','round'].forEach(docId => {\n"
        "      batch.delete(SD(docId));\n"
        "    });")
    t = must_replace(t,
        "This will wipe ALL Firebase data (RSVPs, HCP overrides, extra players, week 15+ results) and start fresh.\\n\\nWeeks 1–14 data in the app is safe — it lives in the HTML, not Firebase.",
        f"This will wipe the season records ({SEASON} check-ins, week number, pairings, holes, live round and results) and start the season over.\\n\\nThe player list, Index & Tees, handicaps and the 2026 season are not touched.")
    t = must_replace(t, "alert('✅ Firebase reset complete. App is using hardcoded data for weeks 1–14.');",
                     f"alert('✅ {SEASON} season records cleared.');")
    t = must_replace(t, '    state.hcps = {};\n    state.weekNum = 15;', '    state.weekNum = 1;')
    t = must_replace(t, "document.getElementById('week-num').value = 15;",
                     "document.getElementById('week-num').value = 1;")
    t = must_replace(t, 'let state = {playing:{}, hcps:{}, weekNum:15, reroll:1, adminVisible:true};',
                     'let state = {playing:{}, hcps:{}, weekNum:1, reroll:1, adminVisible:true};')
    t = must_replace(t, 'id="week-num" min="1" max="34" value="15"', 'id="week-num" min="1" max="34" value="1"')

    # Live listeners: check-ins from the season doc, handicap overrides from the shared doc.
    t = must_replace(t,
        "  db.collection('wns2').doc('state').onSnapshot(doc => {\n"
        "    if (!doc.exists) return;\n"
        "    const d = doc.data();\n"
        "    if (d.playing) { state.playing = d.playing; renderPlayers(); }\n"
        "    if (d.hcps)    { state.hcps    = d.hcps; }\n"
        "  });",
        "  SD('state').onSnapshot(doc => {\n"
        "    if (!doc.exists) return;\n"
        "    const d = doc.data();\n"
        "    if (d.playing) { state.playing = d.playing; renderPlayers(); }\n"
        "  });\n"
        "  db.collection('wns2').doc('state').onSnapshot(doc => {\n"
        "    if (doc.exists && doc.data().hcps) state.hcps = doc.data().hcps;\n"
        "  });")

    left = re.findall(r"db\.collection\('wns2'\)\.doc\('(\w+)'\)", t)
    bad = [d for d in left if d not in ('state', 'players', 'handicaps')]
    if bad:
        raise SystemExit(f'season records still pointing at 2026: {bad}')
    return t


if __name__ == '__main__':
    app, archive = sys.argv[1], sys.argv[2]
    src = open(app, encoding='utf-8').read()
    if 'Wednesday Night Scramble 2026</h1>' not in src:
        raise SystemExit(f'{app} is not the 2026 app (already rolled over?)')
    open(archive, 'w', encoding='utf-8').write(make_archive(src))
    open(app, 'w', encoding='utf-8').write(make_season(src))
    print(f'wrote {archive} (2026, view only) and {app} ({SEASON})')
