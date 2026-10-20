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
  function show(title, body, small) {
    panel.style.display = 'block';
    panel.innerHTML = '<button class="x" aria-label="Close">×</button><b>' + title + '</b>' + (body ? '<div>' + body + '</div>' : '') + (small ? '<small>' + small + '</small>' : '');
    panel.querySelector('.x').onclick = hide;
  }
  function hide() { panel.style.display = 'none'; }
  // Spoken numbers become digits ("group one" -> "group 1"), including the usual mishearings
  // after "group"/"hole" ("hole to" -> "hole 2", "group won" -> "group 1").
  const NUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12,
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
      // Commands with a number ("group 1", "hole 7") win over plain words
      cfg.commands.forEach(c => { if (!c.re || (best && best.len >= 1000)) return; const m = t.match(c.re); if (m) best = { cmd: c, len: 1000, said, m }; });
      cfg.commands.forEach(c => (c.say || []).forEach(w => {
        const p = ' ' + norm(w) + ' ';
        if (t.includes(p) && (!best || p.length > best.len)) best = { cmd: c, len: p.length, said };
      }));
    });
    return best;
  }
  function examples() { return cfg.commands.filter(c => c.label).map(c => '“' + (c.example || c.label) + '”').join(', '); }

  function listen() {
    if (busy) { try { rec && rec.stop(); } catch (e) {} return; }
    if (!SR) {
      show('Voice isn’t available here', 'This browser doesn’t offer speech recognition.', 'You can still use the keyboard’s 🎤 dictation key, or just tap. ' + (navigator.userAgent.match(/OS [\d_]+/) || [''])[0]);
      return;
    }
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 4; rec.continuous = false;
    let got = false;
    rec.onstart = () => { busy = true; btn.classList.add('on'); show('Listening…', 'Say a command.', 'Try: ' + examples()); };
    rec.onresult = e => {
      got = true;
      const alts = [...e.results[0]].map(a => a.transcript);
      const m = match(alts);
      if (!m) { show('Didn’t catch a command', 'Heard: “' + alts[0] + '”', 'Try: ' + examples()); return; }
      try {
        const r = m.cmd.run(m.m || m.said);
        // A command can answer with a short reason when it doesn't apply on this screen
        if (typeof r === 'string') { show('Not on this screen', r, 'Heard: “' + m.said + '”'); return; }
        show('✓ ' + (m.cmd.label || 'OK') + (m.m && m.m[1] ? ' ' + m.m[1] : ''), 'Heard: “' + m.said + '”');
        setTimeout(hide, 1600);
      } catch (err) { show('Something went wrong', String(err && err.message || err)); }
    };
    rec.onerror = e => {
      got = true;
      const why = { 'not-allowed': 'The microphone isn’t allowed. Tap Allow when the phone asks, or turn it on in Settings › Safari › Microphone.',
        'service-not-allowed': 'Voice isn’t allowed for this page on this phone. Try opening mvwns.com in Safari itself.',
        'no-speech': 'Didn’t hear anything. Tap 🎤 and speak right away.', 'audio-capture': 'No microphone found.', 'network': 'Voice needs a signal. Try again.' }[e.error];
      show('Voice didn’t work', why || ('Error: ' + e.error), 'Tapping still works for everything.');
    };
    rec.onend = () => { busy = false; btn.classList.remove('on'); if (!got) hide(); };
    try { rec.start(); } catch (err) { busy = false; show('Voice didn’t start', String(err && err.message || err)); }
  }

  window.MSGVoice = {
    supported: !!SR,
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
