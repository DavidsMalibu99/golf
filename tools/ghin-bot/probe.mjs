// One-off: find which GHIN address returns the signed-in golfer's "Following" list. Read-only.
import { GhinClient } from 'ghin';
const me = process.env.MY_GHIN || '279388';
const ghin = new GhinClient({ username: process.env.GHIN_USER, password: process.env.GHIN_PASSWORD });
const tok = await ghin.httpClient.lock.runExclusive(() => ghin.httpClient.getAccessToken());
if (tok.isErr()) { console.log('sign-in failed', tok.error.message); process.exit(1); }
const H = { 'Content-Type': 'application/json', source: 'GHINcom', Authorization: `Bearer ${tok.value}`,
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36' };
const base = 'https://api2.ghin.com/api/v1/';
const paths = [
  `golfers/${me}/followed_golfers.json`, `golfers/${me}/following.json`, `golfers/${me}/followings.json`,
  `followed_golfers.json?golfer_id=${me}`, `following.json?golfer_id=${me}`, `followings.json?golfer_id=${me}`,
  `golfer_followings.json?golfer_id=${me}`, `golfers/${me}/golfer_followings.json`, `users/following.json`,
  `golfers/following.json?golfer_id=${me}`, `followed_golfers.json`, `following.json`,
];
for (const p of paths) {
  const res = await fetch(base + p + (p.includes('?') ? '&' : '?') + 'source=GHINcom', { headers: H });
  let body = null; try { body = await res.json(); } catch {}
  const keys = body && typeof body === 'object' ? Object.keys(body) : [];
  const arr = keys.map((k) => Array.isArray(body[k]) ? `${k}[${body[k].length}]` : null).filter(Boolean);
  const sample = arr.length ? Object.keys(body[keys.find((k) => Array.isArray(body[k]) && body[k].length)]?.[0] || {}).join(',') : '';
  console.log(`${res.status}  ${p}  keys=${keys.join(',')}  ${arr.join(' ')}  ${sample ? 'item fields: ' + sample : ''}`);
  await new Promise((r) => setTimeout(r, 1500));
}
