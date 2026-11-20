/* Weekend Games — Stats & Leaderboard.
 * Loaded by Weekendgames.html (live and dev). Reads every saved round in weekendHistory and
 * works out each player's money and scoring, using the page's own money math
 * (computeSbBoardData, computeWolfTotalsFrom, sbCourse) so numbers match the round screens.
 *
 * Counted: Stableford (scores + money), Wolf (money), NASCAR Vegas (money).
 * Settings (weekendGames/stats): hiddenPlayers [names] and excludedRounds [ids], changed with
 * the organizer PIN. Hidden players don't appear anywhere in Stats.
 */
(function () {
  const SETTINGS = () => weekendDb.collection('weekendGames').doc('stats');
  const GAME_LABEL = { stableford: 'Stableford', wolf: 'Wolf', nascar: 'NASCAR Vegas' };
  let state = null; // { rounds, settings, entries: Map name -> [entry] }
  let view = { page: 'board', board: 'gross', period: null, player: null };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => { const r = Math.round(v * 100) / 100; const a = Math.abs(r); const s = a % 1 ? a.toFixed(2) : String(a); return r > 0 ? `+$${s}` : r < 0 ? `-$${s}` : '$0'; };
  const mcls = (v) => (v > 0.004 ? 'money-pos' : v < -0.004 ? 'money-neg' : '');
  const toPar = (n) => (n == null ? '–' : Math.round(n) === 0 ? 'E' : `${n > 0 ? '+' : ''}${Math.round(n)}`);
  const avgPar = (n) => (n == null ? '–' : Math.abs(n) < 0.05 ? 'E' : `${n > 0 ? '+' : ''}${n.toFixed(1)}`);
  const one = (n) => (n == null ? '–' : n.toFixed(1));
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const isoDate = (ts) => { const d = ts && ts.toDate ? ts.toDate() : null; if (!d) return ''; const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const niceDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  const parse = (s, d) => { try { return JSON.parse(s || ''); } catch (e) { return d; } };

  // ---------- turning saved rounds into per-player entries ----------

  /** Stableford: each player's net money for the day (winnings minus what he put in). */
  function stablefordMoney(players, data) {
    const out = {};
    const moneyNames = players.filter((p) => !p.noMoney).map((p) => p.name);
    moneyNames.forEach((n) => { out[n] = 0; });
    const pots = data.pots || {};
    const charge = (names, amt) => { if (amt) names.forEach((n) => { if (n in out) out[n] -= amt; }); };
    const credit = (n, amt) => { if (n in out && amt) out[n] += amt; };
    const paidOut = (pay) => Object.values((pay && pay.payouts) || {}).reduce((s, p) => s + (p.amt || 0), 0);
    // Nine, par 3/4/5 pots: everyone in the money pays in, if the pot paid anyone.
    [['frontOn', 'front', data.frontPay], ['backOn', 'back', data.backPay], ['par3On', 'par3', data.par3Pay],
      ['par4On', 'par4', data.par4Pay], ['par5On', 'par5', data.par5Pay]].forEach(([on, k, pay]) => {
      if (!pots[on] || !paidOut(pay)) return;
      charge(moneyNames, Number(pots[k]) || 0);
      Object.entries(pay.payouts).forEach(([n, p]) => credit(n, p.amt || 0));
    });
    // Blind draw
    if (pots.drawOn && data.draw && Array.isArray(data.draw.teams) && data.drawPot) {
      charge(moneyNames, Number(pots.draw) || 0);
      data.draw.teams.forEach((t) => t.members.forEach((m) => credit(m.name, m.amt || 0)));
    }
    // Skins: only the skins field pays in
    const sk = data.skins;
    if (sk && sk.total) {
      charge(sk.field, sk.amt || 0);
      Object.entries(sk.pay || {}).forEach(([n, v]) => credit(n, v));
    }
    // Putts pot and junk dots
    const ex = data.extras;
    if (ex) {
      if (pots.puttsOn && paidOut(ex.puttsPay)) {
        charge(moneyNames, Number(pots.putts) || 0);
        Object.entries(ex.puttsPay.payouts).forEach(([n, p]) => credit(n, p.amt || 0));
      }
      Object.entries(ex.net || {}).forEach(([n, v]) => credit(n, v));
    }
    return out;
  }

  function buildEntries(rounds, settings) {
    const hidden = new Set(settings.hiddenPlayers || []);
    const excluded = new Set(settings.excludedRounds || []);
    const by = new Map();
    const add = (name, e) => {
      if (!name || hidden.has(name)) return;
      if (!by.has(name)) by.set(name, []);
      by.get(name).push(e);
    };
    for (const r of rounds) {
      if (excluded.has(r.id)) continue;
      const date = isoDate(r.endedAt);
      const at = r.endedAt && r.endedAt.toMillis ? r.endedAt.toMillis() : 0;
      const course = typeof sbCourse === 'function' ? sbCourse(r.courseId) : { name: r.courseId || 'Course', par: [], si: [] };
      const base = { id: r.id, game: r.game, date, at, course: course.name, courseId: course.id || r.courseId || '' };
      try {
        if (r.game === 'stableford') {
          const players = parse(r.playersJSON, []);
          const scores = parse(r.scoresJSON, {});
          let pots;
          if (r.potsJSON) { pots = Object.assign(sbDefaultPots(), parse(r.potsJSON, {})); } else { pots = sbLegacyPots(r.buyIn || 0); }
          const draw = parse(r.drawJSON, null);
          let net = {};
          try { net = stablefordMoney(players, computeSbBoardData(players, scores, pots, draw, course)); } catch (e) { console.warn('stats money', r.id, e); }
          for (const p of players) {
            const card = (scores[p.name] || []).slice(0, 18);
            const par = course.par || [];
            const holeRows = [];
            card.forEach((g, i) => { const v = Number(g); if (Number.isInteger(v) && v > 0 && par[i]) holeRows.push({ hole: i + 1, par: par[i], gross: v }); });
            const complete = holeRows.length === 18;
            const gross = complete ? holeRows.reduce((s, x) => s + x.gross, 0) : null;
            const parTot = par.reduce((s, x) => s + x, 0);
            const hcp = Math.round(Number(p.hcp) || 0);
            add(p.name, Object.assign({}, base, {
              hcp, holeRows, complete, played: holeRows.length, gross,
              net: complete ? gross - hcp : null, grossToPar: complete ? gross - parTot : null, netToPar: complete ? gross - hcp - parTot : null,
              money: p.name in net ? net[p.name] : null,
            }));
          }
        } else if (r.game === 'wolf') {
          const names = parse(r.playersJSON, []);
          const { totals } = computeWolfTotalsFrom(parse(r.holesJSON, {}));
          names.forEach((n, i) => add(typeof n === 'string' ? n : n && n.name, Object.assign({}, base, { holeRows: [], complete: false, money: totals[i] || 0 })));
        } else if (r.game === 'nascar') {
          const names = parse(r.playersJSON, []);
          const holes = parse(r.holesJSON, []);
          const val = typeof r.dollarVal === 'number' ? r.dollarVal : 0.25;
          const pts = names.map(() => 0);
          holes.forEach((h) => {
            if (!h || h.winner === 'tie' || !h.leftTeam) return;
            const w = h.winner === 'left' ? h.leftTeam : h.rightTeam;
            const l = h.winner === 'left' ? h.rightTeam : h.leftTeam;
            w.forEach((i) => { pts[i] += h.diff; }); l.forEach((i) => { pts[i] -= h.diff; });
          });
          names.forEach((n, i) => add(typeof n === 'string' ? n : n && n.name, Object.assign({}, base, { holeRows: [], complete: false, money: pts[i] * val })));
        }
      } catch (e) { console.warn('stats round skipped', r.id, e); }
    }
    for (const list of by.values()) list.sort((a, b) => b.at - a.at);
    return by;
  }

  function summarize(entries) {
    const full = entries.filter((e) => e.complete);
    const withMoney = entries.filter((e) => e.money != null);
    let run = 0;
    const line = [...withMoney].reverse().map((e) => { run += e.money; return { total: run, money: e.money }; });
    const byGame = {};
    withMoney.forEach((e) => { byGame[e.game] = (byGame[e.game] || 0) + e.money; });
    const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
    const byPar = { 3: [], 4: [], 5: [] };
    const holes = new Map();
    entries.forEach((e) => e.holeRows.forEach((x) => {
      const d = x.gross - x.par;
      dist[d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double']++;
      if (byPar[x.par]) byPar[x.par].push(x.gross);
      const k = `${e.courseId}#${x.hole}`;
      if (!holes.has(k)) holes.set(k, { course: e.course, hole: x.hole, par: x.par, s: [] });
      holes.get(k).s.push(x.gross);
    }));
    const hs = [...holes.values()].filter((x) => x.s.length >= 2).map((x) => Object.assign(x, { v: avg(x.s) - x.par })).sort((a, b) => a.v - b.v);
    const courses = new Map();
    full.forEach((e) => { if (!courses.has(e.courseId)) courses.set(e.courseId, { course: e.course, r: [] }); courses.get(e.courseId).r.push(e); });
    const lo = (f) => full.reduce((b, e) => (b === null || f(e) < f(b) ? e : b), null);
    const scored = Object.values(dist).reduce((a, b) => a + b, 0);
    const stableRounds = entries.filter((e) => e.game === 'stableford').length;
    return {
      rounds: entries.length, stableRounds, full: full.length,
      avgGross: avg(full.map((e) => e.gross)), avgNet: avg(full.map((e) => e.net)),
      avgGrossToPar: avg(full.map((e) => e.grossToPar)), avgNetToPar: avg(full.map((e) => e.netToPar)),
      bestGross: lo((e) => e.grossToPar), bestNet: lo((e) => e.netToPar),
      dist, scored, birdies: dist.birdie + dist.eagle,
      parAvg: { 3: avg(byPar[3]), 4: avg(byPar[4]), 5: avg(byPar[5]) },
      courses: [...courses.values()].map((c) => ({ course: c.course, n: c.r.length, avg: avg(c.r.map((e) => e.gross)), best: Math.min(...c.r.map((e) => e.gross)) })).sort((a, b) => b.n - a.n),
      bestHoles: hs.slice(0, 3), worstHoles: hs.slice(-3).reverse(),
      moneyRounds: withMoney.length, moneyTotal: withMoney.reduce((s, e) => s + e.money, 0),
      up: withMoney.filter((e) => e.money > 0.004).length, down: withMoney.filter((e) => e.money < -0.004).length,
      bestDay: withMoney.reduce((b, e) => (!b || e.money > b.money ? e : b), null),
      worstDay: withMoney.reduce((b, e) => (!b || e.money < b.money ? e : b), null),
      line, byGame: Object.entries(byGame).sort((a, b) => b[1] - a[1]),
    };
  }

  const BOARDS = {
    gross: { label: 'Low gross', v: (s) => (s.bestGross ? s.bestGross.grossToPar : null), dir: 1 },
    net: { label: 'Low net', v: (s) => (s.bestNet ? s.bestNet.netToPar : null), dir: 1 },
    avgGross: { label: 'Avg gross', v: (s) => s.avgGrossToPar, dir: 1 },
    avgNet: { label: 'Avg net', v: (s) => s.avgNetToPar, dir: 1 },
    money: { label: 'Money', v: (s) => (s.moneyRounds ? s.moneyTotal : null), dir: -1 },
    birdies: { label: 'Birdies', v: (s) => (s.scored ? s.birdies : null), dir: -1 },
  };
  const inPeriod = (list, p) => (p === 'all' ? list : list.filter((e) => e.date.startsWith(p)));

  // ---------- screens ----------

  const root = () => document.getElementById('stats-app');

  function chips(items, current, attr) {
    return `<div class="ws-chips">${items.map(([v, l]) => `<button class="ws-chip${v === current ? ' on' : ''}" data-${attr}="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  }

  function years() {
    const ys = new Set();
    state.entries.forEach((l) => l.forEach((e) => { if (e.date) ys.add(e.date.slice(0, 4)); }));
    return [...ys].sort().reverse();
  }

  function render() {
    const el = root();
    if (!state) { el.innerHTML = '<div class="panel"><div class="hint">Adding up the rounds…</div></div>'; return; }
    const ys = years();
    if (!view.period) view.period = ys[0] || 'all';
    const top = `<div class="ws-top"><button class="btn secondary ws-back" data-act="${view.page === 'board' ? 'close' : 'board'}">‹ ${view.page === 'board' ? 'Games' : 'Leaderboard'}</button></div>`;
    el.innerHTML = top + (view.page === 'player' ? playerHtml(ys) : view.page === 'manage' ? manageHtml() : boardHtml(ys));
  }

  function boardHtml(ys) {
    const b = BOARDS[view.board];
    const rows = [];
    state.entries.forEach((list, name) => {
      const l = inPeriod(list, view.period);
      if (!l.length) return;
      const s = summarize(l);
      const v = b.v(s);
      if (v != null) rows.push({ name, s, v });
    });
    rows.sort((x, y) => b.dir * (x.v - y.v) || x.name.localeCompare(y.name));
    const sub = (r) => {
      const s = r.s;
      if (view.board === 'gross') return `${s.bestGross.gross} at ${s.bestGross.course} · ${niceDate(s.bestGross.date)}`;
      if (view.board === 'net') return `${s.bestNet.net} net at ${s.bestNet.course} · ${niceDate(s.bestNet.date)}`;
      if (view.board === 'avgGross') return `avg ${one(s.avgGross)} over ${s.full} full round${s.full === 1 ? '' : 's'}`;
      if (view.board === 'avgNet') return `avg ${one(s.avgNet)} net over ${s.full} full round${s.full === 1 ? '' : 's'}`;
      if (view.board === 'money') return `${s.up} up · ${s.down} down · ${s.moneyRounds} rounds`;
      return `${(s.birdies / Math.max(1, s.stableRounds)).toFixed(1)} per round · ${s.stableRounds} rounds`;
    };
    const val = (r) => (view.board === 'money' ? `<span class="${mcls(r.v)} ws-val">${money(r.v)}</span>`
      : `<span class="ws-val">${view.board === 'birdies' ? r.v : view.board.startsWith('avg') ? avgPar(r.v) : toPar(r.v)}</span>`);
    const note = view.board === 'gross' || view.board === 'net' ? 'Best single 18 against par, any course. Stableford rounds.'
      : view.board.startsWith('avg') ? 'Average against par over full 18-hole Stableford rounds.'
        : view.board === 'money' ? 'Won or lost in Stableford, Wolf and NASCAR Vegas.' : 'Birdies and eagles in Stableford rounds.';
    return `<div class="panel">
      <h2>📊 Leaderboard</h2>
      ${chips([...ys.map((y) => [y, y]), ['all', 'All time']], view.period, 'period')}
      ${chips(Object.entries(BOARDS).map(([k, x]) => [k, x.label]), view.board, 'board')}
      <div class="hint">${note} Tap a name for his stats.</div>
      ${rows.length ? rows.map((r, i) => `<div class="board-card ws-row" data-player="${esc(r.name)}">
          <span class="board-rank">${i + 1}</span>
          <span class="board-name">${esc(r.name)}<span class="ws-sub">${esc(sub(r))}</span></span>${val(r)}</div>`).join('')
        : '<div class="empty">Nothing yet for this period.</div>'}
      <button class="btn secondary ws-manage" data-act="manage">⚙️ Organizer: hide players or rounds</button>
    </div>`;
  }

  function playerHtml(ys) {
    const all = state.entries.get(view.player) || [];
    const l = inPeriod(all, view.period);
    const s = summarize(l);
    const pys = [...new Set(all.map((e) => e.date.slice(0, 4)))].sort().reverse();
    if (!pys.includes(view.period) && view.period !== 'all') view.period = 'all';
    let html = `<div class="panel"><h2>${esc(view.player)}</h2>${chips([...pys.map((y) => [y, y]), ['all', 'All time']], view.period, 'period')}</div>`;
    // Money
    html += '<div class="panel"><h2>💰 Money</h2>';
    if (!s.moneyRounds) html += '<div class="empty">No money rounds in this period.</div>';
    else {
      html += `<div class="ws-money"><span class="ws-big ${mcls(s.moneyTotal)}">${money(s.moneyTotal)}</span><span class="hint">${s.up} up · ${s.down} down · ${s.moneyRounds - s.up - s.down} even</span></div>`;
      if (s.line.length > 1) html += chart(s.line);
      html += s.byGame.map(([g, v]) => `<div class="ws-line"><span>${esc(GAME_LABEL[g] || g)}</span><span class="${mcls(v)}">${money(v)}</span></div>`).join('');
      if (s.bestDay && s.bestDay.money > 0) html += `<div class="hint">Best day: <b class="money-pos">${money(s.bestDay.money)}</b> · ${esc(GAME_LABEL[s.bestDay.game])}, ${esc(niceDate(s.bestDay.date))}</div>`;
      if (s.worstDay && s.worstDay.money < 0) html += `<div class="hint">Toughest day: <b class="money-neg">${money(s.worstDay.money)}</b> · ${esc(GAME_LABEL[s.worstDay.game])}, ${esc(niceDate(s.worstDay.date))}</div>`;
    }
    html += '</div>';
    // Scoring
    html += '<div class="panel"><h2>⛳ Scoring</h2>';
    if (!s.scored) html += '<div class="empty">No Stableford cards in this period.</div>';
    else {
      const t = (v, l, n) => `<div class="ws-tile"><div class="ws-tv">${v}</div><div class="ws-tl">${l}</div>${n ? `<div class="ws-tn">${n}</div>` : ''}</div>`;
      html += `<div class="ws-tiles">
        ${t(s.stableRounds, 'Rounds', s.full !== s.stableRounds ? `${s.full} full 18` : '')}
        ${t(one(s.avgGross), 'Avg gross', s.avgGrossToPar != null ? avgPar(s.avgGrossToPar) : '')}
        ${t(one(s.avgNet), 'Avg net', s.avgNetToPar != null ? avgPar(s.avgNetToPar) : '')}
        ${t(s.bestGross ? s.bestGross.gross : '–', 'Best gross', s.bestGross ? `${toPar(s.bestGross.grossToPar)} · ${esc(s.bestGross.course)}` : '')}
        ${t(s.bestNet ? s.bestNet.net : '–', 'Best net', s.bestNet ? `${toPar(s.bestNet.netToPar)} · ${esc(s.bestNet.course)}` : '')}
        ${t(s.birdies, 'Birdies', `${(s.birdies / Math.max(1, s.stableRounds)).toFixed(1)} per round`)}</div>`;
      const d = s.dist; const seg = (k, l) => (d[k] ? `<span class="ws-seg ${k}" style="flex:${d[k]}" title="${l}: ${d[k]}">${d[k] / s.scored >= 0.07 ? d[k] : ''}</span>` : '');
      html += `<div class="hint">Every hole played (${s.scored})</div><div class="ws-dist">${seg('eagle', 'Eagle+')}${seg('birdie', 'Birdie')}${seg('par', 'Par')}${seg('bogey', 'Bogey')}${seg('double', 'Double+')}</div>
        <div class="ws-key">${[['eagle', 'Eagle+'], ['birdie', 'Birdie'], ['par', 'Par'], ['bogey', 'Bogey'], ['double', 'Double+']].map(([k, l]) => `<span><i class="${k}"></i> ${l} ${d[k]}</span>`).join('')}</div>
        <div class="ws-line"><span>Average on par 3s / 4s / 5s</span><span>${one(s.parAvg[3])} / ${one(s.parAvg[4])} / ${one(s.parAvg[5])}</span></div>`;
      html += s.courses.map((c) => `<div class="ws-line"><span>${esc(c.course)} <span class="ws-sub">${c.n} round${c.n === 1 ? '' : 's'}</span></span><span>avg ${one(c.avg)} · best ${c.best}</span></div>`).join('');
      if (s.bestHoles.length) html += `<div class="hint">Best holes: ${s.bestHoles.map((x) => `#${x.hole} ${esc(x.course)} (${avgPar(x.v)})`).join(' · ')}</div>`;
      if (s.worstHoles.length) html += `<div class="hint">Toughest holes: ${s.worstHoles.map((x) => `#${x.hole} ${esc(x.course)} (${avgPar(x.v)})`).join(' · ')}</div>`;
    }
    html += '</div>';
    // History
    html += `<div class="panel"><h2>📅 Rounds (${l.length})</h2>${l.map((e) => `<div class="ws-line">
      <span>${esc(niceDate(e.date))} <span class="ws-sub">${esc(GAME_LABEL[e.game])} · ${esc(e.course)}</span></span>
      <span>${e.game === 'stableford' ? (e.complete ? `<b>${e.gross}</b> <span class="ws-sub">${e.net} net</span>` : `<span class="ws-sub">${e.played} holes</span>`) : ''}
      ${e.money != null ? ` <span class="${mcls(e.money)}">${money(e.money)}</span>` : ''}</span></div>`).join('')}</div>`;
    return html;
  }

  function chart(line) {
    const W = 320, H = 110, P = 8;
    const vals = [0, ...line.map((x) => x.total)];
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
    const x = (i) => P + (i * (W - 2 * P)) / (vals.length - 1);
    const y = (v) => P + ((hi - v) * (H - 2 * P)) / span;
    const last = vals[vals.length - 1];
    return `<svg class="ws-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Running money total">
      <line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" class="zero"/>
      <polyline points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" class="${last >= 0 ? 'up' : 'down'}"/>
      ${vals.map((v, i) => (i ? `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="${line[i - 1].money >= 0 ? 'up' : 'down'}"/>` : '')).join('')}
    </svg><div class="hint" style="margin-top:0">Running total, round by round</div>`;
  }

  function manageHtml() {
    const hidden = new Set(state.settings.hiddenPlayers || []);
    const excluded = new Set(state.settings.excludedRounds || []);
    const names = new Set();
    state.rounds.forEach((r) => { const ps = parse(r.playersJSON, []); ps.forEach((p) => names.add(typeof p === 'string' ? p : p && p.name)); });
    const counted = state.rounds.filter((r) => GAME_LABEL[r.game]);
    return `<div class="panel"><h2>⚙️ Hide players</h2>
      <div class="hint">A hidden player doesn't show anywhere in Stats. Untick to bring him back.</div>
      ${[...names].filter(Boolean).sort().map((n) => `<label class="ws-check"><input type="checkbox" data-hide="${esc(n)}" ${hidden.has(n) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}
    </div>
    <div class="panel"><h2>⚙️ Leave rounds out</h2>
      <div class="hint">Tick test rounds or duplicates to leave them out of every stat.</div>
      ${[...counted].sort((a, b) => (b.endedAt?.toMillis?.() || 0) - (a.endedAt?.toMillis?.() || 0)).map((r) => {
        const ps = parse(r.playersJSON, []).map((p) => (typeof p === 'string' ? p : p && p.name));
        const course = typeof sbCourse === 'function' ? sbCourse(r.courseId).name : '';
        return `<label class="ws-check"><input type="checkbox" data-exclude="${esc(r.id)}" ${excluded.has(r.id) ? 'checked' : ''}>
          <span><b>${esc(niceDate(isoDate(r.endedAt)))}</b> · ${esc(GAME_LABEL[r.game])} · ${esc(course)} · ${ps.length} players<br><span class="ws-sub">${esc(ps.slice(0, 6).join(', '))}${ps.length > 6 ? '…' : ''}</span></span></label>`;
      }).join('')}
    </div>`;
  }

  async function saveSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch);
    await SETTINGS().set(state.settings, { merge: true });
    state.entries = buildEntries(state.rounds, state.settings);
  }

  async function load() {
    const [snap, set] = await Promise.all([
      weekendDb.collection('weekendHistory').get(),
      SETTINGS().get().catch(() => null),
    ]);
    const rounds = snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const settings = set && set.exists ? set.data() : {};
    state = { rounds, settings, entries: buildEntries(rounds, settings) };
  }

  function onClick(e) {
    const t = e.target.closest('[data-act],[data-period],[data-board],[data-player]');
    if (!t) return;
    if (t.dataset.act === 'close') return close();
    if (t.dataset.act === 'board') { view.page = 'board'; render(); return window.scrollTo(0, 0); }
    if (t.dataset.act === 'manage') { if (typeof wgAdminCheck === 'function' && !wgAdminCheck()) return; view.page = 'manage'; render(); return window.scrollTo(0, 0); }
    if (t.dataset.period) { view.period = t.dataset.period; return render(); }
    if (t.dataset.board) { view.board = t.dataset.board; return render(); }
    if (t.dataset.player) { view.page = 'player'; view.player = t.dataset.player; render(); return window.scrollTo(0, 0); }
  }

  async function onChange(e) {
    const t = e.target;
    try {
      if (t.dataset.hide) {
        const s = new Set(state.settings.hiddenPlayers || []);
        if (t.checked) s.add(t.dataset.hide); else s.delete(t.dataset.hide);
        await saveSettings({ hiddenPlayers: [...s] });
      } else if (t.dataset.exclude) {
        const s = new Set(state.settings.excludedRounds || []);
        if (t.checked) s.add(t.dataset.exclude); else s.delete(t.dataset.exclude);
        await saveSettings({ excludedRounds: [...s] });
      }
    } catch (err) { alert('Could not save. Check your connection.'); t.checked = !t.checked; }
  }

  async function open() {
    document.getElementById('view-home').style.display = 'none';
    const el = root();
    el.style.display = '';
    const sub = document.getElementById('headerSub');
    if (sub) sub.textContent = 'Stats & Leaderboard';
    if (!el.dataset.wired) { el.addEventListener('click', onClick); el.addEventListener('change', onChange); el.dataset.wired = '1'; }
    view.page = 'board';
    state = null; render();
    try { await load(); render(); } catch (err) {
      console.error('stats load', err);
      el.innerHTML = '<div class="panel"><div class="empty">Could not load the rounds. Check your connection.</div><button class="btn secondary" data-act="close">‹ Games</button></div>';
    }
    window.scrollTo(0, 0);
  }

  function close() {
    root().style.display = 'none';
    document.getElementById('view-home').style.display = '';
    const sub = document.getElementById('headerSub');
    if (sub) sub.textContent = 'Weekend Games';
    window.scrollTo(0, 0);
  }

  // Styles, using the page's colors
  const css = document.createElement('style');
  css.textContent = `
  .ws-top{margin-bottom:10px}
  .ws-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
  .ws-chip{border:1px solid var(--line-green,#2a5a3e);background:var(--mid-green);color:var(--cream,#f3eee2);border-radius:999px;padding:7px 12px;font-weight:700;font-size:.85rem}
  .ws-chip.on{background:var(--gold);color:#0b2e1f;border-color:var(--gold)}
  .ws-row{cursor:pointer}
  .ws-row .board-name{display:flex;flex-direction:column}
  .ws-sub{font-size:.75rem;color:var(--text-dim);font-weight:400}
  .ws-val{font-weight:800;font-size:1.1rem;white-space:nowrap}
  .ws-manage{margin-top:14px}
  .ws-money{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px}
  .ws-big{font-size:2rem;font-weight:800}
  .ws-line{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line-green,#2a5a3e);align-items:center}
  .ws-chart{width:100%;height:auto;max-height:150px}
  .ws-chart .zero{stroke:var(--text-dim);stroke-dasharray:4 4;opacity:.6}
  .ws-chart polyline{fill:none;stroke-width:3;stroke-linejoin:round}
  .ws-chart .up{stroke:var(--win);fill:var(--win)} .ws-chart polyline.up{fill:none}
  .ws-chart .down{stroke:var(--loss);fill:var(--loss)} .ws-chart polyline.down{fill:none}
  .ws-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:8px;margin-bottom:10px}
  .ws-tile{background:var(--mid-green);border-radius:10px;padding:8px 10px}
  .ws-tv{font-size:1.5rem;font-weight:800;line-height:1.1;color:var(--gold)}
  .ws-tl{font-weight:700;font-size:.8rem}
  .ws-tn{font-size:.72rem;color:var(--text-dim)}
  .ws-dist{display:flex;height:24px;border-radius:7px;overflow:hidden;margin:4px 0}
  .ws-seg{display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:700;color:#fff;min-width:2px}
  .ws-seg.eagle,.ws-key i.eagle{background:#1565c0}.ws-seg.birdie,.ws-key i.birdie{background:#2e7d32}
  .ws-seg.par,.ws-key i.par{background:#78909c}.ws-seg.bogey,.ws-key i.bogey{background:#e0a030}
  .ws-seg.double,.ws-key i.double{background:#c62828}
  .ws-key{display:flex;flex-wrap:wrap;gap:10px;font-size:.78rem;margin-bottom:8px}
  .ws-key i{display:inline-block;width:10px;height:10px;border-radius:3px}
  .ws-check{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line-green,#2a5a3e)}
  .ws-check input{width:20px;height:20px;flex:none;margin-top:2px}`;
  document.head.appendChild(css);

  window.WeekendStats = { open, close, _buildEntries: buildEntries, _summarize: summarize };
})();
