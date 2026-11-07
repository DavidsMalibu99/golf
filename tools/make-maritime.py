"""Build Maritime.html from Weekendgames.html: the Stableford game turned into the Maritime
monthly game (Low Net / Low Gross, Closest to the Pin on 2 par 3s picked each month, its own
handicaps). Maritime handicaps live at wns2/maritime and never touch GHIN, Stableford or the scramble.
usage: python3 tools/make-maritime.py"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / 'Weekendgames.html').read_text()

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n >= 1, 'missing: ' + old[:80]
    if count == 1: assert n == 1, f'{n}x: ' + old[:80]
    s = s.replace(old, new) if count != 1 else s.replace(old, new, 1)

rep('<title>Money Shots Golf — Wolf</title>', '<title>Money Shots Golf — Maritime</title>')
rep('<div class="sub" id="headerSub">Weekend Games</div>', '<div class="sub" id="headerSub">Maritime</div>')

# Home: only Maritime + monthly settings
rep('''<button class="btn" id="home-wolf" onclick="selectGame('wolf')">🐺 Wolf</button>''',
    '''<button class="btn" id="home-wolf" style="display:none" onclick="selectGame('wolf')">🐺 Wolf</button>''')
rep('''<button class="btn" id="home-stableford" onclick="selectGame('stableford')">⛳ Stableford</button>''',
    '''<button class="btn" id="home-stableford" onclick="selectGame('stableford')">⚓ Maritime</button>
    <button class="btn secondary" onclick="mtOpenSettings()">🏌️ Handicaps &amp; CTP Holes (this month)</button>
    <div id="mtSettings" style="display:none;"></div>''')
for g, lbl in [('nascar','🏁 NASCAR Vegas'),('fourman','👥 4-Man Scramble'),('sweetheart','💑 Sweetheart Scramble')]:
    rep(f'''<button class="btn" id="home-{g}" onclick="selectGame('{g}')">{lbl}</button>''',
        f'''<button class="btn" id="home-{g}" style="display:none" onclick="selectGame('{g}')">{lbl}</button>''')
rep('<div class="hint">Any of these games can run at the same time.',
    '<div class="hint">Maritime: Low Net and Low Gross over 18, plus Closest to the Pin on this month\'s two par 3s. Handicaps here are Maritime\'s own — set them each month; they don\'t change Stableford or the Wednesday scramble.<br><br><span style="display:none">')
rep('picks up right where you left off.</div>\n  </div>\n</div>', 'picks up right where you left off.</span></div>\n  </div>\n</div>')

# Never touch the shared GHIN index / tees doc from this page
rep('''function hcSave(dbRef) {
  return dbRef''', '''function hcSave(dbRef) {
  return Promise.resolve(); // Maritime: never writes the shared GHIN handicaps
  return dbRef''')
rep('''function hcTeeSelect(name, which, onchangeJs, disabled) {
''', '''function hcTeeSelect(name, which, onchangeJs, disabled) {
  return ''; // Maritime: no GHIN tees
''')
rep('''function wgOfferIndexUpdate(name){
''', '''function wgOfferIndexUpdate(name){
  return mtSaveHcp(name); // Maritime: a fix in the round also becomes his Maritime handicap
''')

# Handicaps: Maritime's own monthly list
rep('''function getHcp(name){
  const c = hcCourse(name, 'wkd');''', '''function getHcp(name){
  if(mtData.hcps && mtData.hcps[name] !== undefined && mtData.hcps[name] !== null && mtData.hcps[name] !== '') return Number(mtData.hcps[name]);
  const c = hcCourse(name, 'wkd');''')

MT = r'''
/* ---- Maritime monthly settings: wns2/maritime {hcps:{name:n}, ctpHoles:[1-based hole numbers]} ---- */
let mtData = { hcps:{}, ctpHoles:[] };
const mtRef = weekendDb.collection('wns2').doc('maritime');
mtRef.onSnapshot(doc=>{
  const d = doc.exists ? doc.data() : {};
  mtData = { hcps: d.hcps || {}, ctpHoles: Array.isArray(d.ctpHoles) ? d.ctpHoles : [] };
  if(typeof populateSbRosterChecklist === 'function' && document.getElementById('sbRosterChecks')) populateSbRosterChecklist();
  const box = document.getElementById('mtSettings');
  if(box && box.style.display !== 'none') mtRenderSettings();
}, err=>console.error('maritime settings listener', err));
function mtSaveHcp(name){
  const me = (typeof sbPlayers !== 'undefined') ? sbPlayers.find(p=>p.name===name) : null;
  if(!me) return;
  mtData.hcps[name] = me.hcp;
  mtRef.set({ hcps: mtData.hcps }, { merge:true }).catch(e=>console.error(e));
}
function mtPar3Holes(){
  const c = sbCourse(sbCourseId);
  return (c.par3Idx || []).map(i=>i+1);
}
function mtOpenSettings(){
  const box = document.getElementById('mtSettings');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
  if(box.style.display !== 'none') mtRenderSettings();
}
function mtRenderSettings(){
  const box = document.getElementById('mtSettings');
  const par3 = mtPar3Holes();
  let h = `<h3 style="margin:14px 0 6px;">Closest to the Pin — pick 2 par 3s</h3><div class="hint">${sbCourse(sbCourseId).name}</div><div style="display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 12px;">`;
  par3.forEach(n=>{ h += `<label style="display:flex;align-items:center;gap:4px;margin:0;"><input type="checkbox" class="mt-ctp" value="${n}"${mtData.ctpHoles.includes(n)?' checked':''}> Hole ${n}</label>`; });
  h += `</div><h3 style="margin:10px 0 6px;">Maritime handicaps</h3><div class="hint">Blank = use his regular handicap (shown grey).</div>`;
  ROSTER.forEach(name=>{
    const v = mtData.hcps[name];
    const dflt = (()=>{ const c = hcCourse(name,'wkd'); return c!==null ? c : ((hcpOverrides[name]!==undefined)?hcpOverrides[name]:ROSTER_HCP[name]); })();
    h += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span>${name}</span><input type="number" class="mt-hcp" data-name="${encodeURIComponent(name)}" value="${v===undefined||v===null?'':v}" placeholder="${dflt===undefined?'':dflt}" style="width:80px;"></div>`;
  });
  h += `<button class="btn" onclick="mtSaveSettings()">Save Maritime Settings</button>`;
  box.innerHTML = h;
}
function mtSaveSettings(){
  const ctp = [...document.querySelectorAll('.mt-ctp')].filter(c=>c.checked).map(c=>Number(c.value));
  if(ctp.length > 2 && !confirm('You picked ' + ctp.length + ' CTP holes (usually 2). Save anyway?')) return;
  const hcps = {};
  document.querySelectorAll('.mt-hcp').forEach(inp=>{
    const n = decodeURIComponent(inp.dataset.name);
    if(inp.value.trim() !== '' && !isNaN(Number(inp.value))) hcps[n] = Number(inp.value);
  });
  mtRef.set({ hcps, ctpHoles: ctp, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
    .then(()=>alert('Saved. CTP holes: ' + (ctp.join(' & ') || 'none') + '.'))
    .catch(e=>{ console.error(e); alert('Not saved — check signal and try again.'); });
}
// CTP winner pick during the round (only the pots field is written, so scores are safe)
function mtSetCtp(hole, name){
  if(!sbPots.ctpWin) sbPots.ctpWin = {};
  if(name) sbPots.ctpWin[hole] = name; else delete sbPots.ctpWin[hole];
  sbRoundDocRef.update({ potsJSON: JSON.stringify(sbPots), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
    .catch(e=>{ console.error(e); alert('Not saved — check signal.'); });
  renderSbBoard();
}
'''
rep("hcInit(weekendDb, ()=>{", MT + "\nhcInit(weekendDb, ()=>{")

# Own live round + history
rep("weekendDb.collection('weekendGames').doc('stableford_active')", "weekendDb.collection('weekendGames').doc('maritime_active')")
rep("""    game: 'stableford',
    endedAt""", """    game: 'maritime',
    endedAt""")
rep("if(d.game === 'stableford') items.push", "if(d.game === 'maritime') items.push")

# No score sharing with Wolf / NASCAR (those rounds belong to Weekend Games)
rep("function sbFillBlanks(pairs, holeIdx){\n", "function sbFillBlanks(pairs, holeIdx){\n  return;\n")
rep("function sidePrefillFromSb(){\n", "function sidePrefillFromSb(){\n  return;\n")

# Setup screen labels
rep("<h2 style=\"margin-top:14px;\">Stableford — Round Setup</h2>", "<h2 style=\"margin-top:14px;\">⚓ Maritime — Round Setup</h2><div id=\"mtCtpLine\" class=\"hint\"></div>")
rep('<span class="pot-label">Front 9 Stableford</span>', '<span class="pot-label">Low Net (18)</span>')
rep('<span class="pot-label">Back 9 Stableford</span>', '<span class="pot-label">Low Gross (18)</span>')
rep('<span class="pot-label">Best Gross — Par 3s</span>', '<span class="pot-label">Closest to the Pin (this month\'s holes)</span>')
rep('<div class="pot-row" id="potrow-draw">\n        <input type="checkbox" id="sbPotDrawOn" checked',
    '<div class="pot-row off" id="potrow-draw" style="display:none">\n        <input type="checkbox" id="sbPotDrawOn"')
rep('<div class="pot-row off" id="potrow-par4">', '<div class="pot-row off" id="potrow-par4" style="display:none">')
rep('<div class="pot-row off" id="potrow-par5">', '<div class="pot-row off" id="potrow-par5" style="display:none">')
rep('Applies to Front 9, Back 9 and the Par 3 / 4 / 5 pots. Blind Draw always pays only the winning team.',
    'Applies to Low Net and Low Gross. Closest to the Pin splits evenly between the CTP holes.')
s = re.sub(r'<div class="hint">Points: Eagle\+=6.*?Uncheck any pot you\'re not playing for\.</div>',
    '<div class="hint">Low Net = 18-hole gross minus handicap. Low Gross = 18-hole gross. Ties go to the card playoff (hardest hole first). Closest to the Pin: pick the winner on each CTP hole in Leaderboard → Money. Low putts and other rules coming later.</div>', s, count=1, flags=re.S)
assert 'Low putts and other rules' in s
rep("drawOn:true, par4On:false, par5On:false, pay2:false, playoff:false};\nlet sbDraw",
    "drawOn:false, par4On:false, par5On:false, pay2:false, playoff:false};\nlet sbDraw")
rep("""  return {front:5, back:5, par3:5, draw:5, par4:5, par5:5, frontOn:true, backOn:true, par3On:true, drawOn:true, par4On:false""",
    """  return {front:5, back:5, par3:5, draw:5, par4:5, par5:5, frontOn:true, backOn:true, par3On:true, drawOn:false, par4On:false""")
rep("""    pay2:    (document.getElementById('sbPay2On') || {}).checked === true,
    playoff: true""", """    pay2:    (document.getElementById('sbPay2On') || {}).checked === true,
    ctpHoles: (mtData.ctpHoles || []).slice(),
    ctpWin: (sbPots && sbPots.ctpWin) || {},
    playoff: true""")
# a new round starts with no CTP winners
rep("function startStableford(){\n  sbReadPotInputs();", "function startStableford(){\n  sbPots.ctpWin = {};\n  sbReadPotInputs();\n  sbPots.ctpWin = {};")
rep("function sbSyncPotRows(){\n  sbReadPotInputs();",
    "function sbSyncPotRows(){\n  sbReadPotInputs();\n  { const el = document.getElementById('mtCtpLine'); if(el) el.innerHTML = '📍 CTP holes this month: <b>' + ((mtData.ctpHoles||[]).join(' & ') || 'none set — tap Handicaps & CTP Holes on the home screen') + '</b>'; }")
rep("sbBoardTab === 'money'", "sbBoardTab === 'money'", 0) if False else None

# Hole card: CTP flag
rep('''<div class="sbh-par">Par ${par}</div>''',
    '''<div class="sbh-par">Par ${par}${((sbPots.ctpHoles||[]).includes(idx+1)) ? ' · 📍 Closest to the Pin' : ''}</div>''')

# Board tabs
rep('<button id="sbTabFront" class="sb-tab sel" onclick="setSbBoardTab(\'front\')">Front 9</button>', '<button id="sbTabFront" class="sb-tab sel" onclick="setSbBoardTab(\'front\')">Low Net</button>')
rep('<button id="sbTabBack" class="sb-tab" onclick="setSbBoardTab(\'back\')">Back 9</button>', '<button id="sbTabBack" class="sb-tab" onclick="setSbBoardTab(\'back\')">Low Gross</button>')
rep('<button id="sbHistTabFront" class="sb-tab sel" onclick="setSbHistTab(\'front\')">Front 9</button>', '<button id="sbHistTabFront" class="sb-tab sel" onclick="setSbHistTab(\'front\')">Low Net</button>')
rep('<button id="sbHistTabBack" class="sb-tab" onclick="setSbHistTab(\'back\')">Back 9</button>', '<button id="sbHistTabBack" class="sb-tab" onclick="setSbHistTab(\'back\')">Low Gross</button>')

# Scoring: front -> Low Net 18, back -> Low Gross 18, par3 -> CTP
rep('''  const F = sbPayWithGhosts(
    rows.filter(r=>r.front.complete).map(r=>({name:r.name, noMoney:r.noMoney, val:-r.front.margin, scores:r.scores})),
    pots.frontOn ? pots.front : 0, n, pay2, pots.playoff ? course.playoffFront : null, odd18);
  const B = sbPayWithGhosts(
    rows.filter(r=>r.back.complete).map(r=>({name:r.name, noMoney:r.noMoney, val:-r.back.margin, scores:r.scores})),
    pots.backOn ? pots.back : 0, n, pay2, pots.playoff ? course.playoffBack : null, odd18);''',
'''  const F = sbPayWithGhosts(
    rows.filter(r=>r.gross18.complete).map(r=>({name:r.name, noMoney:r.noMoney, val:r.gross18.total - r.hcp, scores:r.scores})),
    pots.frontOn ? pots.front : 0, n, pay2, odd18, odd18);
  const B = sbPayWithGhosts(
    rows.filter(r=>r.gross18.complete).map(r=>({name:r.name, noMoney:r.noMoney, val:r.gross18.total, scores:r.scores})),
    pots.backOn ? pots.back : 0, n, pay2, odd18, odd18);''')
rep('''  const P3 = sbPayWithGhosts(
    rows.filter(r=>r.par3.complete).map(r=>({name:r.name, noMoney:r.noMoney, val:r.par3.total, scores:r.scores})),
    pots.par3On ? pots.par3 : 0, n, pay2, null, odd18);
  const par3Pot = P3.pot, par3Pay = P3.pay;''',
'''  // Closest to the Pin: pot split evenly across the month's CTP holes, whole dollars
  const ctpHoles = pots.ctpHoles || [];
  const par3Pot = (pots.par3On ? pots.par3 : 0) * n;
  const ctpEach = ctpHoles.length ? Math.floor(par3Pot / ctpHoles.length) : 0;
  const ctp = ctpHoles.map((h,i)=>({hole:h, winner:(pots.ctpWin||{})[h] || '', amt: ctpEach + (i===0 ? par3Pot - ctpEach*ctpHoles.length : 0)}));
  const par3Pay = {payouts:{}, notes:[], winners:ctp.filter(c=>c.winner).map(c=>c.winner), pay2:false};''')
rep("    par3Pot, par3Pay, par3Winners: par3Pay.winners,", "    par3Pot, par3Pay, par3Winners: par3Pay.winners, ctp,")

# Leaderboard table
s = re.sub(r'function renderSbBoardTable\(data, tab\)\{.*?\n\}\n', r'''function renderSbBoardTable(data, tab){
  const isNet = tab === 'front';
  const pay = isNet ? data.frontPay : data.backPay;
  const pot = isNet ? data.frontPot : data.backPot;
  const val = r=>{ let g=0,t=0; r.scores.forEach(v=>{ if(v!==null && v!==undefined && !isNaN(v)){ g+=v; t++; } }); return {g, t, net: g - r.hcp}; };
  const rows = [...data.rows].sort((a,b)=>{
    const pa = sbEffPlace(pay, a.name), pb = sbEffPlace(pay, b.name);
    if(pa && pb) return pa - pb; if(pa) return -1; if(pb) return 1;
    const va = val(a), vb = val(b);
    if(!va.t) return 1; if(!vb.t) return -1;
    return isNet ? (va.net - vb.net) : (va.g - vb.g);
  });
  let html = `<div class="hint">⛳ ${data.course.name} · ${isNet?'Low Net':'Low Gross'} Pot: $${pot.toFixed(2)}${pay.pay2 ? ' · 1st 70% / 2nd 30%' : ''}</div>`;
  if(pay.notes.length) html += `<div class="hint" style="margin-top:2px;">${pay.notes.join('<br>')}</div>`;
  html += '<table>';
  html += `<tr><th class="name-col">Player</th><th>HCP</th><th>Thru</th><th>Gross</th><th>Net</th><th>Payout</th></tr>`;
  rows.forEach(r=>{
    const v = val(r);
    const ghost = r.noMoney ? sbGhostText(pay, r.name) : '';
    const payoutCell = r.noMoney ? (ghost ? `<span class="ghost-note">${ghost}</span>` : '—') : (sbPayPill(pay, r.name) || '—');
    html += `<tr${r.noMoney ? ' class="ghost-row"' : ''}>
      <td class="name-col"><span style="display:inline-flex;align-items:center;">${_av(r.name, 22)}${r.name}${r.noMoney ? '<span class="so-tag">SCORES ONLY</span>' : ''}</span></td>
      <td style="white-space:nowrap;">${r.hcp}<button type="button" class="hcp-fix" onclick="sbFixHcp(decodeURIComponent('${encodeURIComponent(r.name)}'))" title="Change handicap">✏️</button></td>
      <td>${v.t || '—'}</td>
      <td>${v.t ? v.g : '—'}</td>
      <td>${v.t ? v.net : '—'}</td>
      <td>${payoutCell}</td>
    </tr>`;
  });
  html += '</table>';
  return html;
}
''', s, count=1, flags=re.S)
assert "isNet?'Low Net':'Low Gross'" in s

# Money tab
rep("""  [['front','Front 9 Stableford','frontOn'],['back','Back 9 Stableford','backOn']].forEach(([key,label,onKey])=>{
    if(!p[onKey]) return;
    const pay = key==='front' ? data.frontPay : data.backPay;
    const pot = key==='front' ? data.frontPot : data.backPot;
    const entries = data.rows.filter(r=>r[key].complete)
      .sort((a,b)=>b[key].margin - a[key].margin)
      .map(r=>({name:r.name, val:(r[key].margin>=0?'+':'')+fmtNum(r[key].margin)}));
    html += `<div class="pot-card"><span class="pot-amount">$${pot.toFixed(2)}</span>
      <h3>${label}</h3><div class="pot-sub">Most points above your own target${p.playoff ? ' · card playoff on ties' : ''}${p.pay2 ? ' · 1st 70% / 2nd 30%' : ''}</div>
      ${potLines(entries, pay)}</div>`;
  });""", """  [['front','Low Net (18)','frontOn'],['back','Low Gross (18)','backOn']].forEach(([key,label,onKey])=>{
    if(!p[onKey]) return;
    const pay = key==='front' ? data.frontPay : data.backPay;
    const pot = key==='front' ? data.frontPot : data.backPot;
    const entries = data.rows.filter(r=>r.gross18.complete)
      .map(r=>({name:r.name, v: key==='front' ? r.gross18.total - r.hcp : r.gross18.total}))
      .sort((a,b)=>a.v - b.v).map(e=>({name:e.name, val:String(e.v)}));
    html += `<div class="pot-card"><span class="pot-amount">$${pot.toFixed(2)}</span>
      <h3>${label}</h3><div class="pot-sub">${key==='front'?'Gross minus handicap':'Straight gross'} · card playoff on ties${p.pay2 ? ' · 1st 70% / 2nd 30%' : ''}</div>
      ${potLines(entries, pay)}</div>`;
  });""")
s = re.sub(r"  // Par 3s\n  if\(p\.par3On\)\{.*?\n  \}\n", r'''  // Closest to the Pin
  if(p.par3On){
    const names = data.rows.map(r=>r.name);
    html += `<div class="pot-card"><span class="pot-amount">$${data.par3Pot.toFixed(2)}</span>
      <h3>📍 Closest to the Pin</h3><div class="pot-sub">${data.ctp.length ? 'Holes ' + data.ctp.map(c=>c.hole).join(' & ') : 'No CTP holes were set for this round'}</div>`;
    data.ctp.forEach(c=>{
      html += `<div class="pot-line${c.winner?' win':''}"><span class="pl-name">Hole ${c.hole}</span><span class="pl-val">`;
      if(live){
        html += `<select onchange="mtSetCtp(${c.hole}, this.value)"><option value="">— pick winner —</option>${names.map(nm=>`<option${nm===c.winner?' selected':''}>${nm}</option>`).join('')}</select>`;
      } else html += c.winner || 'no winner';
      html += `${c.winner?` &nbsp;<span class="win-pill">+$${sbMoney(c.amt)}</span>`:` &nbsp;$${sbMoney(c.amt)}`}</span></div>`;
    });
    html += `</div>`;
  }
''', s, count=1, flags=re.S)
assert 'mtSetCtp(${c.hole}' in s
rep("document.getElementById('headerSub').textContent = 'Weekend Stableford';", "document.getElementById('headerSub').textContent = 'Maritime';")

(root / 'Maritime.html').write_text(s)
print('wrote Maritime.html', len(s))
