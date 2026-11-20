// Course maps for GPS yardages (Cloud Run function "course-map" in msg-dev-74f88).
// The MSG App's yardage page asks here instead of calling the free map services from each phone.
//
// POST { name, lat?, lng? }  ->  { status, name, lat, lng, mapJSON?, holes?, message }
//   status "ok"        the hole map (same shape as osm.js compactHoles), saved in Firestore courseMaps/<key>
//   status "notFound"  couldn't tell where the course is; the app offers "I'm at this course"
//   status "noHoles"   found the course, but nobody has mapped its holes in OpenStreetMap yet
//   status "busy"      the map servers didn't answer; try again
// Finding the course: OpenStreetMap's own place search (Nominatim), then OpenGolfAPI as a backup.
// Or lat/lng from the app (a golfer standing at the course). Holes and greens come from the
// OpenStreetMap Overpass servers, asked one at a time with our contact address, as their rules ask.
// Map data © OpenStreetMap contributors (ODbL).

import functions from '@google-cloud/functions-framework';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { OVERPASS, overpassQuery, mapHoles, compactHoles, mapKey, pickCourse, photoBox, inTexas, hasPhotos, MAP_VERSION, coreName } from './osm.js';

const UA = 'MSG-Golf-App/1.0 (+https://msg-golf.com; info@msg-golf.com)';
const ORIGINS = /^https:\/\/((www\.)?mvwns\.com|(www\.)?msg-golf\.com|msg-dev-74f88\.(web\.app|firebaseapp\.com))$|^http:\/\/localhost(:\d+)?$/;
const RECHECK_DAYS = { notFound: 1, noHoles: 7 }; // a negative answer is asked again after this many days
const V = 2; // bump to forget older negative answers after the search improves

