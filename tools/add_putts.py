"""Add Low putts (pot) and One-putt / Polly / Sandy dots to the Stableford game in Weekendgames.html.

Usage: python3 tools/add_putts.py <path to Weekendgames.html>
Edits the file in place. Safe to run once per file (refuses if it is already there).

Storage: each player's extras live in scoresJSON under "<name>|x", an 18-slot array whose
cells are {p: putts, y: 1 (polly), s: 1 (sandy)} or null. They ride the same per-cell
merge as scores, so two phones can't erase each other's entries.
Money: Low putts is a pot like the others (in the buy-in, pays 70/30 when that's on).
Dots aren't in the buy-in: each one collects its amount from every other money player.
"""
import sys

path = sys.argv[1]
s = open(path, encoding='utf-8').read()
if 'potrow-putts' in s:
    sys.exit('Putts are already in ' + path)


def rep(a, b, count=1):
    global s
    n = s.count(a)
    if n != count:
        sys.exit(f'{path}: expected {count} match(es), found {n}:\n{a[:200]}')
    s = s.replace(a, b)


# ---- CSS ----
rep('''  .money-pill.off{''', '''  .sbx-row{display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin:-4px 0 10px 44px;}
  .sbx-row .sbx-lbl{font-size:0.7rem; color:var(--text-dim); margin-right:2px;}
  .sbx-chip{flex:none; width:auto; min-width:30px; border:1px solid var(--text-dim); background:transparent; color:var(--cream); border-radius:12px; padding:3px 8px; font-size:0.72rem; font-weight:bold; cursor:pointer;}
  .sbx-chip.on{background:var(--gold); border-color:var(--gold); color:var(--dark-green);}
  .money-pill.off{''')

# ---- setup rows ----
rep('''      <div class="pot-total">Buy-in: $<span id="sbBuyInTotal">20.00</span> per player</div>''',
    '''      <div class="pot-row off" id="potrow-putts">
        <input type="checkbox" id="sbPotPuttsOn" onchange="sbSyncPotRows()">
        <span class="pot-label">Low putts</span>
        <input type="number" class="pot-amt" id="sbPotPutts" step="0.01" value="5.00" oninput="sbSyncPotRows()">
      </div>
      <div class="hint" id="sbPuttsHint" style="margin-top:-2px; display:none;">Fewest total putts wins. Putts are tapped on each hole; only players with all 18 in can win.</div>
      <div class="pot-total">Buy-in: $<span id="sbBuyInTotal">20.00</span> per player</div>

      <label>Dots <span style="font-weight:normal; color:var(--text-dim);">(not in the buy-in: each one collects from every other player)</span></label>
      <div class="pot-row off" id="potrow-oneputt">
        <input type="checkbox" id="sbDotOneputtOn" onchange="sbSyncPotRows()">
        <span class="pot-label">One-putts</span>
        <input type="number" class="pot-amt" id="sbDotOneputt" step="0.01" value="1.00" oninput="sbSyncPotRows()">
      </div>
      <div class="pot-row off" id="potrow-polly">
        <input type="checkbox" id="sbDotPollyOn" onchange="sbSyncPotRows()">
        <span class="pot-label">Pollies (putt longer than the flagstick)</span>
        <input type="number" class="pot-amt" id="sbDotPolly" step="0.01" value="1.00" oninput="sbSyncPotRows()">
      </div>
      <div class="pot-row off" id="potrow-sandy">
        <input type="checkbox" id="sbDotSandyOn" onchange="sbSyncPotRows()">
        <span class="pot-label">Sandies (par or better from a bunker)</span>
        <input type="number" class="pot-amt" id="sbDotSandy" step="0.01" value="1.00" oninput="sbSyncPotRows()">
      </div>''')

