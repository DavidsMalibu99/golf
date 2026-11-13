"""Add a Skins pot (with per-player opt-out) to the Stableford game in Weekendgames.html.

Usage: python3 tools/add_skins.py <path to Weekendgames.html>
Edits the file in place. Safe to run once per file (refuses if Skins is already there).
"""
import sys

path = sys.argv[1]
s = open(path, encoding='utf-8').read()
if 'potrow-skins' in s:
    sys.exit('Skins is already in ' + path)


def rep(a, b, count=1):
    global s
    n = s.count(a)
    if n != count:
        sys.exit(f'{path}: expected {count} match(es), found {n}:\n{a[:200]}')
    s = s.replace(a, b)


# ---- setup rows ----
rep('''      <div class="pot-total">Buy-in: $<span id="sbBuyInTotal">20.00</span> per player</div>''',
    '''      <div class="pot-row off" id="potrow-skins">
        <input type="checkbox" id="sbPotSkinsOn" onchange="sbSyncPotRows(); sbRenderGroupSetup()">
        <span class="pot-label">Skins</span>
        <input type="number" class="pot-amt" id="sbPotSkins" step="0.01" value="5.00" oninput="sbSyncPotRows()">
      </div>
      <div class="pot-row off" id="potrow-skinsopt" style="font-size:0.82rem; color:var(--cream); gap:16px; flex-wrap:wrap;">
        <span style="display:inline-flex; align-items:center; gap:6px;"><input type="checkbox" id="sbSkinsNet" onchange="sbSyncPotRows()"> Net (strokes off the index)</span>
        <span style="display:inline-flex; align-items:center; gap:6px;"><input type="checkbox" id="sbSkinsCarry" checked onchange="sbSyncPotRows()"> Ties carry over</span>
      </div>
      <div class="hint" id="sbSkinsHint" style="margin-top:-2px; display:none;">Lowest score on a hole, if nobody ties it, wins the skin. Not playing Skins? Tap <b>Skins ✓</b> next to his name in the group list below.</div>
      <div class="pot-total">Buy-in: $<span id="sbBuyInTotal">20.00</span> per player</div>''')

# ---- state ----
rep('''let sbNoMoney = {};      // setup only: name -> true when the player is in for scores only (not the money game)''',
    '''let sbNoMoney = {};      // setup only: name -> true when the player is in for scores only (not the money game)
let sbSkinsOut = {};     // setup only: name -> true when the player is in the Stableford but not the Skins''')
rep('''  sbNoMoney = {};''', '''  sbNoMoney = {};
  sbSkinsOut = {};''')

# ---- pots: defaults, totals, read/write ----
rep('''function sbDefaultPots(){
  return {front:5, back:5, par3:5, draw:5, par4:5, par5:5, frontOn:true, backOn:true, par3On:true, drawOn:true, par4On:false, par5On:false, pay2:false, playoff:false};
}''', '''function sbDefaultPots(){
  return {front:5, back:5, par3:5, draw:5, par4:5, par5:5, frontOn:true, backOn:true, par3On:true, drawOn:true, par4On:false, par5On:false, pay2:false, playoff:false,
          skins:5, skinsOn:false, skinsNet:false, skinsCarry:true, skinsOut:[]};
}''')
rep('''       + (pots.par4On ? pots.par4 : 0) + (pots.par5On ? pots.par5 : 0);''',
    '''       + (pots.par4On ? pots.par4 : 0) + (pots.par5On ? pots.par5 : 0)
       + (pots.skinsOn ? (pots.skins || 0) : 0);''')
rep('''    pay2:    (document.getElementById('sbPay2On') || {}).checked === true,
    playoff: true   // every round set up from here on uses the card playoff on the nines
  };''', '''    pay2:    (document.getElementById('sbPay2On') || {}).checked === true,
    playoff: true,  // every round set up from here on uses the card playoff on the nines
    skins:   num('sbPotSkins',5),
    skinsOn: (document.getElementById('sbPotSkinsOn') || {}).checked === true,
    skinsNet: (document.getElementById('sbSkinsNet') || {}).checked === true,
    skinsCarry: (document.getElementById('sbSkinsCarry') || {checked:true}).checked !== false,
    skinsOut: Object.keys(sbSkinsOut)
  };''')
rep('''  setChk('sbPay2On', sbPots.pay2);
  sbSyncPotRows();''', '''  setChk('sbPay2On', sbPots.pay2);
  set('sbPotSkins', sbPots.skins ?? 5);
  setChk('sbPotSkinsOn', sbPots.skinsOn); setChk('sbSkinsNet', sbPots.skinsNet); setChk('sbSkinsCarry', sbPots.skinsCarry !== false);
  sbSyncPotRows();''')