initializeApp();
const db = getFirestore();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, init = {}, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// "Walden on Lake Conroe — Blue" -> "Walden on Lake Conroe"
export const baseName = (name) => String(name || '').split(/ — | – | - |\(/)[0].trim();

/** Pick a golf course from Nominatim results: golf courses only, the best name match first. */
const kmBetween = (a, b) => { const r = Math.PI / 180; const x = (b[1] - a[1]) * r * Math.cos(((a[0] + b[0]) / 2) * r); const y = (b[0] - a[0]) * r; return Math.sqrt(x * x + y * y) * 6371; };
export function pickPlace(list, name, near = null) {
  // Golf course areas only: a restaurant or shop named "... Golf Links" is not the course.
  const golf = (list || []).filter((p) => (p.category || p.class) === 'leisure' && p.type === 'golf_course');
  if (!golf.length) return null;
  const want = coreName(name);
  const score = (p) => { const n = coreName(p.name || p.display_name.split(',')[0]); return n === want ? 3 : (n && want && (n.includes(want) || want.includes(n))) ? 2 : 1; };
  const dist = (p) => (near ? kmBetween(near, [Number(p.lat), Number(p.lon)]) : 0);
  return golf.slice().sort((a, b) => score(b) - score(a) || dist(a) - dist(b) || (b.importance || 0) - (a.importance || 0))[0];
}

// Where to look first: near the golfer when the phone says where it is, otherwise Texas (our groups).
const TX_CENTER = [30.4, -95.6];
async function locate(name, near = null) {
  const q = baseName(name);
  const c = near || TX_CENTER;
  const box = `&viewbox=${c[1] - 3},${c[0] + 3},${c[1] + 3},${c[0] - 3}`; // a preference, not a limit
  // "Bentwater Yacht & Country Club" -> "Bentwater": drop the generic words that differ between listings.
  const core = coreName(q);
  const found = [];
  for (const query of [...new Set([q, core, core && `${core} golf`].filter(Boolean))]) {
    try {
      const r = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=20&countrycodes=us${box}&q=${encodeURIComponent(query)}`, {}, 12000);
      if (r.ok) found.push(...(await r.json()));
    } catch { /* try the next way */ }
    const best = pickPlace(found, name, c);
    if (best && coreName(best.name) === core && kmBetween(c, [Number(best.lat), Number(best.lon)]) < 200) break; // close and exact: done
    await wait(1100); // Nominatim allows one request a second
  }
  const p = pickPlace(found, name, c);
  if (p) return { lat: Number(p.lat), lng: Number(p.lon), via: 'nominatim', label: p.display_name };
  try {
    const r = await get(`https://api.opengolfapi.org/v1/courses/search?q=${encodeURIComponent(q)}&limit=25`, {}, 12000);
    if (r.ok) {
      const c = pickCourse((await r.json()).courses || [], name);
      if (c && Number.isFinite(c.latitude)) return { lat: c.latitude, lng: c.longitude, via: 'opengolfapi', label: c.name };
    }
  } catch { /* nothing more to try */ }
  return null;
}

// OpenStreetMap's main database: the raw data in a box, turned into the same shape Overpass gives
// (ways with geometry). Used last, for one course at a time, and the result is saved.
export function osmApiToOverpass(data) {
  const nodes = new Map(); const ways = new Map(); const out = [];
  for (const e of data.elements || []) if (e.type === 'node') nodes.set(e.id, { lat: e.lat, lon: e.lon });
  for (const e of data.elements || []) if (e.type === 'way') ways.set(e.id, e);
  const geom = (w) => (w.nodes || []).map((id) => nodes.get(id)).filter(Boolean);
  for (const w of ways.values()) {
    const g = w.tags?.golf;
    if (g === 'hole' || g === 'green' || w.tags?.leisure === 'golf_course') out.push({ type: 'way', id: w.id, tags: w.tags, geometry: geom(w) });
  }
  for (const r of data.elements || []) {
    if (r.type !== 'relation' || (r.tags?.golf !== 'green' && r.tags?.leisure !== 'golf_course')) continue;
    out.push({ type: 'relation', id: r.id, tags: r.tags, members: (r.members || []).filter((m) => m.type === 'way' && ways.has(m.ref))
      .map((m) => ({ type: 'way', ref: m.ref, role: m.role, geometry: geom(ways.get(m.ref)) })) });
  }
  return { elements: out };
}

async function osmApi(lat, lng) {
  const box = (s, w, n, e) => `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`;
  const dLat = 0.016, dLng = 0.016 / Math.cos((lat * Math.PI) / 180);
  const whole = [lat - dLat, lng - dLng, lat + dLat, lng + dLng];
  let r = await get(box(...whole), {}, 25000);
  if (r.ok) return osmApiToOverpass(await r.json());
  // Too much in one box (a busy neighbourhood): ask for the four quarters.
  const els = [];
  for (const [s, w, n, e] of [[lat - dLat, lng - dLng, lat, lng], [lat - dLat, lng, lat, lng + dLng], [lat, lng - dLng, lat + dLat, lng], [lat, lng, lat + dLat, lng + dLng]]) {
    r = await get(box(s, w, n, e), {}, 25000);
    if (!r.ok) throw new Error(`osm api ${r.status}`);
    els.push(...((await r.json()).elements || []));
  }
  const seen = new Set();
  return osmApiToOverpass({ elements: els.filter((x) => { const k = x.type + x.id; if (seen.has(k)) return false; seen.add(k); return true; }) });
}

const SERVERS = [OVERPASS[0], 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', ...OVERPASS.slice(1)];
async function overpass(lat, lng) {
  const body = 'data=' + encodeURIComponent(overpassQuery(lat, lng));
  let last = '';
  for (const url of SERVERS) {
    try {
      const r = await get(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 20000);
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.elements)) return j; }
      last = `${new URL(url).host} ${r.status}`;
    } catch (e) { last = `${new URL(url).host} ${e.name}`; }
    console.log('overpass miss', last);
  }
  try { return await osmApi(lat, lng); }
  catch (e) { throw new Error(`map servers busy (${last}; ${e.message})`); }
}

const reply = (res, status, extra = {}) => res.json({ status, ...extra });

// GET ?photo=1&course=<key>&hole=<n>  ->  the hole's aerial photo (JPEG), area = osm.js photoBox.
// Free public-domain USDA NAIP photos: the USGS National Map for the lower 48 (sharper local photos
// where they exist), the Texas GIO server as a backup in Texas. Fetched the first time, then kept in
// Firestore courseMaps/<key>/photos/<n>. Only holes of a saved map, so the address can't fetch anything else.
const USGS = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage';
const NAIP_TX = 'https://imagery.geographic.texas.gov/server/rest/services/NAIP/NAIP22_NCCIR_60cm/ImageServer/exportImage';
const sameBox = (a, b) => a && b && ['W', 'S', 'E', 'N', 'pw', 'ph'].every((k) => a[k] === b[k]);
async function fetchPhoto(b, texas) {
  const q = `bbox=${b.W},${b.S},${b.E},${b.N}&bboxSR=4326&imageSR=4326&size=${b.pw},${b.ph}&format=jpg&f=image`;
  const urls = [`${USGS}?${q}`, ...(texas ? [`${NAIP_TX}?${q}&bandIds=0,1,2`] : []), `${USGS}?${q}`];
  for (const url of urls) {
    try {
      const r = await get(url, {}, 40000);
      const x = Buffer.from(await r.arrayBuffer());
      if (r.ok && x[0] === 0xff && x[1] === 0xd8 && x.length > 15000) return x;
    } catch { /* next */ }
    await wait(1500);
  }
  return null;
}
async function holePhoto(req, res) {
  const key = mapKey(String(req.query.course || ''));
  const n = String(parseInt(req.query.hole, 10) || '');
  try {
    const mapDoc = (await db.collection('courseMaps').doc(key).get()).data();
    const h = mapDoc?.mapJSON ? JSON.parse(mapDoc.mapJSON)[n] : null;
    if (!h || !hasPhotos(h.tee)) return res.status(404).send('No photo for this hole.');
    const b = photoBox(h);
    const ref = db.collection('courseMaps').doc(key).collection('photos').doc(n);
    const saved = (await ref.get()).data();
    let jpg = saved?.jpg && sameBox(saved.box, b) ? saved.jpg : null;
    if (!jpg) {
      const buf = await fetchPhoto(b, inTexas(h.tee));
      if (!buf) return res.status(503).send('Photo server busy.');
      if (buf.length < 1000000) await ref.set({ jpg: buf, box: b, savedAt: FieldValue.serverTimestamp() });
      jpg = buf;
    }
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(jpg));
  } catch (e) {
    console.error('photo', key, n, e);
    return res.status(500).send('Photo failed.');
  }
}

