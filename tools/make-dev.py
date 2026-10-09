"""Build dev/app.html (test copy on the wns-scramble-dev database) from app.html.
usage: python3 tools/make-dev.py   (run after changing app.html, or before trying a change in dev)"""
import re, shutil, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / 'app.html').read_text()

LIVE = re.search(r'const firebaseConfig = \{.*?\};', s, re.S).group(0)
DEV = '''const firebaseConfig = {
  apiKey: "AIzaSyBiiE5BRUO_fUPVFVWi2C6IdiZUgzRhp6c",
  authDomain: "wns-scramble-dev.firebaseapp.com",
  projectId: "wns-scramble-dev",
  storageBucket: "wns-scramble-dev.firebasestorage.app",
  messagingSenderId: "1000750273997",
  appId: "1:1000750273997:web:d868cc8b273653ec202084"
};'''
assert 'wns-scramble"' in LIVE
s = s.replace(LIVE, DEV + '\nconst LIVE_CONFIG = ' + LIVE.split('=', 1)[1].strip(), 1)
s = s.replace('<head>', '<head>\n<meta name="robots" content="noindex">', 1)
s = s.replace('<meta name="apple-mobile-web-app-title" content="Wed Scramble">', '<meta name="apple-mobile-web-app-title" content="WNS DEV">', 1)
assert 'WNS DEV' in s and 'rel="apple-touch-icon"' in s
s = re.sub(r'<title>(.*?)</title>', r'<title>DEV · \1</title>', s, count=1)

banner = '''<div id="dev-bar" style="position:sticky;top:0;z-index:2000;background:#d32f2f;color:#fff;font:600 13px/1.3 -apple-system,system-ui,sans-serif;padding:6px 12px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap">
  <span>🧪 DEV TEST COPY. Nothing here touches the real league.</span>
  <button onclick="copyLiveToDev()" style="background:#fff;color:#d32f2f;border:0;border-radius:6px;padding:4px 10px;font-weight:700">Copy live data into dev</button>
</div>'''
s = s.replace('<body>', '<body>\n' + banner, 1)

tool = '''<script>
// Dev only: copy the live league's data into the dev database. Reads live, writes dev only.
async function copyLiveToDev() {
  if (!confirm('Replace everything in DEV with a fresh copy of the live league data?\\n\\nLive is only read, never changed.')) return;
  const live = firebase.initializeApp(LIVE_CONFIG, 'live').firestore();
  const docs = ['state', 'results', 'players', 'pairings', 'holes', 'round'];
  try {
    for (const id of docs) {
      const snap = await live.collection('wns2').doc(id).get();
      if (snap.exists) await db.collection('wns2').doc(id).set(snap.data());
      else await db.collection('wns2').doc(id).delete();
    }
    const old = await db.collection('wns2').doc('round').collection('teamScores').get();
    for (const d of old.docs) await d.ref.delete();
    const ts = await live.collection('wns2').doc('round').collection('teamScores').get();
    for (const d of ts.docs) await db.collection('wns2').doc('round').collection('teamScores').doc(d.id).set(d.data());
    alert('Done: copied ' + docs.length + ' league records and ' + ts.size + ' team scorecards into DEV. Reloading.');
    location.reload();
  } catch (e) {
    console.error(e);
    alert('Copy failed: ' + (e.message || e) + '\\n\\nIf it says "permissions", the dev database rules need to be copied from live.');
  }
}
</script>
</body>'''
s = s.replace('</body>', tool, 1)
(root / 'dev' / 'app.html').write_text(s)
shutil.copy(root / 'yardage.html', root / 'dev' / 'yardage.html')
shutil.copy(root / 'tools' / 'dev-apple-touch-icon.png', root / 'dev' / 'apple-touch-icon.png')  # logo with a red DEV band
print('dev/app.html written')
