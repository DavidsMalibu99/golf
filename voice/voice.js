/* Money Shots Golf: talk to the app. A 🎤 button on the page; tap it and say a command.
   Each page lists its own commands with MSGVoice.setup({ commands: [...] }).
   Uses the phone's built-in speech recognition (Safari / Chrome); nothing to install. */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let cfg = { commands: [], bottom: 16, hint: '' };
  let rec = null, busy = false, panel, btn;

  function css() {
    const s = document.createElement('style');
    s.textContent =
      '.msgv-btn{position:fixed;left:14px;z-index:2600;width:56px;height:56px;border-radius:50%;border:2px solid #d4af37;background:#1b4332;color:#fff;font-size:26px;line-height:1;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}' +
      '.msgv-btn.on{background:#d4af37;color:#1b4332;animation:msgvp 1s infinite}' +
      '@keyframes msgvp{0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,.6)}50%{box-shadow:0 0 0 12px rgba(212,175,55,0)}}' +
      '.msgv-panel{position:fixed;left:12px;right:12px;z-index:2601;background:#fff;color:#1b4332;border-radius:14px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.35);font:15px/1.35 -apple-system,system-ui,sans-serif;display:none}' +
      '.msgv-panel b{display:block;font-size:16px;margin-bottom:4px}.msgv-panel small{color:#666;display:block;margin-top:6px}' +
      '.msgv-panel .x{float:right;background:none;border:0;font-size:20px;color:#999;cursor:pointer;padding:0 0 0 8px}';
    document.head.appendChild(s);
  }
  let hideTimer = null;
  const hideSoon = ms => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, ms); };
  function show(title, body, small) {
    clearTimeout(hideTimer); // a new message is never closed by an older one's timer
    panel.style.display = 'block';
    panel.innerHTML = '<button class="x" aria-label="Close">×</button><b>' + title + '</b>' + (body ? '<div>' + body + '</div>' : '') + (small ? '<small>' + small + '</small>' : '');
    panel.querySelector('.x').onclick = hide;
  }
  function hide() { panel.style.display = 'none'; pending = null; }
  // A confirm box on screen listens for a spoken answer: "Save" / "Yes" / "OK" or "Cancel" / "No".
  let pending = null; // {ok, no} while a confirm box is waiting
  const YES = /^(save|save it|saved|yes|yeah|yep|ok|okay|confirm|correct|that s right|right|do it|go|good|post it|enter|enter it|submit)$/;
  const NO = /^(cancel|no|nope|wrong|stop|never mind|nevermind|cancel it|that s wrong|undo)$/;
  function hint(text) { const h = panel.querySelector('.msgv-hint'); if (h) h.textContent = text; }
  function stopRec() { try { rec && rec.stop(); } catch (e) {} }
  function askYesNo(ok, no) {
    pending = { ok, no, auto: true };
    // listen for "Save" right away (or as soon as the current listen finishes)
    setTimeout(() => { if (pending && pending.auto && !busy) { pending.auto = false; listen(); } }, 450);
  }
  // Spoken numbers become digits ("group one" -> "group 1"), including the usual mishearings
  // after "group"/"hole" ("hole to" -> "hole 2", "group won" -> "group 1").
  const NUM = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12,
    thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, first:1, second:2, third:3, fourth:4, fifth:5 };
  const SOUND = { won:1, to:2, too:2, tree:3, for:4, fore:4, ate:8 };
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map((w, i, a) => NUM[w] !== undefined ? String(NUM[w]) : (SOUND[w] !== undefined && /^(group|groups|grip|groop|hole|whole|holes)$/.test(a[i - 1] || '') ? String(SOUND[w]) : w))
    .join(' ');
  function match(alts) {
    // Longest matching phrase wins, so "four man scramble" beats "scramble"
    let best = null;
    alts.forEach(said => {
      const t = ' ' + norm(said) + ' ';
      // Commands that read the whole sentence (spoken scores) win over everything else
      cfg.commands.forEach(c => { if (!c.test || (best && best.len >= 2000)) return; const r = c.test(said); if (r) best = { cmd: c, len: 2000, said, m: r }; });
      // Commands with a number ("group 1", "hole 7") win over plain words
      cfg.commands.forEach(c => { if (!c.re || (best && best.len >= 1000)) return; const m = t.match(c.re); if (m) best = { cmd: c, len: 1000, said, m }; });
      cfg.commands.forEach(c => (c.say || []).forEach(w => {
        const p = ' ' + norm(w) + ' ';
        if (t.includes(p) && (!best || p.length > best.len)) best = { cmd: c, len: p.length, said };
      }));
    });
    return best;
  }
  function examples() { return cfg.commands.filter(c => c.label).slice(0, 8).map(c => '“' + (c.example || c.label) + '”').join(', ') + '…'; }

  let followUp = null; // when set, the next thing heard goes to this callback instead of the commands
  function listenFor(title, body, cb) { followUp = cb; show(title, body); setTimeout(listen, 350); }
  function listen() {
    if (busy) { try { rec && rec.stop(); } catch (e) {} return; }
    if (!SR) {
      show('Voice isn’t available here', 'This browser doesn’t offer speech recognition.', 'You can still use the keyboard’s 🎤 dictation key, or just tap. ' + (navigator.userAgent.match(/OS [\d_]+/) || [''])[0]);
      return;
    }
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 4; rec.continuous = false;
    let got = false;
    rec.onstart = () => { busy = true; btn.classList.add('on'); if (pending) hint('🎤 Listening… say “Save” or “Cancel”'); else show('Listening…', 'Say a command.', 'Try: ' + examples()); };
    rec.onresult = e => {
      got = true;
      const alts = [...e.results[0]].map(a => a.transcript);
      if (followUp) { const cb = followUp; followUp = null; try { cb(alts); } catch (err) { show('Something went wrong', String(err && err.message || err)); } return; }
      if (pending) {
        const p = pending, said = alts.map(a => norm(a).trim());
        if (said.some(a => YES.test(a))) { pending = null; p.ok(); return; }
        if (said.some(a => NO.test(a))) { pending = null; p.no(); return; }
        pending = null; // anything else (say, the scores again) is a new command
      }
      const m = match(alts);
      if (!m) { show('Didn’t catch a command', 'Heard: “' + alts[0] + '”', 'Try: ' + examples()); return; }
      try {
        const r = m.cmd.run(m.m || m.said);
        // A command can answer with a short reason when it doesn't apply on this screen
        if (r === 'asked') return; // the command opened its own confirm box
        if (typeof r === 'string') { show('Not on this screen', r, 'Heard: “' + m.said + '”'); return; }
        show('✓ ' + (m.cmd.label || 'OK') + (m.m && m.m[1] ? ' ' + m.m[1] : ''), 'Heard: “' + m.said + '”');
        hideSoon(1600);
      } catch (err) { show('Something went wrong', String(err && err.message || err)); }
    };
    rec.onerror = e => {
      got = true;
      if (pending && (e.error === 'no-speech' || e.error === 'aborted')) { hint('Tap Save, or tap 🎤 and say “Save”.'); return; }
      const why = { 'not-allowed': 'The microphone isn’t allowed. Tap Allow when the phone asks, or turn it on in Settings › Safari › Microphone.',
        'service-not-allowed': 'Voice isn’t allowed for this page on this phone. Try opening mvwns.com in Safari itself.',
        'no-speech': 'Didn’t hear anything. Tap 🎤 and speak right away.',
        'audio-capture': 'The microphone is off for this page. In Safari, tap the microphone with a slash at the top of the screen to turn it on (or close any app or call using the mic), then tap 🎤 again.',
        'network': 'Voice needs a signal. Try again.' }[e.error];
      show('Voice didn’t work', why || ('Error: ' + e.error), 'Tapping still works for everything.');
    };
    rec.onend = () => { busy = false; btn.classList.remove('on');
      if (pending && pending.auto) { pending.auto = false; setTimeout(() => { if (pending && !busy) listen(); }, 250); return; }
      if (!got) { followUp = null; if (pending) hint('Tap Save, or tap 🎤 and say “Save”.'); else hide(); } };
    try { rec.start(); } catch (err) { busy = false; show('Voice didn’t start', String(err && err.message || err)); }
  }

  // ---- Spoken scores: "Adam par, Alan bogey, Bart double bogey" / "Cary 4" / "everyone par" ----
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length][b.length]; };
  const NICK = { dave: 'david', mike: 'michael', allen: 'alan', allan: 'alan', bert: 'bart', jim: 'james', tom: 'thomas', dan: 'daniel', chris: 'christopher', bill: 'william', bob: 'robert', ed: 'edward', harvey: 'havey', carey: 'cary', carrie: 'cary', kari: 'karey', kelley: 'kelly' };
  const nk = w => NICK[w] || w; // nicknames and spellings count the same on both sides
  const SCORE_WORDS = [
    [/^(albatross)$/, p => p - 3], [/^(eagle|eagles|eagled)$/, p => p - 2], [/^(birdie|birdy|birdies|bertie|birdied|berdie)$/, p => p - 1],
    [/^(par|parr|pars|parred)$/, p => p], [/^(bogey|bogie|bogy|bogeys|bogeyed|boogie|bogi)$/, p => p + 1],
    [/^(double|dub|doubles)$/, p => p + 2], [/^(triple|triples)$/, p => p + 3], [/^(quad|quadruple)$/, p => p + 4], [/^(ace)$/, () => 1]];
  function parseScores(said, names, par) {
    const toks = norm(said).replace(/\bhole in 1\b/g, 'ace').split(' ').filter(Boolean);
    // name words: first, last and nickname; a first name two players share needs the last name
    const words = [];
    names.forEach((n, i) => {
      const nick = (String(n).match(/\(([^)]+)\)/) || [])[1];
      const parts = String(n).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w && !['jr', 'sr'].includes(w));
      if (parts[0]) words.push({ i, w: nk(parts[0]) });
      if (parts.length > 1) words.push({ i, w: nk(parts[parts.length - 1]) });
      if (nick) words.push({ i, w: nk(nick.toLowerCase().trim()) });
    });
    const count = {}; words.forEach(x => { count[x.w] = (count[x.w] || new Set()).add(x.i); });
    const uniq = words.filter(x => count[x.w].size === 1);
    const who = t => {
      const t2 = nk(t);
      let hit = uniq.find(x => x.w === t2);
      if (!hit && t2.length >= 4 && !count[t2]) { const close = uniq.filter(x => x.w.length >= 4 && lev(x.w, t2) <= 1); if (close.length === 1 || (close.length && close.every(c => c.i === close[0].i))) hit = close[0]; }
      return hit ? hit.i : -1;
    };
    const marks = []; toks.forEach((t, j) => { const i = who(t); if (i >= 0 && !(marks.length && marks[marks.length - 1].j === j - 1 && marks[marks.length - 1].i === i)) marks.push({ i, j }); });
    const scoreIn = seg => {
      for (const t of seg) {
        if (/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 15) return { val: +t };
        for (const [rx, f] of SCORE_WORDS) if (rx.test(t)) return { val: Math.max(1, f(par)) };
      }
      return null;
    };
    const out = {};
    const everyone = toks.findIndex(t => /^(everyone|everybody|all|everybodys|everyones)$/.test(t));
    if (everyone >= 0) { const sc = scoreIn(toks.slice(everyone + 1, marks.length ? marks[0].j : undefined)); if (sc) names.forEach((_, i) => { out[i] = sc.val; }); }
    marks.forEach((mk, k) => { const end = k + 1 < marks.length ? marks[k + 1].j : toks.length; const sc = scoreIn(toks.slice(mk.j + 1, end)); if (sc) out[mk.i] = sc.val; });
    const list = Object.keys(out).map(i => ({ i: +i, name: names[+i], val: out[i] }));
    return list.length ? list : null;
  }
  // Which players were named: "add Cary, Jake and Mike" -> their indexes (first, last or nickname;
  // close mishearings; a first name two players share needs the last name)
  function findNames(said, names) {
    const toks = norm(said).split(' ').filter(Boolean);
    const words = [];
    names.forEach((n, i) => {
      const nick = (String(n).match(/\(([^)]+)\)/) || [])[1];
      const parts = String(n).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w && !['jr', 'sr'].includes(w));
      if (parts[0]) words.push({ i, w: nk(parts[0]), first: true });
      if (parts.length > 1) words.push({ i, w: nk(parts[parts.length - 1]) });
      if (nick) words.push({ i, w: nk(nick.toLowerCase().trim()) });
    });
    const count = {}; words.forEach(x => { count[x.w] = (count[x.w] || new Set()).add(x.i); });
    const found = new Set();
    for (let j = 0; j < toks.length; j++) {
      const t = nk(toks[j]), nx = toks[j + 1] && nk(toks[j + 1]);
      // "first last" together picks one player even when the first name is shared
      const both = words.filter(x => x.first && x.w === t).map(x => x.i).filter(i => nx && words.some(y => y.i === i && !y.first && (y.w === nx || (nx.length >= 4 && lev(y.w, nx) <= 1))));
      if (both.length === 1) { found.add(both[0]); j++; continue; }
      let hit = words.filter(x => x.w === t && count[x.w].size === 1);
      if (!hit.length && t.length >= 4 && !count[t]) hit = words.filter(x => count[x.w].size === 1 && x.w.length >= 4 && lev(x.w, t) <= 1);
      const ids = [...new Set(hit.map(x => x.i))];
      if (ids.length === 1) found.add(ids[0]);
    }
    return [...found];
  }
  const word = (v, par) => { const d = v - par; return v === 1 ? 'Ace' : d <= -3 ? 'Albatross' : ({ '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double', '3': 'Triple' })[d] || ('+' + d); };
  // Show what was heard and let the player save or cancel
  function confirmScores(list, par, title, onSave) {
    show(title, '<div style="margin:4px 0 10px">' + list.map(x => '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee"><span>' + x.name + '</span><b>' + x.val + ' <span style="font-weight:500;color:#666">' + word(x.val, par) + '</span></b></div>').join('') + '</div>' +
      '<div style="display:flex;gap:8px"><button class="msgv-ok" style="flex:1;background:#1b4332;color:#fff;border:0;border-radius:10px;padding:11px;font-weight:700;font-size:15px">✓ Save</button>' +
      '<button class="msgv-no" style="flex:1;background:#eee;color:#333;border:0;border-radius:10px;padding:11px;font-weight:600;font-size:15px">Cancel</button></div>' +
      '<small class="msgv-hint">Say “Save” or “Cancel”. Wrong? Say the scores again.</small>');
    const ok = () => { pending = null; stopRec(); onSave(list); show('✓ Saved', list.map(x => x.name.split(' ')[0] + ' ' + x.val).join(', ')); hideSoon(1400); };
    const no = () => { stopRec(); hide(); };
    panel.querySelector('.msgv-ok').onclick = ok;
    panel.querySelector('.msgv-no').onclick = no;
    askYesNo(ok, no);
  }

  window.MSGVoice = {
    supported: !!SR,
    parseScores, confirmScores, word, findNames, listenFor, norm,
    // Simple confirm box: title, list of lines, OK label, what to do
    confirm(title, lines, okLabel, onOk) {
      show(title, '<div style="margin:4px 0 10px">' + lines.map(l => '<div style="padding:3px 0;border-bottom:1px solid #eee">' + l + '</div>').join('') + '</div>' +
        '<div style="display:flex;gap:8px"><button class="msgv-ok" style="flex:1;background:#1b4332;color:#fff;border:0;border-radius:10px;padding:11px;font-weight:700;font-size:15px">' + (okLabel || '✓ OK') + '</button>' +
        '<button class="msgv-no" style="flex:1;background:#eee;color:#333;border:0;border-radius:10px;padding:11px;font-weight:600;font-size:15px">Cancel</button></div>' +
        '<small class="msgv-hint">Say “Yes” or “Cancel”.</small>');
      const ok = () => { stopRec(); hide(); onOk(); };
      const no = () => { stopRec(); hide(); };
      panel.querySelector('.msgv-ok').onclick = ok;
      panel.querySelector('.msgv-no').onclick = no;
      askYesNo(ok, no);
    },
    say(title, body) { show(title, body); },
    flash(title, body, ms) { show(title, body); hideSoon(ms || 1400); },
    setup(opts) {
      cfg = Object.assign(cfg, opts || {});
      if (!btn) {
        css();
        btn = document.createElement('button'); btn.className = 'msgv-btn'; btn.type = 'button';
        btn.setAttribute('aria-label', 'Talk to the app'); btn.textContent = '🎤'; btn.onclick = listen;
        panel = document.createElement('div'); panel.className = 'msgv-panel'; panel.setAttribute('role', 'status');
        document.body.appendChild(panel); document.body.appendChild(btn);
      }
      btn.style.bottom = cfg.bottom + 'px';
      panel.style.bottom = (cfg.bottom + 66) + 'px';
    },
    _match: (alts) => match(alts)
  };
})();