rep('''  const p2 = document.getElementById('potrow-pay2');
  if(p2) p2.classList.toggle('off', !sbPots.pay2);''', '''  const p2 = document.getElementById('potrow-pay2');
  if(p2) p2.classList.toggle('off', !sbPots.pay2);
  ['potrow-skins','potrow-skinsopt'].forEach(id=>{ const r = document.getElementById(id); if(r) r.classList.toggle('off', !sbPots.skinsOn); });
  const sk = document.getElementById('potrow-skinsopt'); if(sk) sk.style.display = sbPots.skinsOn ? '' : 'none';
  const skh = document.getElementById('sbSkinsHint'); if(skh) skh.style.display = sbPots.skinsOn ? '' : 'none';''')

# ---- group list: Skins ✓ / No Skins pill ----
rep('''  Object.keys(sbNoMoney).forEach(n=>{ if(!names.includes(n)) delete sbNoMoney[n]; });''',
    '''  Object.keys(sbNoMoney).forEach(n=>{ if(!names.includes(n)) delete sbNoMoney[n]; });
  Object.keys(sbSkinsOut).forEach(n=>{ if(!names.includes(n)) delete sbSkinsOut[n]; });
  const skinsOnNow = (document.getElementById('sbPotSkinsOn') || {}).checked === true;''')
rep('''      <button type="button" class="money-pill${sbNoMoney[name] ? ' off' : ''}" onclick="sbToggleMoney(${i})" title="Tap to switch between the money game and scores only">${sbNoMoney[name] ? 'Scores only' : '💲 In'}</button>''',
    '''      <button type="button" class="money-pill${sbNoMoney[name] ? ' off' : ''}" onclick="sbToggleMoney(${i})" title="Tap to switch between the money game and scores only">${sbNoMoney[name] ? 'Scores only' : '💲 In'}</button>
      ${skinsOnNow && !sbNoMoney[name] ? `<button type="button" class="money-pill${sbSkinsOut[name] ? ' off' : ''}" onclick="sbToggleSkins(${i})" title="Tap if he is not playing Skins">${sbSkinsOut[name] ? 'No Skins' : 'Skins ✓'}</button>` : ''}''')
rep('''// ✕ in the groups list: take the player out of today's round and put him back in the checklist''',
    '''// Skins ✓ / No Skins pill: in the Stableford but sitting the Skins out.
function sbToggleSkins(i){
  const name = _sbSetupNames[i];
  if(name === undefined) return;
  if(sbSkinsOut[name]) delete sbSkinsOut[name]; else sbSkinsOut[name] = true;
  sbReadPotInputs();
  sbRenderGroupSetup();
}

// ✕ in the groups list: take the player out of today's round and put him back in the checklist''')

# ---- start round: lock the Skins list, check there's a game ----
rep('''  if(sbPlayers.filter(p=>!p.noMoney).length < 2){
    alert('At least 2 players need to be in the money game (💲 In).');
    return;
  }''', '''  if(sbPlayers.filter(p=>!p.noMoney).length < 2){
    alert('At least 2 players need to be in the money game (💲 In).');
    return;
  }
  sbPots.skinsOut = sbPlayers.filter(p=>!p.noMoney && sbSkinsOut[p.name]).map(p=>p.name);
  if(sbPots.skinsOn && sbPlayers.filter(p=>!p.noMoney && !sbSkinsOut[p.name]).length < 2){
    alert('Skins needs at least 2 players in it. Tap "No Skins" on someone to put him back in, or untick Skins.');
    return;
  }''')

