/* Maritime Golf Association scoring rules — pure functions, no database or screen code.
   Used by Maritime.html and by the tests in tools/test-maritime.js.
   Rules come from Chuck Schuler's emails (see the project doc "maritime-rules-and-scoring.md"). */
(function (root) {
  const PAR = [4,3,4,4,3,4,5,3,5, 5,3,4,4,4,3,4,4,5];
  const SI  = [3,17,7,5,15,1,9,13,11, 10,18,14,2,4,16,8,6,12];   // Margaritaville stroke index
  const PAR3 = [1,4,7,10,14];                                     // holes 2, 5, 8, 11, 15 (0-based)
  const ESC_HOLES = [8,17];                                       // holes 9 and 18
  const BY_SI = [...Array(18).keys()].sort((a,b)=>SI[a]-SI[b]);   // hardest hole first

  const DEFAULTS = {
    flightBreak: 16,                        // handicap <= break is Flight 1
    sideGroups: [[0,14],[15,17],[18,99]],    // Par 3 sidegame handicap groups
    seasonGroups: [[0,13],[14,19],[20,99]],  // season-long contests
    par3PerPlayer: 5,                        // $ into the Par 3 sidegame
    escPerPlayer: 1,                         // $ into the Escobar Challenge
    escTarget: 8,                            // net 8 or better on #9 + #18
    flightPerPlayer: 0,                      // $ per player into each flight pot (0 = not set)
    ctpPay: 0, puttsPay: 0,                  // $ per CTP hole / low putts, each flight (0 = not set)
    minRounds: 9, poolBuyIn: 10
  };

  // Strokes a player gets on one hole (plus handicaps give strokes back on the easiest holes)
  function strokes(hcp, i){
    hcp = Math.round(Number(hcp) || 0);
    if(hcp >= 0) return Math.floor(hcp/18) + (SI[i] <= hcp % 18 ? 1 : 0);
    return SI[i] > 18 + hcp ? -1 : 0;
  }
  const num = v => (v === null || v === undefined || v === '' || isNaN(v)) ? null : Number(v);

  // One player's card -> totals. card = {s:{0:5,...}, p:{0:2,...}} (hole index -> value)
  function cardRow(pl, card){
    const s = [], p = [];
    for(let i=0;i<18;i++){ s.push(num(card && card.s ? card.s[i] : null)); p.push(num(card && card.p ? card.p[i] : null)); }
    const thru = s.filter(v=>v!==null).length;
    const gross = s.reduce((a,v)=>a+(v||0),0);
    const putts = p.reduce((a,v)=>a+(v||0),0);
    const puttsThru = p.filter(v=>v!==null).length;
    const par3Gross = PAR3.reduce((a,i)=>a+(s[i]||0),0);
    const par3Done = PAR3.every(i=>s[i]!==null);
    const par3Net = par3Gross - PAR3.reduce((a,i)=>a+strokes(pl.hcp,i),0);
    const escDone = ESC_HOLES.every(i=>s[i]!==null);
    const escNet = ESC_HOLES.reduce((a,i)=>a+(s[i]||0)-strokes(pl.hcp,i),0);
    const toPar = s.reduce((a,v,i)=>a+(v===null?0:v-PAR[i]),0);
    return Object.assign({}, pl, { s, p, thru, gross, net: gross - pl.hcp, putts, puttsThru, toPar,
      par3Gross, par3Done, par3Net, escDone, escNet, complete: thru===18 });
  }

  // Scorecard playoff: compare hole by hole, hardest hole first. val(row, i) -> number; lower wins.
  // Returns {cmp, hole} where hole is the 1-based hole that decided it (0 if never decided).
  function playoff(a, b, val, holes){
    for(const i of (holes || BY_SI)){
      const d = val(a,i) - val(b,i);
      if(d) return {cmp: d, hole: i+1};
    }
    return {cmp: 0, hole: 0};
  }
  const netHole = (r,i)=>(r.s[i]||0) - strokes(r.hcp,i);
  const puttHole = (r,i)=>(r.p[i]||0);

  // Sort by key, break ties with the card playoff. Each entry gets .playoffHole when a playoff placed it.
  function orderWithPlayoff(rows, key, val, holes){
    const sorted = [...rows].sort((a,b)=>{
      const d = key(a) - key(b);
      return d || playoff(a,b,val,holes).cmp || a.name.localeCompare(b.name);
    });
    sorted.forEach((r,k)=>{
      const prev = sorted[k-1], next = sorted[k+1];
      r._won = (next && key(next)===key(r)) ? playoff(r,next,val,holes).hole : 0;
      r._tiedAbove = !!(prev && key(prev)===key(r));
    });
    return sorted;
  }

  const CUP = place => Math.max(0, 11 - place);   // 1st 10 ... 10th 1
  function bonusForPlace(place){ return place===1 ? 1.5 : place<=5 ? 1 : place<=10 ? 0.5 : 0; }

  /* One flight's standings.
     - Places 1-3 (the money): card playoff decides ties.
     - Cup points past 3rd: ties split the points of the places they cover.
     - Bonus points: card playoff decides every place (Chuck: ties at 5th/10th go to a playoff, no split). */
  function flightStandings(rows){
    const done = rows.filter(r=>r.complete);
    const order = orderWithPlayoff(done, r=>r.net, netHole);
    const out = order.map((r,k)=>({ row:r, bonusPlace:k+1 }));
    let pos = 1, k = 0;
    while(k < out.length){
      let j = k; while(j+1 < out.length && out[j+1].row.net === out[k].row.net) j++;
      const tier = out.slice(k, j+1);
      // members landing in places 1-3 keep their own playoff place
      let free = [];
      tier.forEach((e,t)=>{ const place = pos + t; if(place <= 3){ e.place = place; e.tied = false; e.cup = CUP(place); } else free.push(e); });
      if(free.length){
        const p0 = pos + (tier.length - free.length);
        let sum = 0; for(let q=0;q<free.length;q++) sum += CUP(p0+q);
        free.forEach(e=>{ e.place = p0; e.tied = free.length > 1; e.cup = Math.round(sum/free.length*100)/100; });
      }
      pos += tier.length; k = j+1;
    }
    // playoff notes for the paid places
    out.forEach((e,q)=>{ const nx = out[q+1]; if(e.place<=3 && nx && nx.row.net===e.row.net){ e.playoffHole = playoff(e.row, nx.row, netHole).hole; } });
    return out;
  }

  function lowPutts(rows){
    const done = rows.filter(r=>r.complete && r.puttsThru===18);
    if(!done.length) return null;
    const o = orderWithPlayoff(done, r=>r.putts, puttHole);
    const best = o[0];
    const tied = o.filter(r=>r.putts===best.putts);
    return { winner: best.name, putts: best.putts, over: tied.slice(1).map(r=>r.name), hole: tied.length>1 ? playoff(best,tied[1],puttHole).hole : 0 };
  }

  function inRange(h, g){ return h >= g[0] && h <= g[1]; }

  // Everything for one round. round = {players:[{name,hcp,flight,pool,member,group}], ctp:{1:{hole:{name,ft,in}},2:{...}}, cfg}
  function computeRound(round, cards){
    const cfg = Object.assign({}, DEFAULTS, round.cfg || {});
    const rows = (round.players||[]).map(pl=>cardRow(pl, (cards||{})[pl.name]));
    const n = rows.length;
    const res = { cfg, rows, flights:{}, putts:{}, ctp:{}, side:[], esc:null, lowGross:null, money:{}, bonus:{}, cup:{} };
    const add = (obj, name, v)=>{ obj[name] = Math.round(((obj[name]||0) + v)*100)/100; };

    [1,2].forEach(f=>{
      const fr = rows.filter(r=>Number(r.flight)===f);
      const st = flightStandings(fr);
      const pot = cfg.flightPerPlayer * fr.length;
      st.forEach(e=>{
        e.pay = 0;
        if(pot && e.place<=3){ e.pay = Math.round(pot * [0.5,0.3,0.2][e.place-1]); add(res.money, e.row.name, e.pay); }
        res.cup[e.row.name] = e.cup;
        if(e.row.pool) add(res.bonus, e.row.name, bonusForPlace(e.bonusPlace));
      });
      res.flights[f] = { standings: st, open: fr.filter(r=>!r.complete), pot };
      const lp = lowPutts(fr);
      res.putts[f] = lp;
      if(lp){ if(cfg.puttsPay) add(res.money, lp.winner, cfg.puttsPay); const w = fr.find(r=>r.name===lp.winner); if(w && w.pool) add(res.bonus, w.name, 1); }
      res.ctp[f] = {};
      (round.ctpHoles||[]).forEach(h=>{
        const c = round.ctp && round.ctp[f] && round.ctp[f][h];
        res.ctp[f][h] = c && c.name ? c : null;
        if(c && c.name){
          if(cfg.ctpPay) add(res.money, c.name, cfg.ctpPay);
          const w = rows.find(r=>r.name===c.name); if(w && w.pool) add(res.bonus, w.name, 1);
        }
      });
    });

    // Par 3 sidegame: net on the 5 par 3s, three handicap groups, $5 a man per group
    cfg.sideGroups.forEach(g=>{
      const grp = rows.filter(r=>inRange(Math.round(r.hcp), g));
      const pot = cfg.par3PerPlayer * grp.length;
      const done = grp.filter(r=>r.par3Done && r.complete);
      const o = orderWithPlayoff(done, r=>r.par3Net, netHole, BY_SI.filter(i=>PAR3.includes(i)));
      const p3 = BY_SI.filter(i=>PAR3.includes(i));
      const w = o[0] || null;
      const tied = w ? o.filter(r=>r.par3Net===w.par3Net) : [];
      // cards that match hole for hole can't be separated: they split the pot
      const co = w ? tied.filter(r=>r===w || playoff(w,r,netHole,p3).hole===0) : [];
      const beaten = tied.filter(r=>!co.includes(r));
      res.side.push({ range:g, pot, count: grp.length, winner: w ? co.map(r=>r.name).join(' & ') : null, winners: co.map(r=>r.name), net: w ? w.par3Net : null,
        split: co.length > 1, over: beaten.map(r=>r.name), hole: beaten.length ? playoff(w,beaten[0],netHole,p3).hole : 0,
        board: o.slice(0,5).map(r=>({name:r.name, net:r.par3Net, gross:r.par3Gross})) });
      if(w && pot) co.forEach(r=>{ add(res.money, r.name, Math.round(pot/co.length*100)/100); if(r.pool) add(res.bonus, r.name, 1); });
    });

    // Escobar Challenge: #9 + #18 net, must be 8 or better, a tie carries over
    {
      const pot = (Number(round.escCarry)||0) + cfg.escPerPlayer * n;
      const done = rows.filter(r=>r.escDone && r.complete);
      const best = done.length ? Math.min(...done.map(r=>r.escNet)) : null;
      const atBest = done.filter(r=>r.escNet===best);
      const won = best !== null && best <= cfg.escTarget && atBest.length === 1;
      const grossBest = done.length ? Math.min(...done.map(r=>r.s[8]+r.s[17])) : null;
      res.esc = { pot, best, winner: won ? atBest[0].name : null, tied: !won && best!==null && best<=cfg.escTarget ? atBest.map(r=>r.name) : [],
        carry: won ? 0 : pot, grossBest, grossBy: done.filter(r=>r.s[8]+r.s[17]===grossBest).map(r=>r.name) };
      if(won){ add(res.money, atBest[0].name, pot); if(atBest[0].pool) add(res.bonus, atBest[0].name, 1); }
    }

    // Low gross of the day
    const done = rows.filter(r=>r.complete);
    if(done.length){ const g = Math.min(...done.map(r=>r.gross)); res.lowGross = { gross:g, names: done.filter(r=>r.gross===g).map(r=>r.name) }; }

    // 2 bonus points for playing (pool members)
    rows.forEach(r=>{ if(r.pool) add(res.bonus, r.name, 2); });
    return res;
  }

  // What gets kept for the season: one line per player
  function roundSummary(res){
    return res.rows.map(r=>({ name:r.name, hcp:r.hcp, flight:r.flight, pool:!!r.pool, complete:r.complete,
      gross: r.complete ? r.gross : null, net: r.complete ? r.net : null,
      putts: r.complete && r.puttsThru===18 ? r.putts : null, par3: r.complete ? r.par3Gross : null,
      cup: res.cup[r.name] || 0, bonus: r.pool ? (res.bonus[r.name] || 0) : 0, money: res.money[r.name] || 0 }));
  }

  // Season standings from round summaries. hcpNow: name -> current handicap (for the season groups)
  function season(rounds, hcpNow, cfgIn){
    const cfg = Object.assign({}, DEFAULTS, cfgIn||{});
    const P = {};
    rounds.forEach(rd=>(rd.lines||[]).forEach(l=>{
      const p = P[l.name] || (P[l.name] = { name:l.name, rounds:0, cup:0, bonus:0, pool:false, net:[], putts:[], par3:[], lowNet:null, wins:{} });
      p.rounds++; p.cup += l.cup||0; p.bonus += l.bonus||0; if(l.pool) p.pool = true;
      if(l.net!==null && l.net!==undefined){ p.net.push(l.net); if(p.lowNet===null || l.net < p.lowNet) p.lowNet = l.net; }
      if(l.putts!==null && l.putts!==undefined) p.putts.push(l.putts);
      if(l.par3!==null && l.par3!==undefined) p.par3.push(l.par3);
    }));
    const avg = a => a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length*100)/100 : null;
    const list = Object.values(P).map(p=>Object.assign(p, {
      cup: Math.round(p.cup*100)/100, bonus: Math.round(p.bonus*100)/100,
      netAvg: avg(p.net), puttsAvg: avg(p.putts), par3Avg: p.par3.length ? Math.round(avg(p.par3)/5*100)/100 : null,
      hcp: hcpNow && hcpNow[p.name] !== undefined ? hcpNow[p.name] : null,
      eligible: p.rounds >= cfg.minRounds
    }));
    const groupOf = p => cfg.seasonGroups.findIndex(g=>p.hcp!==null && inRange(Math.round(p.hcp), g));
    const poolCount = list.filter(p=>p.pool).length;
    const poolTotal = poolCount * cfg.poolBuyIn;
    const poolSplit = poolTotal >= 200 ? [0.5,0.3,0.2] : [0.6,0.4];
    return {
      players: list,
      cup: [...list].sort((a,b)=>b.cup-a.cup || a.name.localeCompare(b.name)),
      pool: { total: poolTotal, split: poolSplit.map(x=>Math.round(poolTotal*x)),
              standings: list.filter(p=>p.pool).sort((a,b)=>b.bonus-a.bonus || a.name.localeCompare(b.name)) },
      groups: cfg.seasonGroups.map((g,gi)=>{
        const mem = list.filter(p=>groupOf(p)===gi);
        const by = (k, dir) => mem.filter(p=>p[k]!==null).sort((a,b)=>(a[k]-b[k])*dir || b.rounds-a.rounds);
        return { range:g, netAvg: by('netAvg',1), puttsAvg: by('puttsAvg',1), par3Avg: by('par3Avg',1), lowNet: by('lowNet',1) };
      })
    };
  }

  // Ranks with ties shown as T2 etc.
  function ranks(list, key){
    let out = [], prev, prevRank = 0;
    list.forEach((p,i)=>{
      const v = p[key];
      const r = (i>0 && v===prev) ? prevRank : i+1;
      out.push(r); prev = v; prevRank = r;
    });
    return out.map((r,i)=>((out[i-1]===r)||(out[i+1]===r) ? 'T' : '') + r);
  }

  const api = { PAR, SI, PAR3, ESC_HOLES, BY_SI, DEFAULTS, strokes, cardRow, computeRound, roundSummary, season, ranks, flightStandings, playoff };
  if(typeof module !== 'undefined' && module.exports) module.exports = api; else root.MaritimeCore = api;
})(this);