# ---- pots: defaults, totals, read/write ----
rep('''          skins:5, skinsOn:false, skinsNet:false, skinsCarry:true, skinsOut:[]};
}''', '''          skins:5, skinsOn:false, skinsNet:false, skinsCarry:true, skinsOut:[],
          putts:5, puttsOn:false, oneputt:1, oneputtOn:false, polly:1, pollyOn:false, sandy:1, sandyOn:false};
}''')
rep('''       + (pots.skinsOn ? (pots.skins || 0) : 0);''',
    '''       + (pots.skinsOn ? (pots.skins || 0) : 0)
       + (pots.puttsOn ? (pots.putts || 0) : 0);''')
rep('''    skinsOut: Object.keys(sbSkinsOut)
  };''', '''    skinsOut: Object.keys(sbSkinsOut),
    putts:   num('sbPotPutts',5),   puttsOn:   (document.getElementById('sbPotPuttsOn') || {}).checked === true,
    oneputt: num('sbDotOneputt',1), oneputtOn: (document.getElementById('sbDotOneputtOn') || {}).checked === true,
    polly:   num('sbDotPolly',1),   pollyOn:   (document.getElementById('sbDotPollyOn') || {}).checked === true,
    sandy:   num('sbDotSandy',1),   sandyOn:   (document.getElementById('sbDotSandyOn') || {}).checked === true
  };''')
rep('''  setChk('sbPotSkinsOn', sbPots.skinsOn); setChk('sbSkinsNet', sbPots.skinsNet); setChk('sbSkinsCarry', sbPots.skinsCarry !== false);''',
    '''  setChk('sbPotSkinsOn', sbPots.skinsOn); setChk('sbSkinsNet', sbPots.skinsNet); setChk('sbSkinsCarry', sbPots.skinsCarry !== false);
  set('sbPotPutts', sbPots.putts ?? 5); setChk('sbPotPuttsOn', sbPots.puttsOn);
  set('sbDotOneputt', sbPots.oneputt ?? 1); setChk('sbDotOneputtOn', sbPots.oneputtOn);
  set('sbDotPolly', sbPots.polly ?? 1); setChk('sbDotPollyOn', sbPots.pollyOn);
  set('sbDotSandy', sbPots.sandy ?? 1); setChk('sbDotSandyOn', sbPots.sandyOn);''')
rep('''  const skh = document.getElementById('sbSkinsHint'); if(skh) skh.style.display = sbPots.skinsOn ? '' : 'none';''',
    '''  const skh = document.getElementById('sbSkinsHint'); if(skh) skh.style.display = sbPots.skinsOn ? '' : 'none';
  [['potrow-putts','puttsOn'],['potrow-oneputt','oneputtOn'],['potrow-polly','pollyOn'],['potrow-sandy','sandyOn']]
    .forEach(([id,key])=>{ const r = document.getElementById(id); if(r) r.classList.toggle('off', !sbPots[key]); });
  const ph = document.getElementById('sbPuttsHint'); if(ph) ph.style.display = sbPots.puttsOn ? '' : 'none';''')

# ---- storage: extras ride the per-cell score merge ----
rep('''function sbOverlayPending(scores){
  [_sbInFlight, _sbDirty].forEach(src=>{
    Object.keys(src).forEach(name=>{
      if(!scores[name]) return;''', '''function sbOverlayPending(scores){
  [_sbInFlight, _sbDirty].forEach(src=>{
    Object.keys(src).forEach(name=>{
      if(!scores[name] && sbIsXKey(name)) scores[name] = new Array(18).fill(null);
      if(!scores[name]) return;''')
rep('''  Object.keys(pending).forEach(name=>{
    if(!names.has(name)) return;''', '''  Object.keys(pending).forEach(name=>{
    if(!names.has(sbIsXKey(name) ? name.slice(0, -2) : name)) return;''')

# ---- hole screen: putts / polly / sandy chips under each player ----
rep('''        <div id="sbhStep${i}">${sbStepperHtml(name, i, idx, par)}</div>
      </div>`).join('')}''', '''        <div id="sbhStep${i}">${sbStepperHtml(name, i, idx, par)}</div>
      </div><div id="sbhX${i}">${sbExtrasHtml(name, i, idx)}</div>`).join('')}''')
