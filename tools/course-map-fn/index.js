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
import { OVERPASS, overpassQuery, mapHoles, compactHoles, mapKey, pickCourse } from './osm.js';

const UA = 'MSG-Golf-App/1.0 (+https://msg-golf.com; info@msg-golf.com)';
const ORIGINS = /^https:\/\/((www\.)?mvwns\.com|(www\.)?msg-golf\.com|msg-dev-74f88\.(web\.app|firebaseapp\.com))$|^http:\/\/localhost(:\d+)?$/;
const RECHECK_DAYS = 7; // a "not found" / "no holes" answer is asked again after this

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
export function pickPlace(list, name) {
  const golf = (list || []).filter((p) => (p.class === 'leisure' && p.type === 'golf_course') || /golf/i.test(p.name || p.display_name || ''));
  if (!golf.length) return null;
  const want = norm(baseName(name));
  const score = (p) => { const n = norm(p.name || p.display_name.split(',')[0]); return n === want ? 3 : (n.includes(want) || want.includes(n)) ? 2 : 1; };
  return golf.slice().sort((a, b) => score(b) - score(a) || (b.importance || 0) - (a.importance || 0))[0];
}

async function locate(name) {
  const q = baseName(name);
  for (const query of [q, `${q} golf`]) {
    try {
      const r = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&countrycodes=us&q=${encodeURIComponent(query)}`, {}, 12000);
      if (r.ok) {
        const p = pickPlace(await r.json(), name);
        if (p) return { lat: Number(p.lat), lng: Number(p.lon), via: 'nominatim', label: p.display_name };
      }
    } catch { /* try the next way */ }
    await wait(1100); // Nominatim allows one request a second
  }
  try {
    const r = await get(`https://api.opengolfapi.org/v1/courses/search?q=${encodeURIComponent(q)}&limit=25`, {}, 12000);
    if (r.ok) {
      const c = pickCourse((await r.json()).courses || [], name);
      if (c && Number.isFinite(c.latitude)) return { lat: c.latitude, lng: c.longitude, via: 'opengolfapi', label: c.name };
    }
  } catch { /* nothing more to try */ }
  return null;
}

async function overpass(lat, lng) {
  const body = 'data=' + encodeURIComponent(overpassQuery(lat, lng));
  const tries = [OVERPASS[0], ...OVERPASS.slice(1), OVERPASS[0]];
  let last = '';
  for (const [i, url] of tries.entries()) {
    try {
      const r = await get(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 30000);
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.elements)) return j; }
      last = `${new URL(url).host} ${r.status}`;
    } catch (e) { last = `${new URL(url).host} ${e.name}`; }
    if (i < tries.length - 1) await wait(2000);
  }
  throw new Error(`map servers busy (${last})`);
}

const reply = (res, status, extra = {}) => res.json({ status, ...extra });

functions.http('courseMap', async (req, res) => {
  const origin = req.get('origin') || '';
  if (ORIGINS.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Use POST.' });
  if (!ORIGINS.test(origin)) return res.status(403).json({ status: 'error', message: 'Not allowed from this site.' });

  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ status: 'error', message: 'Course name missing.' });
  const pin = Number.isFinite(Number(req.body?.lat)) && Number.isFinite(Number(req.body?.lng)) && req.body?.lat !== null
    ? [Number(req.body.lat), Number(req.body.lng)] : null;
  const key = mapKey(name);
  const ref = db.collection('courseMaps').doc(key);

  try {
    const saved = (await ref.get()).data();
    if (saved?.mapJSON) return reply(res, 'ok', { name, lat: saved.lat, lng: saved.lng, mapJSON: saved.mapJSON, holes: saved.holes });
    const fresh = saved?.checkedAt && Date.now() - saved.checkedAt.toMillis() < RECHECK_DAYS * 864e5;
    if (saved?.status && fresh && !pin) return reply(res, saved.status, { name, lat: saved.lat ?? null, lng: saved.lng ?? null, message: saved.message });

    const loc = pin ? { lat: pin[0], lng: pin[1], via: 'golfer' } : await locate(name);
    if (!loc) {
      const message = `Couldn't find ${baseName(name)} on the map by its name.`;
      await ref.set({ name, status: 'notFound', message, checkedAt: FieldValue.serverTimestamp() }, { merge: true });
      return reply(res, 'notFound', { name, message });
    }
    const map = mapHoles(await overpass(loc.lat, loc.lng), [loc.lat, loc.lng]);
    if (!map.count) {
      const message = `${baseName(name)} is on the map, but its holes haven't been drawn in OpenStreetMap yet.`;
      await ref.set({ name, status: 'noHoles', message, lat: loc.lat, lng: loc.lng, via: loc.via, checkedAt: FieldValue.serverTimestamp() }, { merge: true });
      return reply(res, 'noHoles', { name, lat: loc.lat, lng: loc.lng, message });
    }
    const mapJSON = JSON.stringify(compactHoles(map.holes));
    await ref.set({ name, status: 'ok', lat: loc.lat, lng: loc.lng, via: loc.via, mapJSON, holes: map.count,
      source: 'openstreetmap', by: 'server', savedAt: FieldValue.serverTimestamp(), checkedAt: FieldValue.serverTimestamp() });
    return reply(res, 'ok', { name, lat: loc.lat, lng: loc.lng, mapJSON, holes: map.count });
  } catch (e) {
    console.error(name, e);
    return reply(res, 'busy', { name, message: 'The free map servers are busy right now. Try again in a minute.' });
  }
});
