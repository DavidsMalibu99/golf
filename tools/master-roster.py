#!/usr/bin/env python3
"""One master player list for the Wednesday Scramble, Weekend Games, More Games and KC vs CH.

The master list lives in Firestore at wns2/players.roster:
    [{id, name, hcp, ghin, active}]
Every page builds its player list from it (active players only). The older wns2/players.extra
list is left as it is so the 2026 archive page keeps working.

Index & Tees (wns2/handicaps) and handicap overrides (wns2/state.hcps) stay keyed by name;
renaming a player in the Players editor moves those records to the new name.

    python3 tools/master-roster.py app.html Weekendgames.html Moregames.html kcvsch.html \
        dev/app.html dev/Weekendgames.html dev/Moregames.html
"""
import sys


def rep(t, old, new, label):
    if t.count(old) != 1:
        raise SystemExit(f'{label}: expected 1 match, found {t.count(old)}')
    return t.replace(old, new)


SYNC_OLD = """  if(!doc.exists || !doc.data().extra) return;
  const extras = doc.data().extra;
  const added = [];
"""
SYNC_NEW = """  if(!doc.exists) return;
  const d = doc.data() || {};
  // Master player list (wns2/players.roster) when it exists: one list for every app.
  const master = Array.isArray(d.roster) && d.roster.length ? d.roster.filter(p => p.active !== false) : null;
  const extras = master || d.extra || [];
  const added = [];
  if (master) { const keep = new Set(master.map(p => p.name)); for (let i = ROSTER.length - 1; i >= 0; i--) if (!keep.has(ROSTER[i])) ROSTER.splice(i, 1); }
"""

KC_OLD = """  if(!doc.exists || !doc.data().extra) return;
  let added = false;
  doc.data().extra.forEach(p=>{"""
KC_NEW = """  if(!doc.exists) return;
  const d = doc.data() || {};
  // Master player list (wns2/players.roster) when it exists: one list for every app.
  const master = Array.isArray(d.roster) && d.roster.length ? d.roster.filter(p => p.active !== false) : null;
  let added = false;
  if (master) { const keep = new Set(master.map(p => p.name)); for (let i = ROSTER.length - 1; i >= 0; i--) if (!keep.has(ROSTER[i])) { ROSTER.splice(i, 1); added = true; } }
  (master || d.extra || []).forEach(p=>{"""