rep('''function sbClearScore(i){ sbSetHoleScore(i, null); }''', '''function sbClearScore(i){ sbSetHoleScore(i, null); }

// ---- Putts, pollies, sandies ----
// Kept in scoresJSON under "<name>|x": 18 cells of {p: putts, y: 1 polly, s: 1 sandy} or null.
function sbIsXKey(k){ return typeof k === 'string' && k.slice(-2) === '|x'; }
function sbXCell(scoresObj, name, idx){
  const a = scoresObj[name + '|x'];
  const c = Array.isArray(a) ? a[idx] : null;
  return c && typeof c === 'object' ? c : {};
}
function sbExtrasOn(pots){ return !!(pots && (pots.puttsOn || pots.oneputtOn || pots.pollyOn || pots.sandyOn)); }
function sbExtrasHtml(name, i, idx){
  if(!sbExtrasOn(sbPots) || sbPlayers.some(p=>p.name===name && p.noMoney)) return '';
  const c = sbXCell(sbScores, name, idx);
  let h = '';
  if(sbPots.puttsOn || sbPots.oneputtOn){
    h += '<span class="sbx-lbl">Putts</span>' + [0,1,2,3,4,5].map(v=>
      `<button type="button" class="sbx-chip${c.p === v ? ' on' : ''}" onclick="sbSetExtra(${i},'p',${v})">${v === 5 ? '5+' : v}</button>`).join('');
  }
  if(sbPots.pollyOn) h += `<button type="button" class="sbx-chip${c.y ? ' on' : ''}" onclick="sbSetExtra(${i},'y',1)">Polly</button>`;
  if(sbPots.sandyOn) h += `<button type="button" class="sbx-chip${c.s ? ' on' : ''}" onclick="sbSetExtra(${i},'s',1)">Sandy</button>`;
  return `<div class="sbx-row">${h}</div>`;
}
// Tap a chip: sets it, or clears it when it's already on.
function sbSetExtra(i, field, v){
  const name = _sbHoleMembers[i];
  if(name === undefined) return;
  const key = name + '|x', idx = sbCurHole;
  if(!Array.isArray(sbScores[key])) sbScores[key] = new Array(18).fill(null);
  const c = Object.assign({}, sbXCell(sbScores, name, idx));
  if(c[field] === v) delete c[field]; else c[field] = v;
  const cell = Object.keys(c).length ? c : null;
  sbScores[key][idx] = cell;
  sbMarkDirty(key, idx, cell);
  const el = document.getElementById('sbhX'+i);
  if(el) el.innerHTML = sbExtrasHtml(name, i, idx);
  sbScoreSaveDebounced();
}

// Low putts pot and the dots, from the extras. Money players only.
function computeSbExtras(rows, scoresObj, pots, n, pay2, odd18){
  if(!sbExtrasOn(pots)) return null;
  const putts = {}, dots = {};
  rows.forEach(r=>{
    let total = 0, thru = 0;
    const d = {oneputt:0, polly:0, sandy:0};
    for(let h=0; h<18; h++){
      const c = sbXCell(scoresObj, r.name, h);
      if(Number.isInteger(c.p)){ total += c.p; thru++; if(c.p === 1 && pots.oneputtOn) d.oneputt++; }
      if(c.y && pots.pollyOn) d.polly++;
      if(c.s && pots.sandyOn) d.sandy++;
    }
    putts[r.name] = {total, thru, complete: thru === 18};
    dots[r.name] = d;
  });
  const P = sbPayWithGhosts(
    rows.filter(r=>putts[r.name].complete).map(r=>({name:r.name, noMoney:r.noMoney, val:putts[r.name].total, scores:r.scores})),
    pots.puttsOn ? (pots.putts || 0) : 0, n, pay2, null, odd18);
  const kinds = [['oneputt','One-putt'],['polly','Polly'],['sandy','Sandy']].filter(([k])=>pots[k + 'On']);
  const money = rows.filter(r=>!r.noMoney);
  const net = {};
  money.forEach(r=>{ net[r.name] = 0; });
  kinds.forEach(([k])=>{
    const amt = Number(pots[k]) || 0;
    money.forEach(r=>{
      const cnt = dots[r.name][k];
      if(!cnt) return;
      net[r.name] += amt * cnt * (money.length - 1);
      money.forEach(o=>{ if(o.name !== r.name) net[o.name] -= amt * cnt; });
    });
  });
  Object.keys(net).forEach(k=>{ net[k] = Math.round(net[k] * 100) / 100; });
  return {putts, puttsPot: P.pot, puttsPay: P.pay, dots, kinds, net};
}''')

