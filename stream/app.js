/* ============================================
   StreamingCommunity Clone — v6
   Firebase Auth + Firestore + vixsrc.to + Logo TMDB
   ============================================ */

// ─── FIREBASE ────────────────────────────────────────────────────────────────
const FIREBASE_LOADED = (async () => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js');
  const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile }
    = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
  const { initializeFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, orderBy, limit, serverTimestamp }
    = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');
  const app = initializeApp({
    apiKey: "AIzaSyB4dr6akGGmZoFNEFUBGOYgY8UPlkI16uY",
    authDomain: "streaming-films.firebaseapp.com",
    projectId: "streaming-films",
    storageBucket: "streaming-films.firebasestorage.app",
    messagingSenderId: "216208577687",
    appId: "1:216208577687:web:a2a77de0031113544b05d2"
  });
  const auth = getAuth(app);
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  return { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, orderBy, limit, serverTimestamp };
})();

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TMDB_KEY = localStorage.getItem('tmdb_api_key') || '8265bd1679663a7ea12ac168da84d2e8';
const TB = 'https://api.themoviedb.org/3';
const IMG = { w300: 'https://image.tmdb.org/t/p/w300', w500: 'https://image.tmdb.org/t/p/w500', w780: 'https://image.tmdb.org/t/p/w780', orig: 'https://image.tmdb.org/t/p/original' };
const TMDB_OK = TMDB_KEY && !TMDB_KEY.includes('INSERISCI');
const TODAY = new Date(); TODAY.setHours(23, 59, 59, 999);