APP_LOAD_OLD = """async function loadExtraPlayers() {
  try {
    const doc = await db.collection('wns2').doc('players').get();
    if (doc.exists && doc.data().extra) {
      doc.data().extra.forEach(p => {
        if (!APP_DATA.roster.find(r => r.name === p.name)) {
          APP_DATA.roster.push({name: p.name, hcp: p.hcp});
          APP_DATA.weeklyPayout.push({name: p.name, results: Array(34).fill(''), total: 0});
          APP_DATA.yearly.push({name: p.name, hcp: p.hcp, pts: 0, scores: Array(34).fill(0)});
        }
      });
    }
  } catch(e) { console.log('loadExtraPlayers error:', e); }
}"""
APP_LOAD_NEW = r"""// ── MASTER PLAYER LIST ─────────────────────────────────────────────────────
// wns2/players.roster = [{id, name, hcp, ghin, active}] is the one player list shared by this app,
// Weekend Games, More Games, KC vs CH and the MSG App league groups. Inactive players are hidden
// but keep their past results. (wns2/players.extra is the older list, kept for the 2026 page.)
let MASTER_ROSTER = null;

async function loadExtraPlayers() {
  try {
    const doc = await db.collection('wns2').doc('players').get();
    const d = doc.exists ? (doc.data() || {}) : {};
    if (Array.isArray(d.roster) && d.roster.length) {
      MASTER_ROSTER = d.roster;
      APP_DATA.roster = d.roster.filter(p => p.active !== false).map(p => ({name: p.name, hcp: p.hcp}));
    } else if (d.extra) {
      d.extra.forEach(p => {
        if (!APP_DATA.roster.find(r => r.name === p.name)) APP_DATA.roster.push({name: p.name, hcp: p.hcp});
      });
    }
    // Standings list everyone on the roster, plus anyone no longer on it who has results.
    const on = new Set(APP_DATA.roster.map(p => p.name));
    APP_DATA.weeklyPayout = APP_DATA.weeklyPayout.filter(p => on.has(p.name) || p.results.some(r => r));
    APP_DATA.yearly = APP_DATA.yearly.filter(p => on.has(p.name) || p.scores.some(s => s));
    APP_DATA.roster.forEach(p => {
      if (!APP_DATA.weeklyPayout.find(x => x.name === p.name)) APP_DATA.weeklyPayout.push({name: p.name, results: Array(34).fill(''), total: 0});
      if (!APP_DATA.yearly.find(x => x.name === p.name)) APP_DATA.yearly.push({name: p.name, hcp: p.hcp, pts: 0, scores: Array(34).fill(0)});
    });
  } catch(e) { console.log('loadExtraPlayers error:', e); }
}

function newRosterId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}

async function saveMasterRoster() {
  await db.collection('wns2').doc('players').set({ roster: MASTER_ROSTER }, { merge: true });
}

function rosterEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 👥 Players: fix names, add GHIN numbers, hide players who've left. One place for every app.
function openRosterEditor() {
  if (!MASTER_ROSTER) { alert('The master player list is not set up yet.'); return; }
  let box = document.getElementById('roster-editor');
  if (!box) {
    box = document.createElement('div'); box.id = 'roster-editor';
    box.style.cssText = 'position:fixed;inset:0;z-index:2500;background:rgba(0,0,0,.45);overflow:auto;padding:16px';
    document.body.appendChild(box);
  }
  const cell = 'padding:4px;border-bottom:1px solid #eee';
  const rows = [...MASTER_ROSTER].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<tr data-id="${rosterEsc(p.id)}">
      <td style="${cell}"><input data-k="name" value="${rosterEsc(p.name)}" style="width:100%;min-width:150px;box-sizing:border-box"></td>
      <td style="${cell}"><input data-k="ghin" value="${rosterEsc(p.ghin || '')}" inputmode="numeric" placeholder="GHIN #" style="width:90px"></td>
      <td style="${cell};text-align:center"><input type="checkbox" data-k="active" ${p.active !== false ? 'checked' : ''}></td></tr>`).join('');
  box.innerHTML = `<div style="background:#fff;max-width:620px;margin:0 auto;border-radius:12px;padding:16px;font-size:13px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0">👥 Players</h3>
      <button class="btn gray" onclick="document.getElementById('roster-editor').remove()">Close</button></div>
    <p style="color:#666;margin:0 0 10px">One player list for the Wednesday Scramble, Weekend Games, More Games, KC vs CH and the MSG App league groups. Fix a name, add a GHIN number, or untick <b>Active</b> to hide someone who has left. Past results keep the name they were played under. Handicaps are still set with 🏌️ Index &amp; Tees.</p>
    <table style="width:100%;border-collapse:collapse" id="roster-table">
      <tr><th style="text-align:left">Name</th><th>GHIN #</th><th>Active</th></tr>${rows}</table>
    <div id="roster-msg" style="margin:8px 0;font-size:12px"></div>
    <button class="btn" style="background:#2d6a4f" onclick="saveRosterEditor()">Save</button>
  </div>`;
}

async function saveRosterEditor() {
  const msg = document.getElementById('roster-msg');
  const next = MASTER_ROSTER.map(p => ({ ...p }));
  const renames = {};
  for (const tr of document.querySelectorAll('#roster-table tr[data-id]')) {
    const p = next.find(x => x.id === tr.dataset.id);
    if (!p) continue;
    const nm = tr.querySelector('[data-k=name]').value.trim().replace(/\s+/g, ' ');
    const ghin = tr.querySelector('[data-k=ghin]').value.replace(/\D/g, '');
    if (!nm) { msg.style.color = '#c0392b'; msg.textContent = 'Every player needs a name.'; return; }
    if (nm !== p.name) renames[p.name] = nm;
    p.name = nm; p.ghin = ghin; p.active = tr.querySelector('[data-k=active]').checked;
  }
  const seen = new Set();
  for (const p of next) {
    const k = p.name.toLowerCase();
    if (seen.has(k)) { msg.style.color = '#c0392b'; msg.textContent = `Two players are named "${p.name}".`; return; }
    seen.add(k);
  }
  msg.style.color = '#555'; msg.textContent = 'Saving…';
  try {
    if (Object.keys(renames).length) {
      // Move each renamed player's index, tees, handicap override and check-in to the new name.
      const rk = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [renames[k] || k, v]));
      const hd = (await db.collection('wns2').doc('handicaps').get()).data();
      if (hd && hd.players) await db.collection('wns2').doc('handicaps').update({ players: rk(hd.players) });
      const sh = (await db.collection('wns2').doc('state').get()).data();
      if (sh && sh.hcps) await db.collection('wns2').doc('state').update({ hcps: rk(sh.hcps) });
      const ss = (await SD('state').get()).data();
      if (ss && ss.playing) await SD('state').update({ playing: rk(ss.playing) });
    }
    MASTER_ROSTER = next;
    await saveMasterRoster();
    location.reload();
  } catch (e) {
    msg.style.color = '#c0392b'; msg.textContent = 'Could not save: ' + e.message;
  }
}"""

APP_ADD_OLD = """    await db.collection('wns2').doc('players').set({
      extra: APP_DATA.roster.filter(p => !ORIGINAL_ROSTER.includes(p.name))
        .map(p => ({name: p.name, hcp: p.hcp}))
    });"""
APP_ADD_NEW = """    if (MASTER_ROSTER) {
      MASTER_ROSTER.push({ id: newRosterId(name), name, hcp, ghin: '', active: true });
      await saveMasterRoster();
    } else {
      await db.collection('wns2').doc('players').set({
        extra: APP_DATA.roster.filter(p => !ORIGINAL_ROSTER.includes(p.name))
          .map(p => ({name: p.name, hcp: p.hcp}))
      }, { merge: true });
    }"""

APP_BTN_OLD = """<button class="btn" onclick="openHcEditor()" style="background:#1a6b8a">🏌️ Index &amp; Tees</button>"""
APP_BTN_NEW = APP_BTN_OLD + """
      <button class="btn" onclick="openRosterEditor()" style="background:#7a5c1e">👥 Players</button>"""


for f in sys.argv[1:]:
    t = open(f, encoding='utf-8').read()
    name = f.split('/')[-1]
    if 'MASTER_ROSTER' in t or 'Master player list' in t:
        print('already done', f); continue
    if name == 'app.html':
        t = rep(t, APP_LOAD_OLD, APP_LOAD_NEW, f + ' load')
        t = rep(t, APP_ADD_OLD, APP_ADD_NEW, f + ' add')
        t = rep(t, APP_BTN_OLD, APP_BTN_NEW, f + ' button')
    elif name == 'kcvsch.html':
        t = rep(t, KC_OLD, KC_NEW, f)
    else:
        t = rep(t, SYNC_OLD, SYNC_NEW, f)
    open(f, 'w', encoding='utf-8').write(t)
    print('updated', f)
