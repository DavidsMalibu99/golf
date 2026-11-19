// "Check GHIN" button endpoint (Cloud Run function "ghin-check" in the msg-dev-74f88 project).
// The buttons on mvwns.com (Wednesday Scramble, Weekend Games) and in the MSG App call this; it starts
// the GHIN bot (.github/workflows/ghin-update.yml in DavidsMalibu99/golf) in quick mode.
//
// The GitHub key never reaches a web page: it lives in Secret Manager as GH_DISPATCH_TOKEN, a
// fine-grained token that can only read and run Actions on the golf repo.
//
// Limits, worked out from GitHub's own run history (no database needed):
//   - one check at a time (a run that is queued or running blocks another),
//   - 15 minutes between button checks,
//   - at most 8 button checks a day.
// Deploy: see README.md in this folder.

const functions = require('@google-cloud/functions-framework');

const REPO = 'DavidsMalibu99/golf';
const WORKFLOW = 'ghin-update.yml';
const BUTTON_TITLE = 'Check GHIN button'; // run-name of button runs (see the workflow)
const GAP_MIN = 15;
const PER_DAY = 8;
const ORIGINS = /^https:\/\/((www\.)?mvwns\.com|(www\.)?msg-golf\.com|msg-dev-74f88\.(web\.app|firebaseapp\.com)|davidsmalibu99\.github\.io)$|^http:\/\/localhost(:\d+)?$/;

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'msg-ghin-check',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

functions.http('ghinCheck', async (req, res) => {
  const origin = req.get('origin') || '';
  if (ORIGINS.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Use POST.' });
  if (!ORIGINS.test(origin)) return res.status(403).json({ ok: false, message: 'Not allowed from this site.' });
  const target = req.body && req.body.target === 'dev' ? 'dev' : 'live';

  try {
    const { workflow_runs: runs = [] } = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=30`);
    const now = Date.now();
    const busy = runs.find((r) => r.status !== 'completed');
    if (busy) {
      return res.json({ ok: false, reason: 'running', startedAt: busy.created_at,
        message: 'A GHIN check is already running. The new numbers will show when it finishes.' });
    }
    const button = runs.filter((r) => r.display_title === BUTTON_TITLE);
    const last = button[0] ? Date.parse(button[0].created_at) : 0;
    const waitMin = Math.ceil((last + GAP_MIN * 60e3 - now) / 60e3);
    if (waitMin > 0) {
      return res.json({ ok: false, reason: 'recent', waitMin,
        message: `GHIN was just checked. Try again in ${waitMin} minute${waitMin === 1 ? '' : 's'}.` });
    }
    const today = button.filter((r) => now - Date.parse(r.created_at) < 24 * 3600e3).length;
    if (today >= PER_DAY) {
      return res.json({ ok: false, reason: 'limit',
        message: `GHIN has been checked ${today} times today. The next check runs on its own Tuesday or Thursday night.` });
    }
    await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main', inputs: { target, quick: 'true', dry_run: 'false', probe: 'false' } }),
    });
    return res.json({ ok: true, startedAt: new Date().toISOString(),
      message: 'Checking GHIN. This takes about 3 to 5 minutes.' });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ ok: false, reason: 'error', message: 'Could not start the GHIN check. Try again in a minute.' });
  }
});