functions.http('courseMap', async (req, res) => {
  const origin = req.get('origin') || '';
  if (ORIGINS.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method === 'GET' && req.query.photo) return holePhoto(req, res);
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Use POST.' });
  if (!ORIGINS.test(origin)) return res.status(403).json({ status: 'error', message: 'Not allowed from this site.' });

  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ status: 'error', message: 'Course name missing.' });
  const pin = Number.isFinite(Number(req.body?.lat)) && Number.isFinite(Number(req.body?.lng)) && req.body?.lat !== null
    ? [Number(req.body.lat), Number(req.body.lng)] : null;
  const nearIn = Array.isArray(req.body?.near) && req.body.near.length === 2 && req.body.near.every((v) => Number.isFinite(Number(v))) ? req.body.near.map(Number) : null;
  const key = mapKey(name);
  const ref = db.collection('courseMaps').doc(key);

  try {
    const saved = (await ref.get()).data();
    // A saved course far from where this golfer is (same name, another state) is looked up again near them.
    const farAway = saved?.mapJSON && nearIn && Number.isFinite(saved.lat) && kmBetween(nearIn, [saved.lat, saved.lng]) > 300;
    if (saved?.mapJSON && saved.mv === MAP_VERSION && !farAway) return reply(res, 'ok', { name, lat: saved.lat, lng: saved.lng, mapJSON: saved.mapJSON, holes: saved.holes, mv: MAP_VERSION });
    // A map saved under older hole-matching rules is rebuilt at its saved location.
    const oldLoc = saved?.mapJSON && saved.via === 'golfer' && Number.isFinite(saved.lat) ? { lat: saved.lat, lng: saved.lng, via: 'golfer' } : null;
    const fresh = saved?.v === V && saved?.checkedAt && Date.now() - saved.checkedAt.toMillis() < (RECHECK_DAYS[saved.status] || 1) * 864e5;
    if (saved?.status && fresh && !pin) return reply(res, saved.status, { name, lat: saved.lat ?? null, lng: saved.lng ?? null, message: saved.message });

    const loc = pin ? { lat: pin[0], lng: pin[1], via: 'golfer' } : (oldLoc && !farAway ? oldLoc : await locate(name, nearIn));
    if (!loc) {
      const message = `Couldn't find ${baseName(name)} on the map by its name.`;
      await ref.set({ name, v: V, status: 'notFound', message, checkedAt: FieldValue.serverTimestamp() }, { merge: true });
      return reply(res, 'notFound', { name, message });
    }
    const map = mapHoles(await overpass(loc.lat, loc.lng), [loc.lat, loc.lng], name);
    if (!map.count) {
      const message = `${baseName(name)} is on the map, but its holes haven't been drawn in OpenStreetMap yet.`;
      await ref.set({ name, v: V, status: 'noHoles', message, lat: loc.lat, lng: loc.lng, via: loc.via, checkedAt: FieldValue.serverTimestamp() }, { merge: true });
      return reply(res, 'noHoles', { name, lat: loc.lat, lng: loc.lng, message });
    }
    const mapJSON = JSON.stringify(compactHoles(map.holes));
    await ref.set({ name, status: 'ok', mv: MAP_VERSION, area: map.area, lat: loc.lat, lng: loc.lng, via: loc.via, mapJSON, holes: map.count,
      source: 'openstreetmap', by: 'server', savedAt: FieldValue.serverTimestamp(), checkedAt: FieldValue.serverTimestamp() });
    return reply(res, 'ok', { name, lat: loc.lat, lng: loc.lng, mapJSON, holes: map.count, mv: MAP_VERSION });
  } catch (e) {
    console.error(name, e);
    return reply(res, 'busy', { name, message: 'The free map servers are busy right now. Try again in a minute.' });
  }
});