# ---- scoring ----
rep('''function computeSbBoardData(playersArr, scoresObj, pots, draw, course){''',
    '''// Skins: every hole is worth one skin; the outright low score wins it. With carryovers a
// tied hole carries to the next. The pot (per-player amount x players in Skins) is split by
// skins won, to the cent; skins still carrying after 18 go to the skin winners. Scores-only
// players and anyone who opted out ("No Skins") aren't in it. While a hole is waiting on a
// score, later holes wait too when ties carry over.
function computeSbSkins(playersArr, scoresObj, pots, course){
  if(!pots || !pots.skinsOn) return null;
  const out = new Set(pots.skinsOut || []);
  const field = playersArr.filter(p=>!p.noMoney && !out.has(p.name));
  const amt = Number(pots.skins) || 0;
  const pot = Math.round(amt * field.length * 100) / 100;
  const won = {}; field.forEach(p=>{ won[p.name] = 0; });
  const holes = [];
  let carry = 0, blocked = false;
  const scoreOf = (p, h)=>{
    const g = (scoresObj[p.name] || [])[h];
    if(g === null || g === undefined || isNaN(g)) return null;
    return pots.skinsNet ? g - sbStrokesOnHole(p.hcp, h, course.si) : g;
  };
  for(let h=0; h<18; h++){
    const sc = field.map(p=>({name:p.name, s:scoreOf(p, h)}));
    if(sc.some(x=>x.s === null)){
      holes.push({hole:h+1, text: blocked ? 'Waiting on an earlier hole' : 'Waiting on scores', waiting:true});
      if(pots.skinsCarry !== false) blocked = true;
      continue;
    }
    if(blocked){ holes.push({hole:h+1, text:'Waiting on an earlier hole', waiting:true}); continue; }
    const low = Math.min(...sc.map(x=>x.s));
    const lows = sc.filter(x=>x.s === low);
    if(lows.length === 1){
      const worth = 1 + carry; carry = 0;
      won[lows[0].name] += worth;
      holes.push({hole:h+1, low, winner:lows[0].name, worth, text:`${lows[0].name} wins ${worth} skin${worth>1?'s':''}`});
    } else if(pots.skinsCarry !== false){
      carry++;
      holes.push({hole:h+1, low, text:`${lows.length} tied, carries (${carry+1} on next)`});
    } else {
      holes.push({hole:h+1, low, text:`${lows.length} tied, no skin`});
    }
  }
  const total = Object.values(won).reduce((a,b)=>a+b, 0);
  const pay = {};
  if(total){
    // Split to the cent; leftover cents go to the most skins first.
    const cents = Math.round(pot * 100);
    const names = Object.keys(won).filter(n=>won[n]).sort((a,b)=>won[b]-won[a] || a.localeCompare(b));
    let given = 0;
    names.forEach(n=>{ pay[n] = Math.floor(cents * won[n] / total); given += pay[n]; });
    for(let k=0; given < cents; k = (k+1) % names.length){ pay[names[k]]++; given++; }
    names.forEach(n=>{ pay[n] = pay[n] / 100; });
  }
  const done = holes.filter(x=>!x.waiting).length === 18;
  return {pot, amt, field: field.map(p=>p.name), out: [...out], holes, won, total, carry, pay, done, net: !!pots.skinsNet, carryOn: pots.skinsCarry !== false};
}

function computeSbBoardData(playersArr, scoresObj, pots, draw, course){''')
rep('''    drawPot, draw: drawResult
  };
}''', '''    drawPot, draw: drawResult,
    skins: computeSbSkins(playersArr, scoresObj, pots, course)
  };
}''')

# ---- money tab: Skins card ----
rep('''  if(html === courseLine) html += '<div class="empty">No pots are turned on for this round.</div>';
  return html;''', '''  // Skins
  if(data.skins){
    const sk = data.skins;
    const winners = Object.keys(sk.won).filter(n=>sk.won[n]).sort((a,b)=>sk.won[b]-sk.won[a] || a.localeCompare(b));
    const perSkin = sk.total ? ' · about $' + sbMoney(sk.pot / sk.total) + ' a skin' : '';
    html += `<div class="pot-card"><span class="pot-amount">$${sk.pot.toFixed(2)}</span>
      <h3>Skins</h3><div class="pot-sub">$${sbMoney(sk.amt)} × ${sk.field.length} players · ${sk.net ? 'net' : 'gross'} · ${sk.carryOn ? 'ties carry over' : 'ties: no skin'}${perSkin}</div>` +
      (winners.length ? winners.map(n=>`<div class="pot-line win"><span class="pl-name">${n}</span><span class="pl-val">${sk.won[n]} skin${sk.won[n]>1?'s':''} &nbsp;<span class="win-pill">+$${sbMoney(sk.pay[n])}</span></span></div>`).join('')
        : '<div class="pot-line"><span class="pl-name" style="color:var(--text-dim)">No skins won yet.</span></div>') +
      `<details style="margin-top:6px;"><summary class="hint" style="cursor:pointer;">Hole by hole</summary>` +
      sk.holes.map(x=>`<div class="pot-line"><span class="pl-name">Hole ${x.hole}${x.low!=null ? ' · low ' + x.low : ''}</span><span class="pl-val" style="color:var(--text-dim)">${x.text}</span></div>`).join('') + `</details>` +
      (sk.out.length ? `<div class="hint" style="margin-top:6px;">Not in Skins: ${sk.out.join(', ')}</div>` : '') +
      (sk.done && sk.carry && sk.total ? `<div class="hint">${sk.carry} skin${sk.carry>1?'s':''} still carrying after 18, shared by the skin winners.</div>` : '') +
      (sk.done && !sk.total ? `<div class="hint">No skins won, so nobody pays.</div>` : '') +
      `</div>`;
  }

  if(html === courseLine) html += '<div class="empty">No pots are turned on for this round.</div>';
  return html;''')

open(path, 'w', encoding='utf-8').write(s)
print('Skins added to', path)