// ─── MOCK ────────────────────────────────────────────────────────────────────
const MOCK = [
  { id: 101, media_type: 'tv', name: 'Spider-Noir', first_air_date: '2025-01-01', vote_average: 8.4, genre_ids: [], overview: 'Un investigatore privato invecchiato.', backdrop_path: '', poster_path: '' },
  { id: 102, media_type: 'movie', title: 'Metro 2099', release_date: '2025-02-13', vote_average: 7.8, genre_ids: [], overview: 'Una corsa nel futuro.', backdrop_path: '', poster_path: '' },
  { id: 103, media_type: 'tv', name: 'Loki', first_air_date: '2021-06-09', vote_average: 8.2, genre_ids: [], overview: 'Una variante temporale.', backdrop_path: '', poster_path: '' },
  { id: 104, media_type: 'movie', title: 'City Heist', release_date: '2024-08-20', vote_average: 7.2, genre_ids: [], overview: 'Il colpo più rischioso.', backdrop_path: '', poster_path: '' },
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let genres = { movie: {}, tv: {} };
let currentHero = null, currentDetail = null;
let currentSeason = 1, currentEpisode = null, currentEpisodes = [];
let browse = { type: 'all', sort: 'popularity.desc', page: 1, loading: false };
let authMode = 'login', lastPage = 'home';
let FB = null, CURRENT_USER = null;

// Progress tracking
let progressTimer = null;    // setInterval handle
let watchStartTime = 0;      // Date.now() quando si preme play
let watchBaseSeconds = 0;    // secondi accumulati prima di questa sessione

// Logo cache
const logoCache = new Map();

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const escA = v => esc(v).replace(/'/g, '&#39;');
const getType = x => x.media_type || x._type || (x.title ? 'movie' : 'tv');
const getTitle = x => x.title || x.name || x.original_title || x.original_name || 'Senza titolo';
const getYear = x => String(x.release_date || x.first_air_date || '').slice(0, 4) || '—';
const getScore = x => x.vote_average ? Number(x.vote_average).toFixed(1) : '—';
const imgURL = (path, size = 'w780') => path ? `${IMG[size] || IMG.w780}${path}` : '';
const backdropOf = x => imgURL(x.backdrop_path, 'w780') || imgURL(x.poster_path, 'w500');
const posterOf = x => imgURL(x.poster_path, 'w500');
const detailBg = x => imgURL(x.backdrop_path, 'orig') || imgURL(x.poster_path, 'w780');

function formatTime(s) {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
function debounce(fn, d = 350) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }
function toast(msg, ok = false) { const el = $('toast'); el.textContent = msg; el.classList.toggle('ok', ok); el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2400); }
function imgPath(p, s = 'w780') { return p ? `${IMG[s] || IMG.w780}${p}` : ''; }
function genreList(x) {
  if (Array.isArray(x.genres)) return x.genres.map(g => g.name).filter(Boolean);
  return (x.genre_ids || []).slice(0, 4).map(id => genres[getType(x)]?.[id]).filter(Boolean);
}
async function api(path, params = {}) {
  const url = new URL(TB + path);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', params.language || 'it-IT');
  Object.entries(params).forEach(([k, v]) => { if (v != null && k !== 'language') url.searchParams.set(k, v); });
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error('TMDB ' + r.status);
  return r.json();
}
function toTyped(items, ft) {
  return (items || []).filter(x => x && (x.media_type === 'movie' || x.media_type === 'tv' || ft)).map(x => ({ ...x, media_type: x.media_type || ft }));
}

// ─── LOGO TMDB ───────────────────────────────────────────────────────────────
async function fetchLogo(type, id) {
  const key = `${type}_${id}`;
  if (logoCache.has(key)) return logoCache.get(key);
  // Controlla localStorage prima di chiamare API
  const lsKey = `sc_logo_${key}`;
  const cached = localStorage.getItem(lsKey);
  if (cached !== null) { logoCache.set(key, cached); return cached; }
  try {
    const data = await api(`/${type}/${id}/images`, { language: undefined, include_image_language: 'it,en,null' });
    const logos = (data.logos || []).filter(l => l.file_path);
    // Priorità: italiano > inglese > null-language, poi più largo
    const scored = logos.map(l => ({
      ...l,
      score: (l.iso_639_1 === 'it' ? 40 : l.iso_639_1 === 'en' ? 30 : l.iso_639_1 === null ? 15 : 0) + Math.min((l.width || 0) / 80, 20)
    })).sort((a, b) => b.score - a.score);
    const url = scored[0] ? imgURL(scored[0].file_path, 'w500') : '';
    logoCache.set(key, url);
    try { localStorage.setItem(lsKey, url); } catch { }
    return url;
  } catch {
    logoCache.set(key, '');
    return '';
  }
}

// Inietta logo dentro le card già nel DOM
async function hydrateLogos(root = document) {
  const nodes = [...root.querySelectorAll('[data-logo-id]:not([data-logo-done])')];
  if (!nodes.length) return;
  nodes.forEach(n => n.setAttribute('data-logo-done', '1'));
  await Promise.all(nodes.map(async n => {
    const type = n.dataset.logoType || 'movie';
    const id = n.dataset.logoId;
    const title = n.dataset.logoTitle || '';
    const url = await fetchLogo(type, id);
    if (url) {
      n.innerHTML = `<img class="card-logo-img" src="${escA(url)}" alt="${escA(title)}" loading="lazy">`;
    } else {
      n.innerHTML = `<span class="card-logo-text">${esc(title)}</span>`;
    }
  }));
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function updateAuthUI() {
  const on = !!CURRENT_USER;
  $('login-open').classList.toggle('hidden', on);
  $('register-open').classList.toggle('hidden', on);
  $('profile-chip').classList.toggle('hidden', !on);
  $('logout-btn').classList.toggle('hidden', !on);
  if (CURRENT_USER) $('profile-name').textContent = CURRENT_USER.displayName || CURRENT_USER.email?.split('@')[0] || 'Utente';
}
function openAuth(mode = 'login') { authMode = mode; setAuthMode(mode); $('auth-overlay').classList.remove('hidden'); $('auth-overlay').setAttribute('aria-hidden', 'false'); document.body.classList.add('no-scroll'); setTimeout(() => $('auth-email').focus(), 60); }
function closeAuth() { $('auth-overlay').classList.add('hidden'); $('auth-overlay').setAttribute('aria-hidden', 'true'); document.body.classList.remove('no-scroll'); hideMsg(); }
function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  const r = authMode === 'register';
  $('tab-login').classList.toggle('active', !r);
  $('tab-register').classList.toggle('active', r);
  $$('.register-only').forEach(el => el.classList.toggle('hidden', !r));
  $('auth-submit').textContent = r ? 'Registrati' : 'Accedi';
  $('auth-password').setAttribute('autocomplete', r ? 'new-password' : 'current-password');
  hideMsg();
}
function showMsg(t, ok = false) { const b = $('auth-message'); b.textContent = t; b.classList.toggle('ok', ok); b.classList.remove('hidden'); }
function hideMsg() { $('auth-message').classList.add('hidden'); }
function authErr(e) { return ({ 'auth/email-already-in-use': 'Email già registrata.', 'auth/invalid-email': 'Email non valida.', 'auth/weak-password': 'Password troppo debole.', 'auth/invalid-credential': 'Email o password errati.', 'auth/too-many-requests': 'Troppi tentativi, riprova.' }[e.code] || e.message || 'Errore.'); }
async function handleAuth(ev) {
  ev.preventDefault();
  if (!FB) { showMsg('Firebase non pronto.'); return; }
  hideMsg();
  const email = $('auth-email').value.trim(), pass = $('auth-password').value, name = $('auth-name').value.trim();
  if (!email || !pass) return showMsg('Inserisci email e password.');
  if (pass.length < 6) return showMsg('Password minimo 6 caratteri.');
  if (authMode === 'register') {
    const p2 = $('auth-password2').value;
    if (pass !== p2) return showMsg('Le password non coincidono.');
    try {
      const cr = await FB.createUserWithEmailAndPassword(FB.auth, email, pass);
      if (name) await FB.updateProfile(cr.user, { displayName: name });
      try { await FB.setDoc(FB.doc(FB.db, 'users', cr.user.uid), { email, displayName: name || '', createdAt: FB.serverTimestamp() }, { merge: true }); } catch { }
      closeAuth(); toast('Account creato', true);
    } catch (e) { showMsg(authErr(e)); }
    return;
  }
  try { await FB.signInWithEmailAndPassword(FB.auth, email, pass); closeAuth(); toast('Accesso effettuato', true); }
  catch (e) { showMsg(authErr(e)); }
}

// ─── PROGRESS TRACKING ───────────────────────────────────────────────────────
// Il tempo viene accumulato con un timer ogni 30s e salvato sia locale che Firestore.
// Alla chiusura del player si salva il totale finale.

function localKey() { return CURRENT_USER ? `sc_prog_${CURRENT_USER.uid}` : null; }
function readLocal() {
  const k = localKey(); if (!k) return {};
  try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; }
}
function writeLocal(id, data) {
  const k = localKey(); if (!k || !id) return;
  try { const all = readLocal(); all[id] = { ...data, _ts: Date.now() }; localStorage.setItem(k, JSON.stringify(all)); } catch { }
}
function deleteLocal(id) {
  const k = localKey(); if (!k || !id) return;
  try { const all = readLocal(); delete all[id]; localStorage.setItem(k, JSON.stringify(all)); } catch { }
}
function localItems() {
  return Object.entries(readLocal()).map(([id, d]) => ({ id, ...d })).sort((a, b) => (b._ts || 0) - (a._ts || 0));
}

