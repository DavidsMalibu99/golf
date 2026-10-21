/* Money Shots Golf: shared player head shots for every page on mvwns.com.
   To add someone: put a square JPEG (about 160x160) in /photos and add one line below.
   Names are matched loosely: capitals, Jr., (nicknames), Dave/David, Mike/Michael,
   Kelley/Kelly and Harvey/Havey all find the same person. */
(function () {
  const FILES = {
    'Adam Denison': 'adam-denison.jpg',
    'Alan Sonnefeld': 'alan-sonnefeld.jpg',
    'Andy Rodriguez': 'andy-rodriguez.jpg',
    'Brian Patrossi': 'brian-patrossi.jpg',
    'Brian Petrossi': 'brian-patrossi.jpg', // same person, other spelling
    'Bryson Nail': 'bryson-nail.jpg',
    'Cary Howell': 'cary-howell.jpg',
    'Craig Taylor': 'craig-taylor.jpg',
    'Curtis Newstrom': 'curtis-newstrom.jpg',
    'Dale Dugas': 'dale-dugas.jpg',
    'Dale Vasek': 'dale-vasek.jpg',
    'Dave Dawson': 'dave-dawson-2.jpg',
    'Ed Menville': 'ed-menville.jpg',
    'David Meyer': 'david-meyer.jpg',
    'David Sauceda': 'david-sauceda-2.jpg',
    'Harvey Duke': 'harvey-duke.jpg',
    'Jake Kelley': 'jake-kelly-2.jpg',
    'Jamie Daspit': 'jamie-daspit.jpg',
    'Jerry Rains': 'jerry-rains.jpg',
    'Karey Carter': 'karey-carter.jpg',
    'Mike Cross': 'mike-cross.jpg',
    'Ronnie Dartez': 'ronnie-dartez.jpg',
    'Trey McDaniel': 'trey-mcdaniel.jpg'
  };
  const BASE = '/photos/';
  const ALIAS = { dave: 'david', mike: 'michael', kelley: 'kelly', havey: 'harvey', byson: 'bryson', tom: 'thomas', dan: 'daniel', ed: 'edward', chris: 'christopher', bill: 'william', bob: 'robert', jim: 'james' };
  function key(n) {
    return String(n || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/)
      .filter(w => w && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w)).map(w => ALIAS[w] || w).join(' ');
  }
  const INDEX = {};
  Object.keys(FILES).forEach(n => { INDEX[key(n)] = BASE + FILES[n]; });

  function photoUrl(name) { return INDEX[key(name)] || null; }
  function initials(name) {
    const w = String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(x => x && !/^(jr|sr|ii|iii|iv)\.?$/i.test(x));
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Round head shot, or the player's initials in a circle when there's no photo yet
  function avatar(name, size) {
    const s = size || 28; const url = photoUrl(name);
    const box = `width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px`;
    return url
      ? `<img class="msg-av" src="${url}" alt="" loading="lazy" style="${box}" onerror="this.outerHTML='<span class=&quot;msg-av msg-av-i&quot; style=&quot;${box}&quot;>${esc(initials(name))}</span>'">`
      : `<span class="msg-av msg-av-i" style="${box}" aria-hidden="true">${esc(initials(name))}</span>`;
  }
  const css = document.createElement('style');
  css.textContent = '.msg-av{display:inline-flex;align-items:center;justify-content:center;flex:none;border-radius:50%;object-fit:cover;vertical-align:middle;border:2px solid rgba(212,175,55,.85);box-sizing:border-box;margin-right:8px}' +
    '.msg-av-i{background:#2d6a4f;color:#fff;font-weight:700;letter-spacing:.02em;line-height:1}';
  document.head.appendChild(css);
  window.MSGPhotos = { photoUrl, avatar, initials, key };
})();
