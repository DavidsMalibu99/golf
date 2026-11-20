// GPS yardages for any course mapped in OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Pure functions (no DOM), so they unit-test in Node. Used by /gps-yardage.html.
//
// OSM golf mapping: each hole is a line tagged golf=hole (ref = hole number, par) drawn from
// the tee to the green; greens are areas tagged golf=green. We match each hole to the green
// at (or nearest) the end of its line.

export const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
export const OSM_CREDIT = 'Map data © OpenStreetMap contributors (ODbL)';

const R = 6371008.8; // metres
const rad = (d) => (d * Math.PI) / 180;
export const YD = 1.0936133;

/** Distance in yards between two [lat, lng] points. */
export function yards(a, b) {
  const dLat = rad(b[0] - a[0]); const dLng = rad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)) * YD;
}

/** Overpass query for golf holes and greens within `radius` metres of a point. */
export function overpassQuery(lat, lng, radius = 2500) {
  const around = `(around:${radius},${lat},${lng})`;
  return `[out:json][timeout:25];(way["golf"="hole"]${around};way["golf"="green"]${around};relation["golf"="green"]${around};);out geom;`;
}

/** Local flat x/y in yards around an origin (fine for a golf hole). */
export function projector(origin) {
  const k = Math.cos(rad(origin[0]));
  return (p) => [rad(p[1] - origin[1]) * R * k * YD, rad(p[0] - origin[0]) * R * YD];
}

function centroid(poly) {
  const P = projector(poly[0]);
  const pts = poly.map(P);
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const lat = poly.reduce((s, p) => s + p[0], 0) / poly.length; const lng = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return [lat, lng];
  }
  cx /= 3 * a; cy /= 3 * a;
  const k = Math.cos(rad(poly[0][0]));
  return [poly[0][0] + (cy / YD / R) * (180 / Math.PI), poly[0][1] + (cx / YD / R / k) * (180 / Math.PI)];
}

function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]; const [yj, xj] = poly[j];
    if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const geomOf = (el) => (el.geometry || []).map((g) => [g.lat, g.lon]);

/**
 * Overpass JSON → { holes: { 1: { par, tee, line, green, center } }, count }.
 * When a course has several loops with the same hole numbers (27/36 holes), the hole closest
 * to `near` wins for each number.
 */
export function mapHoles(json, near = null) {
  const els = json?.elements || [];
  const greens = [];
  for (const el of els) {
    if (el.tags?.golf !== 'green') continue;
    if (el.type === 'way') { const g = geomOf(el); if (g.length >= 3) greens.push(g); }
    if (el.type === 'relation') for (const m of el.members || []) if (m.role === 'outer' && m.geometry?.length >= 3) greens.push(m.geometry.map((g) => [g.lat, g.lon]));
  }
  const holes = {};
  for (const el of els) {
    if (el.tags?.golf !== 'hole' || el.type !== 'way') continue;
    const n = parseInt(el.tags.ref, 10);
    const line = geomOf(el);
    if (!(n >= 1 && n <= 18) || line.length < 2) continue;
    const end = line[line.length - 1];
    let green = greens.find((g) => inside(end, g)) || null;
    if (!green && greens.length) {
      green = greens.reduce((best, g) => { const d = yards(end, centroid(g)); return !best || d < best.d ? { g, d } : best; }, null);
      green = green && green.d < 60 ? green.g : null;
    }
    const hole = { n, par: parseInt(el.tags.par, 10) || null, tee: line[0], line, green, center: green ? centroid(green) : end };
    const prev = holes[n];
    if (!prev || (near && yards(near, hole.tee) < yards(near, prev.tee))) holes[n] = hole;
  }
  return { holes, count: Object.keys(holes).length };
}

/**
 * Front / center / back of the green from `from`, along the line of play (from → center).
 * Without a green outline, front and back are null.
 */
export function greenYards(from, hole) {
  const center = Math.round(yards(from, hole.center));
  if (!hole.green) return { front: null, center, back: null };
  const P = projector(from);
  const c = P(hole.center);
  const len = Math.hypot(c[0], c[1]) || 1;
  const ux = c[0] / len; const uy = c[1] / len;
  const pts = [];
  const g = hole.green.map(P);
  for (let i = 0; i < g.length; i++) {
    const a = g[i]; const b = g[(i + 1) % g.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let s = 0; s < steps; s++) pts.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
  }
  let near = pts.filter(([x, y]) => Math.abs(x * uy - y * ux) <= 2); // within 2 yards of the line of play
  if (!near.length) near = pts;
  const along = near.map(([x, y]) => x * ux + y * uy);
  return { front: Math.round(Math.min(...along)), center, back: Math.round(Math.max(...along)) };
}

/** Pick the course from an OpenGolfAPI search: exact name first, else the first result. */
export function pickCourse(list, name) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const want = norm(name).replace(/ (white|blue|red|gold|black|front|back|north|south|east|west)\b.*$/, '');
  return list.find((c) => norm(c.name) === norm(name)) || list.find((c) => norm(c.name).startsWith(want) || want.startsWith(norm(c.name))) || list[0] || null;
}

/** The shared map's id for a course name: "pebble-beach-golf-links". */
export function mapKey(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'course';
}

/** A hole map trimmed for saving: coordinates to 6 decimals (about 10 cm). */
export function compactHoles(holes) {
  const r = (p) => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
  const out = {};
  for (const [n, h] of Object.entries(holes)) out[n] = { n: h.n, par: h.par, tee: r(h.tee), line: h.line.map(r), green: h.green ? h.green.map(r) : null, center: r(h.center) };
  return out;
}