function fsId(item = currentDetail) {
  if (!item) return '';
  return getType(item) === 'tv' ? `tv_${item.id}` : `movie_${item.id}`;
}

function currentWatchSeconds() {
  if (!watchStartTime) return watchBaseSeconds;
  return watchBaseSeconds + Math.floor((Date.now() - watchStartTime) / 1000);
}

async function commitProgress() {
  if (!CURRENT_USER || !currentDetail) return;
  const id = fsId();
  const type = getType(currentDetail);
  const secs = currentWatchSeconds();
  // Stima durata: per film usa runtime, per serie usa runtime episodio
  let duration = 0;
  if (type === 'movie' && currentDetail.runtime) duration = currentDetail.runtime * 60;
  else if (type === 'tv') {
    const ep = currentEpisodes.find(e => e.episode_number === currentEpisode);
    if (ep?.runtime) duration = ep.runtime * 60;
    else duration = 45 * 60; // stima 45 min
  }
  const pct = duration ? Math.max(3, Math.min(97, Math.round((secs / duration) * 100))) : 10;
  const payload = {
    type, tmdbId: currentDetail.id,
    title: getTitle(currentDetail),
    posterPath: currentDetail.poster_path || null,
    backdropPath: currentDetail.backdrop_path || null,
    season: type === 'tv' ? currentSeason : null,
    episode: type === 'tv' ? (currentEpisode || 1) : null,
    lastTime: secs, duration, progress: pct,
  };
  // Salva locale sempre
  writeLocal(id, payload);
  // Salva Firestore
  if (FB) {
    try {
      await FB.setDoc(
        FB.doc(FB.db, 'users', CURRENT_USER.uid, 'watchProgress', id),
        { ...payload, updatedAt: FB.serverTimestamp() },
        { merge: true }
      );
    } catch (e) { console.warn('Progress FS fail', e); }
  }
  renderContinueWatching();
}

function startProgressTimer() {
  stopProgressTimer();
  watchStartTime = Date.now();
  progressTimer = setInterval(commitProgress, 30000); // ogni 30 secondi
}
function stopProgressTimer() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  watchStartTime = 0;
}
async function stopAndSave() {
  stopProgressTimer();
  await commitProgress();
  watchBaseSeconds = 0;
}