# ---- board data ----
rep('''    skins: computeSbSkins(playersArr, scoresObj, pots, course)
  };
}''', '''    skins: computeSbSkins(playersArr, scoresObj, pots, course),
    extras: computeSbExtras(rows, scoresObj, pots, n, pay2, odd18)
  };
}''')

# ---- money tab ----
rep('''  if(html === courseLine) html += '<div class="empty">No pots are turned on for this round.</div>';
  return html;''', '''  // Low putts + dots
  const xt = data.extras;
  if(xt && p.puttsOn){
    const entries = data.rows.filter(r=>xt.putts[r.name].complete)
      .sort((a,b)=>xt.putts[a.name].total - xt.putts[b.name].total)
      .map(r=>({name:r.name, val:xt.putts[r.name].total + ' putts'}));
    const waiting = data.rows.filter(r=>!r.noMoney && !xt.putts[r.name].complete && xt.putts[r.name].thru)
      .map(r=>`${r.name} (${xt.putts[r.name].thru}/18)`);
    html += `<div class="pot-card"><span class="pot-amount">$${xt.puttsPot.toFixed(2)}</span>
      <h3>Low Putts</h3><div class="pot-sub">Fewest total putts · all 18 putts entered to win${p.pay2 ? ' · 1st 70% / 2nd 30%' : ''}</div>
      ${entries.length ? potLines(entries, xt.puttsPay) : '<div class="pot-line"><span class="pl-name" style="color:var(--text-dim)">No full cards of putts yet.</span></div>'}
      ${waiting.length ? `<div class="hint" style="margin-top:6px;">Putts still coming: ${waiting.join(', ')}</div>` : ''}</div>`;
  }
  if(xt && xt.kinds.length){
    const names = Object.keys(xt.net).sort((a,b)=>xt.net[b]-xt.net[a] || a.localeCompare(b));
    const any = names.some(nm=>xt.kinds.some(([k])=>xt.dots[nm][k]));
    html += `<div class="pot-card"><h3>Dots</h3><div class="pot-sub">Each dot collects from every other player: ${xt.kinds.map(([k,l])=>l + ' $' + sbMoney(p[k])).join(' · ')}</div>` +
      (any ? names.map(nm=>{
        const got = xt.kinds.filter(([k])=>xt.dots[nm][k]).map(([k,l])=>xt.dots[nm][k] + ' ' + l.toLowerCase() + (xt.dots[nm][k] > 1 ? 's' : '')).join(', ');
        const v = xt.net[nm];
        return `<div class="pot-line${v > 0 ? ' win' : ''}"><span class="pl-name">${nm}${got ? ' <span style="color:var(--text-dim); font-size:0.8em;">· ' + got + '</span>' : ''}</span><span class="pl-val">${v > 0 ? '<span class="win-pill">+$' + sbMoney(v) + '</span>' : v < 0 ? '−$' + sbMoney(-v) : '$0'}</span></div>`;
      }).join('') : '<div class="pot-line"><span class="pl-name" style="color:var(--text-dim)">No dots yet.</span></div>') +
      `</div>`;
  }

  if(html === courseLine) html += '<div class="empty">No pots are turned on for this round.</div>';
  return html;''')

open(path, 'w', encoding='utf-8').write(s)
print('Putts, pollies and sandies added to', path)
