// "🔄 Check GHIN" button for mvwns.com pages (Wednesday Scramble, Weekend Games).
// GhinCheck.mount(element, { db, target: 'live'|'dev', guard: () => true })
//   db     – Firestore (compat) for the scramble database; status is read from wns2/ghinbot.
//   guard  – optional; runs before starting a check (e.g. the admin PIN). Return false to stop.
// Pressing the button asks the ghin-check endpoint (tools/ghin-check-fn) to start the GHIN bot in
// quick mode. The bot marks wns2/ghinbot "running" while it works and writes a summary when done;
// the indexes it saves show up on every page by themselves.
(function () {
  const URL = 'https://us-central1-msg-dev-74f88.cloudfunctions.net/ghin-check';
  const STALE_MIN = 20; // a "running" note older than this is ignored (the run must have died)

  const css = `
.gc-box{margin:10px 0;padding:10px 12px;border:1px solid #d8cfb0;border-radius:10px;background:#fffdf5;font-size:13px;color:#333;text-align:left}
.gc-box button{background:#1a6b8a;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer}
.gc-box button:disabled{opacity:.6;cursor:default}
.gc-msg{margin-top:6px;line-height:1.4}
.gc-box details{margin-top:4px}
.gc-box summary{cursor:pointer;color:#1a6b8a}`;
  let styled = false;

  const t = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mount(el, { db, target = 'live', guard } = {}) {
    if (!el || !db) return;
    if (!styled) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); styled = true; }
    el.innerHTML = `<div class="gc-box"><button type="button">🔄 Check GHIN</button>
      <div class="gc-msg">Looking for the last GHIN check…</div></div>`;
    const btn = el.querySelector('button'), msg = el.querySelector('.gc-msg');
    let last = {}, pendingSince = 0, note = '';

    function render() {
      const run = last.running && (Date.now() - Date.parse(last.running.startedAt)) < STALE_MIN * 60e3 ? last.running : null;
      const waiting = pendingSince && (Date.now() - pendingSince) < 3 * 60e3; // started, bot not up yet
      if (run || waiting) {
        btn.disabled = true; btn.textContent = '⏳ Checking GHIN…';
        msg.innerHTML = `Checking GHIN (started ${t(run ? run.startedAt : new Date(pendingSince).toISOString())}). ` +
          'This takes about 3 to 5 minutes. New indexes show up here on their own.';
        return;
      }
      btn.disabled = false; btn.textContent = '🔄 Check GHIN';
      let h = note ? `<div>${esc(note)}</div>` : '';
      if (last.ranAt) {
        const ch = Array.isArray(last.changed) ? last.changed : null;
        h += `<div>Last GHIN check: ${t(last.ranAt)}${last.dryRun ? ' (test, nothing saved)' : ''} — ` +
          (ch ? `<b>${ch.length} index${ch.length === 1 ? '' : 'es'} changed</b>` : `${last.updated || 0} indexes checked`) + '</div>';
        if (ch && ch.length) h += `<details><summary>Show changes</summary>${ch.map((c) => `<div>${esc(c)}</div>`).join('')}</details>`;
        const rv = Array.isArray(last.review) ? last.review.length : 0;
        if (rv) h += `<div>${rv} player${rv === 1 ? '' : 's'} to check in 👥 Players (Wednesday app admin).</div>`;
      } else {
        h += '<div>Tap to pull the latest handicap indexes from GHIN.</div>';
      }
      if (last.lastError && (!last.ranAt || last.lastError.at > last.ranAt)) h += `<div style="color:#b03a2e">Last check failed: ${esc(last.lastError.message)}</div>`;
      msg.innerHTML = h;
    }

    db.collection('wns2').doc('ghinbot').onSnapshot((d) => {
      last = d.data() || {};
      if (last.running) note = '';
      if (pendingSince && (last.running || (last.ranAt && Date.parse(last.ranAt) > pendingSince))) pendingSince = 0;
      render();
    }, () => { msg.textContent = 'Could not read the last GHIN check.'; });
    setInterval(render, 30e3);

    btn.addEventListener('click', async () => {
      if (guard && !guard()) return;
      btn.disabled = true; btn.textContent = '⏳ Starting…'; note = '';
      try {
        const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }) });
        const r = await res.json();
        if (r.ok) pendingSince = Date.now(); else note = r.message || 'Could not start the GHIN check.';
      } catch (e) {
        note = 'Could not reach the GHIN checker. Check your signal and try again.';
      }
      render();
    });
    render();
  }

  window.GhinCheck = { mount };
})();