async function loadProgress() {
  if (!CURRENT_USER) { $('continue-section').classList.add('hidden'); $('continue-track').innerHTML = ''; return; }
  try {
    if (FB) {
      const q = FB.query(FB.collection(FB.db, 'users', CURRENT_USER.uid, 'watchProgress'), FB.orderBy('updatedAt', 'desc'), FB.limit(12));
      const snap = await FB.getDocs(q);
      renderContinueWatching(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } else {
      renderContinueWatching(localItems().slice(0, 12));
    }
  } catch (e) {
    console.warn('Uso locale per cronologia', e);
    renderContinueWatching(localItems().slice(0, 12));
  }
}

function renderContinueWatching(items) {
  if (!items) items = localItems().slice(0, 12);
  const sec = $('continue-section'), track = $('continue-track');
  if (!CURRENT_USER || !items.length) { sec.classList.add('hidden'); track.innerHTML = ''; return; }
  sec.classList.remove('hidden');
  track.innerHTML = items.map(x => {
    const pct = Math.max(4, Math.min(100, Number(x.progress || 0) || 6));
    const img = (x.backdropPath ? imgURL(x.backdropPath, 'w780') : '') || (x.posterPath ? imgURL(x.posterPath, 'w500') : '');
    const meta = x.type === 'tv'
      ? `S${x.season || 1} E${x.episode || 1}${x.lastTime > 10 ? ' · ' + formatTime(x.lastTime) : ''}`
      : `Film${x.lastTime > 10 ? ' · ' + formatTime(x.lastTime) : ''}`;
    return `<article class="continue-card"
        data-prog-id="${escA(x.id)}"
        data-id="${Number(x.tmdbId || 0)}"
        data-type="${escA(x.type || 'movie')}"
        data-season="${Number(x.season || 1)}"
        data-episode="${Number(x.episode || 1)}"
        data-time="${Math.floor(Number(x.lastTime || 0))}">
      ${img ? `<img src="${escA(img)}" alt="${escA(x.title || '')}" loading="lazy">` : ''}
      <div class="continue-content">
        <button class="continue-remove" data-rm="${escA(x.id)}" title="Rimuovi">×</button>
        <div class="continue-title">${esc(x.title || 'Senza titolo')}</div>
        <div class="continue-meta">${meta}</div>
        <div class="continue-progress"><span style="width:${pct}%"></span></div>
      </div>
    </article>`;
  }).join('');
}

async function removeProgress(id) {
  deleteLocal(id);
  if (FB && CURRENT_USER) { try { await FB.deleteDoc(FB.doc(FB.db, 'users', CURRENT_USER.uid, 'watchProgress', id)); } catch { } }
  await loadProgress();
  toast('Rimosso');
}
async function clearAllProgress() {
  if (!CURRENT_USER) return;
  localStorage.removeItem(localKey());
  if (FB) { try { const q = FB.query(FB.collection(FB.db, 'users', CURRENT_USER.uid, 'watchProgress'), FB.limit(50)); const sn = await FB.getDocs(q); await Promise.all(sn.docs.map(d => FB.deleteDoc(d.ref))); } catch { } }
  renderContinueWatching([]);
  toast('Cronologia svuotata');
}
async function resumeItem(card) {
  const id = Number(card.dataset.id), type = card.dataset.type;
  const season = Number(card.dataset.season || 1), episode = Number(card.dataset.episode || 1);
  const time = Number(card.dataset.time || 0);
  await openDetail(id, type, true);
  if (type === 'tv') { await loadSeason(id, season); selectEpisode(episode, false); }
  watchBaseSeconds = time;
  await playSelected(time);
}

// ─── HOME DATA ────────────────────────────────────────────────────────────────
async function loadGenres() {
  if (!TMDB_OK) return;
  try {
    const [mv, tv] = await Promise.all([api('/genre/movie/list'), api('/genre/tv/list')]);
    genres.movie = Object.fromEntries((mv.genres || []).map(g => [g.id, g.name]));
    genres.tv = Object.fromEntries((tv.genres || []).map(g => [g.id, g.name]));
  } catch { }
}
async function getHomeData() {
  if (!TMDB_OK) return { trending: MOCK, movies: MOCK.filter(x => getType(x) === 'movie'), shows: MOCK.filter(x => getType(x) === 'tv'), top10: MOCK, newMovies: MOCK.filter(x => getType(x) === 'movie') };
  const [tr, mv, sh, tp, nm] = await Promise.all([
    api('/trending/all/week').catch(() => ({ results: [] })),
    api('/movie/popular', { page: 1 }).catch(() => ({ results: [] })),
    api('/tv/popular', { page: 1 }).catch(() => ({ results: [] })),
    api('/trending/all/day').catch(() => ({ results: [] })),
    api('/movie/now_playing', { page: 1, region: 'IT' }).catch(() => ({ results: [] })),
  ]);
  return {
    trending: toTyped(tr.results, 'movie'), movies: toTyped(mv.results, 'movie'),
    shows: toTyped(sh.results, 'tv'), top10: toTyped(tp.results, 'movie'),
    newMovies: toTyped(nm.results, 'movie')
  };
}
async function initHome() {
  try {
    const data = await getHomeData();
    renderRow('row-trending', data.trending);
    renderRow('row-movies', data.movies);
    renderRow('row-shows', data.shows);
    renderTop10('row-top10', data.top10.slice(0, 10));
    renderRow('row-new-movies', data.newMovies);
    const pool = [...data.trending, ...data.movies, ...data.shows].filter(x => x && (x.backdrop_path || !TMDB_OK));
    currentHero = pool[0] || MOCK[0];
    renderHero(currentHero);
  } catch (e) {
    console.error(e); toast('Errore TMDB');
    renderRow('row-trending', MOCK); renderRow('row-movies', MOCK); renderRow('row-shows', MOCK);
    renderTop10('row-top10', MOCK); renderRow('row-new-movies', MOCK);
    currentHero = MOCK[0]; renderHero(currentHero);
  }
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderHero(x) {
  if (!x) return;
  const bg = detailBg(x);
  $('hero-bg').style.backgroundImage = bg ? `url('${bg}')` : '';
  $('hero-title').textContent = getTitle(x);
  $('hero-plot').textContent = x.overview || 'Nessuna descrizione disponibile.';
  $('hero-meta').textContent = [getYear(x), getScore(x) !== '—' ? `★ ${getScore(x)}` : ''].filter(Boolean).join(' · ');
}

// Card 16:9 con logo TMDB sovrapposto
function cardHTML(x, rank = 0) {
  const type = getType(x), bg = backdropOf(x), title = getTitle(x), year = getYear(x), score = getScore(x);
  const rankBadge = rank > 0 ? `<div class="card-rank">#${rank}</div>` : '';
  return `<article class="card" data-id="${x.id}" data-type="${type}">
    ${bg ? `<img class="card-img" src="${escA(bg)}" alt="${escA(title)}" loading="lazy">` : `<div class="card-ph">🎬</div>`}
    ${rankBadge}
    <div class="card-logo-layer" data-logo-id="${x.id}" data-logo-type="${type}" data-logo-title="${escA(title)}"></div>
    <div class="card-overlay">
      <div class="card-title">${esc(title)}</div>
      <div class="card-meta">${year}${score !== '—' ? ` · ★ ${score}` : ''}</div>
    </div>
  </article>`;
}
function renderRow(id, items) {
  const el = $(id); if (!el) return;
  el.innerHTML = items.length ? items.slice(0, 18).map(x => cardHTML(x)).join('') : `<div style="color:#777;padding:12px">Nessun contenuto</div>`;
  hydrateLogos(el);
}
function renderTop10(id, items) {
  const el = $(id); if (!el) return;
  el.innerHTML = items.slice(0, 10).map((x, i) => `
    <div class="top10-item">
      <div class="top10-num">${i + 1}</div>
      ${cardHTML(x, 0)}
    </div>`).join('');
  hydrateLogos(el);
}
function renderGrid(id, items, append = false) {
  const el = $(id); if (!el) return;
  const html = items.length ? items.map(x => cardHTML(x)).join('') : `<div style="color:#777;padding:18px;text-align:center">Nessun contenuto trovato</div>`;
  if (append) el.insertAdjacentHTML('beforeend', html); else el.innerHTML = html;
  hydrateLogos(el);
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
function setPage(p) { $$('.page').forEach(el => el.classList.remove('active')); const el = $(`page-${p}`); if (el) el.classList.add('active'); $$('.nav-link,.mobile-link').forEach(b => b.classList.toggle('active', b.dataset.page === p)); }
async function navigate(p) {
  $('mobile-menu').classList.remove('open');
  if (p === 'home') { setPage('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (p === 'movies') { await openBrowse('movie'); return; }
  if (p === 'shows') { await openBrowse('tv'); return; }
  if (p === 'archive') { await openBrowse('all'); return; }
}
async function openBrowse(type = 'all') {
  lastPage = 'browse'; browse.type = type; browse.page = 1; setPage('browse');
  $('browse-eyebrow').textContent = 'Archivio';
  $('browse-title').textContent = type === 'movie' ? 'Film' : type === 'tv' ? 'Serie TV' : 'Archivio';
  $('browse-subtitle').textContent = `Sfoglia i titoli più popolari.`;
  $('filter-type').value = type;
  await loadBrowse(false);
}
async function loadBrowse(append = false) {
  if (browse.loading) return; browse.loading = true; $('load-more').disabled = true;
  try {
    let path, params = { page: browse.page, sort_by: browse.sort };
    if (browse.type === 'movie') path = '/movie/popular';
    else if (browse.type === 'tv') path = '/tv/popular';
    else { path = '/trending/all/week'; delete params.sort_by; }
    const data = await api(path, params);
    renderGrid('browse-grid', toTyped(data.results || [], browse.type === 'all' ? undefined : browse.type), append);
    browse.page++;
  } catch (e) { if (!append) $('browse-grid').innerHTML = '<div style="color:#777;padding:18px">Errore.</div>'; console.warn(e); }
  browse.loading = false; $('load-more').disabled = false;
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
async function runSearch(q) {
  q = q.trim(); const res = $('search-results');
  if (!q || q.length < 2) { res.classList.remove('open'); return; }
  res.classList.add('open'); res.innerHTML = '<div style="padding:14px;color:#999">Ricerca...</div>';
  try {
    const data = await api('/search/multi', { query: q, include_adult: 'false' });
    const items = (data.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 10);
    if (!items.length) { res.innerHTML = '<div style="padding:14px;color:#999">Nessun risultato</div>'; return; }
    res.innerHTML = items.map(x => {
      const img = imgURL(x.poster_path, 'w300');
      return `<article class="search-item" data-id="${x.id}" data-type="${x.media_type}">
        ${img ? `<img src="${escA(img)}" alt="" loading="lazy">` : '<div class="card-ph" style="aspect-ratio:16/9;font-size:1.2rem">🎬</div>'}
        <div class="search-meta"><div class="search-title">${esc(getTitle(x))}</div><div style="font-size:.76rem;color:#aaa;margin-top:3px">${getYear(x)} · ${x.media_type === 'tv' ? 'Serie' : 'Film'}</div></div>
      </article>`;
    }).join('');
  } catch { res.innerHTML = '<div style="padding:14px;color:#f66">Errore di rete</div>'; }
}
function closeSearch() { $('search-box').classList.remove('active'); $('search-toggle').classList.remove('hidden'); $('search-results').classList.remove('open'); $('search-input').value = ''; }

// ─── DETAIL ───────────────────────────────────────────────────────────────────
async function openDetail(id, type, fromResume = false) {
  try {
    setPage('detail');
    lastPage = lastPage === 'browse' ? 'browse' : 'home';
    const ep = type === 'movie' ? 'movie' : 'tv';
    const data = await api(`/${ep}/${id}`);
    data._type = type; currentDetail = data; currentSeason = 1; currentEpisode = null; currentEpisodes = [];
    renderDetail(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (type === 'tv') await renderSeasons(data);
    renderRelated(data);
    if (!fromResume) { watchBaseSeconds = 0; await commitProgress(); }
  } catch (e) { toast('Errore caricamento titolo'); console.error(e); }
}
function renderDetail(x) {
  const type = getType(x);
  const bg = detailBg(x), poster = imgURL(x.poster_path, 'w500');
  $('detail-bg').style.backgroundImage = bg ? `url('${bg}')` : '';
  $('detail-cover').innerHTML = poster ? `<img src="${escA(poster)}" alt="${escA(getTitle(x))}">` : '<div class="card-ph" style="aspect-ratio:2/3;font-size:3rem">🎬</div>';
  $('detail-kicker').innerHTML = `<span class="pill red">${type === 'tv' ? 'Serie TV' : 'Film'}</span>`;
  $('detail-title').textContent = getTitle(x);
  const rt = x.runtime ? `${x.runtime} min` : (Array.isArray(x.episode_run_time) && x.episode_run_time[0] ? `${x.episode_run_time[0]} min/ep` : '');
  $('detail-meta').textContent = [getYear(x), getScore(x) !== '—' ? `★ ${getScore(x)}` : '', rt].filter(Boolean).join(' · ');
  $('detail-plot').textContent = x.overview || 'Nessuna trama disponibile.';
  $('detail-genres').innerHTML = genreList(x).map(g => `<span class="pill">${esc(g)}</span>`).join('');
  $('episodes-section').classList.add('hidden');
}
function mockSeasons(x) { return Array.from({ length: x.number_of_seasons || 1 }, (_, i) => ({ season_number: i + 1 })); }
async function renderSeasons(x) {
  const seasons = x.seasons?.filter(s => Number(s.season_number) > 0) || mockSeasons(x);
  $('season-tabs').innerHTML = seasons.map(s => `<button class="season-tab${s.season_number === 1 ? ' active' : ''}" data-season="${s.season_number}">Stagione ${s.season_number}</button>`).join('');
  await loadSeason(x.id, 1);
}
async function loadSeason(tvId, n) {
  currentSeason = n; currentEpisode = null;
  $$('.season-tab').forEach(b => b.classList.toggle('active', Number(b.dataset.season) === Number(n)));
  try {
    const data = await api(`/tv/${tvId}/season/${n}`, { language: 'it-IT' });
    const today = new Date().toISOString().slice(0, 10);
    currentEpisodes = (data.episodes || []).filter(ep => !ep.air_date || ep.air_date <= today);
    $('episodes-subtitle').textContent = `Stagione ${n} · ${currentEpisodes.length} episodi`;
    $('episodes-grid').innerHTML = currentEpisodes.length
      ? currentEpisodes.map(ep => {
        const nm = ep.episode_number, name = ep.name || `Episodio ${nm}`;
        const img = ep.still_path ? imgURL(ep.still_path, 'w300') : '';
        const rt = ep.runtime ? `${ep.runtime} min` : '';
        return `<article class="episode-card" data-episode="${nm}">
          <div class="episode-thumb">${img ? `<img src="${escA(img)}" alt="${escA(name)}" loading="lazy">` : `<div class="card-ph">${nm}</div>`}<button class="episode-play" data-episode-play="${nm}">▶</button></div>
          <div class="episode-body">
            <div class="episode-top"><span>Ep. ${nm}${rt ? ' · ' + rt : ''}</span></div>
            <div class="episode-title">${nm}. ${esc(name)}</div>
            <p class="episode-plot">${esc(ep.overview || '')}</p>
          </div>
        </article>`;
      }).join('')
      : '<div style="padding:14px;color:#777">Nessun episodio disponibile.</div>';
    $('episodes-section').classList.remove('hidden');
  } catch (e) { console.warn(e); $('episodes-grid').innerHTML = '<div style="padding:14px;color:#f66">Errore.</div>'; $('episodes-section').classList.remove('hidden'); }
}
function selectEpisode(n, scroll = true) {
  currentEpisode = n;
  $$('.episode-card').forEach(el => el.classList.toggle('active', Number(el.dataset.episode) === Number(n)));
  if (scroll) { const c = document.querySelector(`.episode-card[data-episode="${n}"]`); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}
async function renderRelated(x) {
  const type = getType(x), ep = type === 'movie' ? 'movie' : 'tv';
  try {
    let data = await api(`/${ep}/${x.id}/recommendations`, { language: 'it-IT' });
    let items = toTyped(data.results || [], type).slice(0, 14);
    if (!items.length) { data = await api(`/${ep}/${x.id}/similar`, { language: 'it-IT' }); items = toTyped(data.results || [], type).slice(0, 14); }
    renderRow('row-related', items);
  } catch { renderRow('row-related', []); }
}

// ─── PLAYER (vixsrc.to — iframe fullscreen pulito) ────────────────────────────
function buildUrl() {
  if (!currentDetail) return null;
  const type = getType(currentDetail);
  const base = type === 'movie'
    ? `https://vixsrc.to/movie/${currentDetail.id}`
    : `https://vixsrc.to/tv/${currentDetail.id}/${currentSeason}/${currentEpisode || (currentEpisodes[0]?.episode_number) || 1}`;
  return base + '?lang=it&language=it&audio=it&locale=it-IT';
}

async function playSelected(resumeAt = 0) {
  if (!currentDetail) {
    if (currentHero) { await openDetail(currentHero.id, getType(currentHero), true); }
    else { toast('Nessun titolo selezionato.'); return; }
  }
  if (getType(currentDetail) === 'tv' && !currentEpisode) {
    const first = currentEpisodes[0];
    if (first) selectEpisode(first.episode_number, false);
    else { toast('Seleziona un episodio.'); return; }
  }
  let url = buildUrl();
  if (resumeAt > 0) url += `&t=${Math.floor(resumeAt)}`;

  // Player fullscreen pulito — solo iframe, tasto ← per chiudere
  const ps = $('player-screen');
  $('player-title').textContent = getTitle(currentDetail);
  $('player-subtitle').textContent = getType(currentDetail) === 'tv' ? `S${currentSeason} · Ep ${currentEpisode || 1}` : 'Film';
  $('player-area').innerHTML = `<iframe src="${escA(url)}" allowfullscreen allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerpolicy="origin" style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#000"></iframe>`;
  ps.classList.remove('hidden');
  ps.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');

  // Avvia timer progresso
  watchBaseSeconds = Math.max(0, Math.floor(Number(resumeAt) || 0));
  startProgressTimer();

  // Fullscreen automatico
  if (ps.requestFullscreen) ps.requestFullscreen().catch(() => { });
}

async function closePlayer() {
  stopProgressTimer();
  await commitProgress();
  watchBaseSeconds = 0;
  $('player-area').innerHTML = '';
  $('player-screen').classList.add('hidden');
  $('player-screen').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
}

// ─── MY LIST ─────────────────────────────────────────────────────────────────
function addToMyList() {
  if (!CURRENT_USER) { openAuth('login'); toast('Accedi per usare la lista'); return; }
  if (!currentDetail || !FB) { toast('Non disponibile.'); return; }
  const type = getType(currentDetail);
  FB.setDoc(FB.doc(FB.db, 'users', CURRENT_USER.uid, 'myList', `${type}_${currentDetail.id}`),
    { type, tmdbId: currentDetail.id, title: getTitle(currentDetail), posterPath: currentDetail.poster_path || null, updatedAt: FB.serverTimestamp() },
    { merge: true }
  ).then(() => toast('Aggiunto alla lista ✓', true)).catch(() => toast('Errore lista'));
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function bindEvents() {
  $('logo').addEventListener('click', e => { e.preventDefault(); navigate('home'); });
  $$('.nav-link,.mobile-link,.slider-browse').forEach(b => b.addEventListener('click', () => navigate(b.dataset.page)));
  $('hamburger').addEventListener('click', () => $('mobile-menu').classList.toggle('open'));

  $('search-toggle').addEventListener('click', () => { $('search-box').classList.add('active'); $('search-toggle').classList.add('hidden'); $('search-input').focus(); });
  $('search-close').addEventListener('click', closeSearch);
  $('search-input').addEventListener('input', debounce(e => runSearch(e.target.value), 260));
  document.addEventListener('click', e => { if (!$('search-shell').contains(e.target)) $('search-results').classList.remove('open'); });

  // Click delegation
  document.addEventListener('click', async e => {
    // Card film/serie
    const card = e.target.closest('.card,.search-item');
    if (card && card.dataset.id) { await openDetail(Number(card.dataset.id), card.dataset.type); return; }

    // Play episodio
    const epPlay = e.target.closest('[data-episode-play]');
    if (epPlay) { e.stopPropagation(); selectEpisode(Number(epPlay.dataset.episodePlay), false); await playSelected(); return; }

    // Seleziona episodio
    const epCard = e.target.closest('.episode-card');
    if (epCard) { selectEpisode(Number(epCard.dataset.episode)); return; }

    // Rimuovi da continua a guardare
    if (e.target.dataset.rm) { await removeProgress(e.target.dataset.rm); return; }

    // Continua a guardare
    const cont = e.target.closest('.continue-card');
    if (cont && !e.target.dataset.rm) { await resumeItem(cont); return; }
  });

  $$('.slider-arrow').forEach(b => b.addEventListener('click', () => {
    const track = b.parentElement.querySelector('.slider-track');
    track.scrollBy({ left: (b.classList.contains('left') ? -1 : 1) * track.clientWidth * .82, behavior: 'smooth' });
  }));

  $('hero-info').addEventListener('click', () => currentHero && openDetail(currentHero.id, getType(currentHero)));
  $('hero-play').addEventListener('click', async () => { if (!currentHero) return; await openDetail(currentHero.id, getType(currentHero), true); await playSelected(); });
  $('detail-back').addEventListener('click', () => lastPage === 'browse' ? setPage('browse') : navigate('home'));
  $('detail-play').addEventListener('click', () => playSelected());
  $('detail-list').addEventListener('click', addToMyList);

  $('filter-type').addEventListener('change', async e => { browse.type = e.target.value === 'tv' ? 'tv' : e.target.value === 'movie' ? 'movie' : 'all'; browse.page = 1; await openBrowse(browse.type); });
  $('filter-sort').addEventListener('change', async e => { browse.sort = e.target.value; browse.page = 1; await loadBrowse(false); });
  $('browse-refresh').addEventListener('click', () => { browse.page = 1; loadBrowse(false); });
  $('load-more').addEventListener('click', () => loadBrowse(true));

  $('login-open').addEventListener('click', () => openAuth('login'));
  $('register-open').addEventListener('click', () => openAuth('register'));
  $('logout-btn').addEventListener('click', async () => {
    if (FB) await FB.signOut(FB.auth);
    CURRENT_USER = null; updateAuthUI(); renderContinueWatching([]); toast('Sei uscito');
  });
  $('auth-close').addEventListener('click', closeAuth);
  $('auth-overlay').addEventListener('click', e => { if (e.target === $('auth-overlay')) closeAuth(); });
  $('tab-login').addEventListener('click', () => setAuthMode('login'));
  $('tab-register').addEventListener('click', () => setAuthMode('register'));
  $('auth-form').addEventListener('submit', handleAuth);
  $('clear-progress').addEventListener('click', clearAllProgress);

  // Player
  $('player-close').addEventListener('click', closePlayer);
  document.addEventListener('keydown', e => {
    if (!$('player-screen').classList.contains('hidden')) {
      if (e.key === 'Escape') closePlayer();
    } else if (e.key === 'Escape') { closeSearch(); closeAuth(); }
  });
  // Salva prima di chiudere tab
  window.addEventListener('beforeunload', () => { stopProgressTimer(); commitProgress(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopProgressTimer(); commitProgress(); } else if (!$('player-screen').classList.contains('hidden')) { startProgressTimer(); } });

  $('season-tabs').addEventListener('click', e => { const b = e.target.closest('.season-tab'); if (b && currentDetail) loadSeason(currentDetail.id, Number(b.dataset.season)); });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    FB = await FIREBASE_LOADED;
    FB.onAuthStateChanged(FB.auth, async user => {
      CURRENT_USER = user; updateAuthUI();
      if (user) {
        try { await FB.setDoc(FB.doc(FB.db, 'users', user.uid), { email: user.email || '', displayName: user.displayName || '', lastLoginAt: FB.serverTimestamp() }, { merge: true }); } catch { }
        await loadProgress();
      } else { renderContinueWatching([]); }
    });
  } catch (e) { console.warn('Firebase offline', e); FB = null; }
  $('setup-banner').classList.toggle('hidden', TMDB_OK);
  updateAuthUI(); bindEvents();
  await loadGenres();
  await initHome();
}
document.addEventListener('DOMContentLoaded', init);