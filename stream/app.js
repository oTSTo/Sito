/* ============================================
   TMDB catalog + Firebase Auth/Firestore + vixsrc.to player
   ============================================ */

// ─── FIREBASE SETUP ─────────────────────────────────────────────────────────
// Carica Firebase come moduli ES e li espone globalmente prima di tutto il resto.
// Se vuoi cambiare progetto, modifica solo firebaseConfig qui sotto.
const FIREBASE_LOADED = (async () => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js');
  const {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, updateProfile
  } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js');
  const {
    initializeFirestore, collection, doc, setDoc, getDocs,
    deleteDoc, query, orderBy, limit, serverTimestamp
  } = await import('https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js');

  const firebaseConfig = {
    apiKey: "AIzaSyB4dr6akGGmZoFNEFUBGOYgY8UPlkI16uY",
    authDomain: "streaming-films.firebaseapp.com",
    projectId: "streaming-films",
    storageBucket: "streaming-films.firebasestorage.app",
    messagingSenderId: "216208577687",
    appId: "1:216208577687:web:a2a77de0031113544b05d2",
    measurementId: "G-NW42LJ6WJ1"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

  return {
    auth, db,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, updateProfile,
    collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, limit, serverTimestamp
  };
})();

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const TMDB_API_KEY = localStorage.getItem('tmdb_api_key') || '8265bd1679663a7ea12ac168da84d2e8';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG = {
  w300: 'https://image.tmdb.org/t/p/w300',
  w500: 'https://image.tmdb.org/t/p/w500',
  w780: 'https://image.tmdb.org/t/p/w780',
  original: 'https://image.tmdb.org/t/p/original'
};

const TMDB_READY = TMDB_API_KEY && !TMDB_API_KEY.includes('INSERISCI');
const TODAY = new Date();
TODAY.setHours(23, 59, 59, 999);

// ─── MOCK FALLBACK ───────────────────────────────────────────────────────────
const MOCK_ITEMS = [
  { id: 101, media_type: 'tv', name: 'Spider-Noir', first_air_date: '2025-01-01', vote_average: 8.4, genre_ids: [], overview: 'Un investigatore privato invecchiato è costretto a fare i conti con il passato da supereroe.', backdrop_path: '', poster_path: '', number_of_seasons: 1 },
  { id: 102, media_type: 'movie', title: 'Metro 2099', release_date: '2025-02-13', vote_average: 7.8, genre_ids: [], overview: 'Una corsa nel futuro fra neon, tecnologia e segreti nascosti.', backdrop_path: '', poster_path: '' },
  { id: 103, media_type: 'tv', name: 'Loki', first_air_date: '2021-06-09', vote_average: 8.2, genre_ids: [], overview: 'Una variante temporale deve sistemare una linea del tempo fuori controllo.', backdrop_path: '', poster_path: '', number_of_seasons: 2 },
  { id: 104, media_type: 'movie', title: 'City Heist', release_date: '2024-08-20', vote_average: 7.2, genre_ids: [], overview: 'Un gruppo prepara il colpo più rischioso della propria vita.', backdrop_path: '', poster_path: '' },
  { id: 105, media_type: 'movie', title: 'Oceano Rosso', release_date: '2025-05-01', vote_average: 7.9, genre_ids: [], overview: 'Un thriller ambientato in una nave bloccata nel mezzo dell\'oceano.', backdrop_path: '', poster_path: '' },
  { id: 106, media_type: 'tv', name: 'North Valley', first_air_date: '2024-11-11', vote_average: 8.1, genre_ids: [], overview: 'In una città di montagna, ogni famiglia nasconde un mistero.', backdrop_path: '', poster_path: '', number_of_seasons: 3 }
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let genres = { movie: {}, tv: {} };
let currentHero = null;
let currentDetail = null;
let currentSeason = 1;
let currentEpisode = null;
let currentEpisodes = [];
let browse = { type: 'all', sort: 'popularity.desc', page: 1, loading: false };
let authMode = 'login';
let lastPage = 'home';

// Firebase state (riempito dopo FIREBASE_LOADED)
let FB = null;        // { auth, db, ...firestore methods }
let CURRENT_USER = null; // firebase User object

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function escapeAttr(v) { return escapeHTML(v).replace(/'/g, '&#39;'); }
function getType(item) { return item.media_type || item._type || (item.title ? 'movie' : 'tv'); }
function getTitle(item) { return item.title || item.name || item.original_title || item.original_name || 'Senza titolo'; }
function getDate(item) { return item.release_date || item.first_air_date || ''; }
function getYear(item) { return String(getDate(item)).slice(0, 4) || '—'; }
function getScore(item) { return item.vote_average ? Number(item.vote_average).toFixed(1) : '—'; }
function getRuntime(item) {
  if (item.runtime) return `${item.runtime} min`;
  const r = Array.isArray(item.episode_run_time) && item.episode_run_time[0];
  return r ? `${r} min/ep` : '';
}
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function isReleased(date) {
  if (!date) return true;
  const p = new Date(date);
  return Number.isNaN(p.getTime()) ? true : p <= TODAY;
}
function debounce(fn, delay = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
function toast(message, ok = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('ok', ok);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}
function normalizeType(type) { return type === 'tv' ? 'tv' : type === 'movie' ? 'movie' : 'all'; }
function imageURL(path, size = 'w780') { return path ? `${IMG[size] || IMG.w780}${path}` : ''; }
function cardImage(item) { return imageURL(item.backdrop_path, 'w780') || imageURL(item.poster_path, 'w500'); }
function detailImage(item) { return imageURL(item.backdrop_path, 'original') || imageURL(item.poster_path, 'w780'); }
function genreNames(item) {
  if (Array.isArray(item.genres)) return item.genres.map(g => g.name).filter(Boolean);
  const type = getType(item);
  return (item.genre_ids || []).slice(0, 4).map(id => genres[type]?.[id]).filter(Boolean);
}
function apiPath(path, params = {}) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', params.language || 'it-IT');
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && k !== 'language') url.searchParams.set(k, v);
  });
  return url.toString();
}
async function fetchJSON(path, params = {}) {
  if (!TMDB_READY) throw new Error('TMDB API key mancante');
  const res = await fetch(apiPath(path, params));
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  return res.json();
}
function showSetupIfNeeded() {
  $('setup-banner').classList.toggle('hidden', TMDB_READY);
}
function emptyMessage(text) { return `<div class="search-empty">${escapeHTML(text)}</div>`; }
function placeholderBlock(label = '▶') { return `<div class="card-ph">${escapeHTML(label)}</div>`; }

function mediaKey(item = currentDetail, season = currentSeason, episode = currentEpisode) {
  if (!item) return '';
  const type = getType(item);
  if (type === 'tv') return `tv_${item.id}_s${Number(season || 1)}e${Number(episode || 1)}`;
  return `movie_${item.id}`;
}
function firestoreProgressId(item = currentDetail, season = currentSeason, episode = currentEpisode) {
  if (!item) return '';
  const type = getType(item);
  return type === 'tv' ? `tv_${item.id}` : `movie_${item.id}`;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function updateAuthUI() {
  const logged = !!CURRENT_USER;
  $('login-open').classList.toggle('hidden', logged);
  $('register-open').classList.toggle('hidden', logged);
  $('profile-chip').classList.toggle('hidden', !logged);
  $('logout-btn').classList.toggle('hidden', !logged);
  if (CURRENT_USER) {
    $('profile-name').textContent = CURRENT_USER.displayName || CURRENT_USER.email?.split('@')[0] || 'Utente';
  }
}
function openAuth(mode = 'login') {
  authMode = mode;
  setAuthMode(mode);
  $('auth-overlay').classList.remove('hidden');
  $('auth-overlay').setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  setTimeout(() => $('auth-email').focus(), 60);
}
function closeAuth() {
  $('auth-overlay').classList.add('hidden');
  $('auth-overlay').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  hideAuthMessage();
}
function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  const isReg = authMode === 'register';
  $('tab-login').classList.toggle('active', !isReg);
  $('tab-register').classList.toggle('active', isReg);
  $$('.register-only').forEach(el => el.classList.toggle('hidden', !isReg));
  $('auth-submit').textContent = isReg ? 'Registrati' : 'Accedi';
  $('auth-password').setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
  hideAuthMessage();
}
function showAuthMessage(msg, ok = false) {
  const box = $('auth-message');
  box.textContent = msg;
  box.classList.toggle('ok', ok);
  box.classList.remove('hidden');
}
function hideAuthMessage() { $('auth-message').classList.add('hidden'); }

function authErrorMessage(e) {
  return ({
    'auth/email-already-in-use': 'Email già registrata.',
    'auth/invalid-email': 'Email non valida.',
    'auth/weak-password': 'Password troppo debole: minimo 6 caratteri.',
    'auth/invalid-credential': 'Email o password non corretti.',
    'auth/too-many-requests': 'Troppi tentativi. Riprova più tardi.'
  }[e.code] || e.message || 'Errore Firebase.');
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!FB) { showAuthMessage('Firebase non ancora pronto, attendi.'); return; }
  hideAuthMessage();
  const email = $('auth-email').value.trim();
  const pass = $('auth-password').value;
  const name = $('auth-name').value.trim();
  if (!email || !pass) return showAuthMessage('Inserisci email e password.');
  if (pass.length < 6) return showAuthMessage('Password troppo corta: minimo 6 caratteri.');

  if (authMode === 'register') {
    const pass2 = $('auth-password2').value;
    if (pass !== pass2) return showAuthMessage('Le password non coincidono.');
    try {
      const cr = await FB.createUserWithEmailAndPassword(FB.auth, email, pass);
      if (name) await FB.updateProfile(cr.user, { displayName: name });
      try {
        await FB.setDoc(FB.doc(FB.db, 'users', cr.user.uid), {
          email, displayName: name || '', createdAt: FB.serverTimestamp()
        }, { merge: true });
      } catch (e) { console.warn('Profilo Firestore non salvato', e); }
      closeAuth();
      toast('Account creato', true);
    } catch (e) { showAuthMessage(authErrorMessage(e)); }
    return;
  }

  // login
  try {
    await FB.signInWithEmailAndPassword(FB.auth, email, pass);
    closeAuth();
    toast('Accesso effettuato', true);
  } catch (e) { showAuthMessage(authErrorMessage(e)); }
}

// ─── PROGRESS LOCALE (fallback) ──────────────────────────────────────────────
function localProgressKey() {
  return CURRENT_USER ? `sc_progress_${CURRENT_USER.uid}` : null;
}
function readLocalProgress() {
  const key = localProgressKey();
  if (!key) return [];
  try {
    return Object.entries(JSON.parse(localStorage.getItem(key) || '{}')).
      map(([id, data]) => ({ id, ...data })).
      sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  } catch { return []; }
}
function writeLocalProgress(id, data) {
  const key = localProgressKey();
  if (!key || !id) return;
  try {
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    all[id] = { ...data, updatedAtMs: Date.now() };
    localStorage.setItem(key, JSON.stringify(all));
  } catch (e) { console.warn('Progress locale non salvato', e); }
}
function deleteLocalProgress(id) {
  const key = localProgressKey();
  if (!key || !id) return;
  try {
    const all = JSON.parse(localStorage.getItem(key) || '{}');
    delete all[id];
    localStorage.setItem(key, JSON.stringify(all));
  } catch {}
}

// ─── PROGRESS FIRESTORE ───────────────────────────────────────────────────────
function progressPayload(time = 0, duration = 0) {
  const type = getType(currentDetail);
  const pct = duration ? Math.max(1, Math.min(99, Math.round((time / duration) * 100))) : 8;
  return {
    type,
    tmdbId: currentDetail.id,
    title: getTitle(currentDetail),
    posterPath: currentDetail.poster_path || null,
    backdropPath: currentDetail.backdrop_path || null,
    season: type === 'tv' ? currentSeason : null,
    episode: type === 'tv' ? (currentEpisode || 1) : null,
    lastTime: Math.floor(time || 0),
    duration: Math.floor(duration || 0),
    progress: pct,
    updatedAt: null  // replaced by serverTimestamp on write
  };
}

async function saveProgress(time = 0, duration = 0) {
  if (!CURRENT_USER || !currentDetail) return;
  const fsId = firestoreProgressId();
  const payload = progressPayload(time, duration);
  // Salva locale subito (fallback offline)
  writeLocalProgress(fsId, payload);
  // Poi Firestore
  if (FB) {
    try {
      await FB.setDoc(
        FB.doc(FB.db, 'users', CURRENT_USER.uid, 'watchProgress', fsId),
        { ...payload, updatedAt: FB.serverTimestamp() },
        { merge: true }
      );
    } catch (e) { console.warn('Progress Firestore fallito, uso locale', e); }
  }
  renderContinueWatching();
}

async function loadProgress(showToast = false) {
  if (!CURRENT_USER) {
    $('continue-section').classList.add('hidden');
    $('continue-track').innerHTML = '';
    return;
  }
  try {
    if (FB) {
      const q = FB.query(
        FB.collection(FB.db, 'users', CURRENT_USER.uid, 'watchProgress'),
        FB.orderBy('updatedAt', 'desc'),
        FB.limit(12)
      );
      const snap = await FB.getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderContinueWatching(items);
    } else {
      renderContinueWatching(readLocalProgress().slice(0, 12));
    }
    if (showToast) toast('Cronologia aggiornata');
  } catch (e) {
    console.warn('Uso cronologia locale', e);
    renderContinueWatching(readLocalProgress().slice(0, 12));
    if (showToast) toast('Cronologia locale aggiornata');
  }
}

async function removeProgressItem(id) {
  if (!CURRENT_USER || !id) return;
  deleteLocalProgress(id);
  if (FB) {
    try {
      await FB.deleteDoc(FB.doc(FB.db, 'users', CURRENT_USER.uid, 'watchProgress', id));
    } catch (e) { console.warn('Rimozione Firestore fallita, rimosso locale', e); }
  }
  await loadProgress();
  toast('Rimosso');
}

function renderContinueWatching(items) {
  // Se chiamata senza argomenti (da saveProgress), usa locale
  if (!items) items = readLocalProgress().slice(0, 12);
  const section = $('continue-section');
  const track = $('continue-track');
  if (!CURRENT_USER || !items.length) {
    section.classList.add('hidden');
    track.innerHTML = '';
    return;
  }
  section.classList.remove('hidden');
  track.innerHTML = items.map(x => {
    const pct = Math.max(5, Math.min(100, Number(x.progress || x.pct || 0) || 8));
    const img = (x.backdropPath ? imageURL(x.backdropPath, 'w780') : '') ||
                (x.posterPath ? imageURL(x.posterPath, 'w500') : '') ||
                x.image || '';
    const meta = x.type === 'tv' ? `S${x.season || 1} E${x.episode || 1} · ${formatTime(x.lastTime || x.time || 0)}` : `Film · ${formatTime(x.lastTime || x.time || 0)}`;
    return `<article class="continue-card"
        data-progress-id="${escapeAttr(x.id)}"
        data-id="${Number(x.tmdbId || x.id || 0)}"
        data-type="${escapeAttr(x.type || 'movie')}"
        data-season="${Number(x.season || 1)}"
        data-episode="${Number(x.episode || 1)}"
        data-time="${Math.floor(Number(x.lastTime || x.time || 0))}"
        data-removable="1">
      ${img ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(x.title || '')}">` : ''}
      <div class="continue-content">
        <div class="continue-title">${escapeHTML(x.title || 'Senza titolo')}</div>
        <div class="continue-meta">${meta}</div>
        <div class="continue-progress"><span style="width:${pct}%"></span></div>
      </div>
    </article>`;
  }).join('');
}

async function clearProgress() {
  if (!CURRENT_USER) return;
  const key = `sc_progress_${CURRENT_USER.uid}`;
  localStorage.removeItem(key);
  // Rimuovi anche da Firestore se disponibile
  if (FB) {
    try {
      const q = FB.query(FB.collection(FB.db, 'users', CURRENT_USER.uid, 'watchProgress'), FB.limit(50));
      const snap = await FB.getDocs(q);
      await Promise.all(snap.docs.map(d => FB.deleteDoc(d.ref)));
    } catch (e) { console.warn('Pulizia Firestore parziale', e); }
  }
  renderContinueWatching([]);
  toast('Cronologia svuotata');
}

async function resumeProgress(card) {
  const id = Number(card.dataset.id);
  const type = card.dataset.type;
  const season = Number(card.dataset.season || 1);
  const episode = Number(card.dataset.episode || 1);
  const time = Number(card.dataset.time || 0);
  await openDetail(id, type, true);
  if (type === 'tv') {
    await loadSeason(id, season);
    selectEpisode(episode, false);
  }
  await playSelected(time);
}

// ─── TMDB LOADING ──────────────────────────────────────────────────────────────
async function loadGenres() {
  if (!TMDB_READY) return;
  try {
    const [mv, tv] = await Promise.all([fetchJSON('/genre/movie/list'), fetchJSON('/genre/tv/list')]);
    genres.movie = Object.fromEntries((mv.genres || []).map(g => [g.id, g.name]));
    genres.tv = Object.fromEntries((tv.genres || []).map(g => [g.id, g.name]));
  } catch (e) { console.warn('Generi non caricati', e); }
}
function toTyped(items, fallbackType) {
  return (items || [])
    .filter(x => x && (x.media_type === 'movie' || x.media_type === 'tv' || fallbackType))
    .map(x => ({ ...x, media_type: x.media_type || fallbackType }));
}
async function getHomeData() {
  if (!TMDB_READY) {
    return {
      trending: MOCK_ITEMS, movies: MOCK_ITEMS.filter(x => getType(x) === 'movie'),
      shows: MOCK_ITEMS.filter(x => getType(x) === 'tv'), top10: MOCK_ITEMS,
      newMovies: MOCK_ITEMS.filter(x => getType(x) === 'movie')
    };
  }
  const [trending, movies, shows, top10, newMovies] = await Promise.all([
    fetchJSON('/trending/all/week').catch(() => ({ results: [] })),
    fetchJSON('/movie/popular', { page: 1 }).catch(() => ({ results: [] })),
    fetchJSON('/tv/popular', { page: 1 }).catch(() => ({ results: [] })),
    fetchJSON('/trending/all/day').catch(() => ({ results: [] })),
    fetchJSON('/movie/now_playing', { page: 1, region: 'IT' }).catch(() => ({ results: [] }))
  ]);
  return {
    trending: toTyped(trending.results, 'movie'),
    movies: toTyped(movies.results, 'movie'),
    shows: toTyped(shows.results, 'tv'),
    top10: toTyped(top10.results, 'movie'),
    newMovies: toTyped(newMovies.results, 'movie')
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
    const heroPool = [...data.trending, ...data.movies, ...data.shows].filter(x => x && (x.backdrop_path || !TMDB_READY));
    currentHero = heroPool[0] || MOCK_ITEMS[0];
    renderHero(currentHero);
  } catch (err) {
    console.error(err);
    toast('Errore TMDB: uso dati demo');
    const data = { trending: MOCK_ITEMS, movies: MOCK_ITEMS.filter(x => getType(x) === 'movie'), shows: MOCK_ITEMS.filter(x => getType(x) === 'tv'), top10: MOCK_ITEMS, newMovies: MOCK_ITEMS.filter(x => getType(x) === 'movie') };
    renderRow('row-trending', data.trending); renderRow('row-movies', data.movies); renderRow('row-shows', data.shows);
    renderTop10('row-top10', data.top10); renderRow('row-new-movies', data.newMovies);
    currentHero = data.trending[0]; renderHero(currentHero);
  }
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderHero(item) {
  if (!item) return;
  const img = detailImage(item);
  $('hero-bg').style.backgroundImage = img ? `url('${img}')` : '';
  $('hero-title').textContent = getTitle(item);
  $('hero-plot').textContent = item.overview || 'Nessuna descrizione disponibile.';
  $('hero-meta').textContent = [getYear(item), getScore(item) !== '—' ? `★ ${getScore(item)}` : ''].filter(Boolean).join(' · ');
}
function cardHTML(item, index = 0) {
  const type = getType(item);
  const img = cardImage(item);
  const title = getTitle(item);
  const year = getYear(item);
  const score = getScore(item);
  return `<article class="card" data-id="${item.id}" data-type="${type}">
    ${img ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(title)}" loading="lazy">` : placeholderBlock('🎬')}
    ${index > 0 ? `<div class="rank">#${index}</div>` : ''}
    <div class="card-info">
      <div class="card-title">${escapeHTML(title)}</div>
      <div class="card-meta">${year}${score !== '—' ? ` · ★ ${score}` : ''}</div>
    </div>
  </article>`;
}
function renderRow(id, items) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items.length ? items.slice(0, 18).map(x => cardHTML(x)).join('') : emptyMessage('Nessun contenuto disponibile');
}
function renderTop10(id, items) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = items.slice(0, 10).map((x, i) => cardHTML(x, i + 1)).join('');
}
function renderGrid(id, items, append = false) {
  const el = $(id);
  if (!el) return;
  const html = items.length ? items.map(x => cardHTML(x)).join('') : emptyMessage('Nessun contenuto trovato');
  if (append) el.insertAdjacentHTML('beforeend', html);
  else el.innerHTML = html;
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function setActivePage(page) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const el = $(`page-${page}`);
  if (el) el.classList.add('active');
  $$('.nav-link, .mobile-link').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
}
async function navigate(page) {
  $('mobile-menu').classList.remove('open');
  if (page === 'home') { setActivePage('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (page === 'movies') { await openBrowse('movie'); return; }
  if (page === 'shows') { await openBrowse('tv'); return; }
  if (page === 'archive') { await openBrowse('all'); return; }
}
async function openBrowse(type = 'all') {
  lastPage = 'browse';
  browse.type = type;
  browse.page = 1;
  setActivePage('browse');
  $('browse-eyebrow').textContent = 'Archivio';
  $('browse-title').textContent = type === 'movie' ? 'Film' : type === 'tv' ? 'Serie TV' : 'Archivio';
  $('browse-subtitle').textContent = `Sfoglia i ${type === 'movie' ? 'film' : type === 'tv' ? 'le serie TV' : 'i titoli'} più popolari.`;
  $('filter-type').value = type;
  await loadBrowse(false);
}
async function loadBrowse(append = false) {
  if (browse.loading) return;
  browse.loading = true;
  $('load-more').disabled = true;
  try {
    let path, params = { page: browse.page, sort_by: browse.sort };
    if (browse.type === 'movie') { path = '/movie/popular'; }
    else if (browse.type === 'tv') { path = '/tv/popular'; }
    else { path = '/trending/all/week'; delete params.sort_by; }
    const data = await fetchJSON(path, params);
    const items = toTyped(data.results || [], browse.type === 'all' ? undefined : browse.type);
    renderGrid('browse-grid', items, append);
    browse.page++;
  } catch (e) {
    if (!append) $('browse-grid').innerHTML = emptyMessage('Errore di caricamento.');
    console.warn(e);
  }
  browse.loading = false;
  $('load-more').disabled = false;
}
async function runSearch(query) {
  const q = query.trim();
  const results = $('search-results');
  if (!q || q.length < 2) { results.classList.remove('open'); return; }
  results.classList.add('open');
  results.innerHTML = '<div class="search-empty">Ricerca in corso…</div>';
  try {
    const data = await fetchJSON('/search/multi', { query: q, include_adult: 'false' });
    const items = (data.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 10);
    if (!items.length) { results.innerHTML = emptyMessage('Nessun risultato'); return; }
    results.innerHTML = items.map(x => searchItemHTML(x)).join('');
  } catch { results.innerHTML = emptyMessage('Errore di rete'); }
}
function searchItemHTML(item) {
  const img = imageURL(item.poster_path, 'w300');
  return `<article class="search-item" data-id="${item.id}" data-type="${item.media_type}">
    ${img ? `<img src="${escapeAttr(img)}" alt="" loading="lazy">` : placeholderBlock('🎬')}
    <div class="search-meta">
      <div class="search-title">${escapeHTML(getTitle(item))}</div>
      <div class="search-year">${getYear(item)} · ${item.media_type === 'tv' ? 'Serie' : 'Film'}</div>
    </div>
  </article>`;
}
function closeSearch() {
  $('search-box').classList.remove('active');
  $('search-toggle').classList.remove('hidden');
  $('search-results').classList.remove('open');
  $('search-input').value = '';
}

// ─── DETAIL ───────────────────────────────────────────────────────────────────
async function openDetail(id, type, fromResume = false) {
  try {
    setActivePage('detail');
    lastPage = lastPage === 'browse' ? 'browse' : 'home';
    const ep = type === 'movie' ? 'movie' : 'tv';
    const data = await fetchJSON(`/${ep}/${id}`);
    data._type = type;
    currentDetail = data;
    currentSeason = 1;
    currentEpisode = null;
    currentEpisodes = [];
    renderDetail(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (type === 'tv') await renderSeasons(data);
    renderRelated(data);
    if (!fromResume) saveProgress(0, 0);
  } catch (e) {
    toast('Errore caricamento titolo');
    console.error(e);
  }
}
function renderDetail(item) {
  const type = getType(item);
  const img = detailImage(item);
  const poster = imageURL(item.poster_path, 'w500');
  $('detail-bg').style.backgroundImage = img ? `url('${img}')` : '';
  $('detail-cover').innerHTML = poster ? `<img src="${escapeAttr(poster)}" alt="${escapeAttr(getTitle(item))}">` : placeholderBlock('🎬');
  $('detail-kicker').innerHTML = `<span class="pill red">${type === 'tv' ? 'Serie TV' : 'Film'}</span>`;
  $('detail-title').textContent = getTitle(item);
  const year = getYear(item);
  const score = getScore(item);
  const runtime = getRuntime(item);
  $('detail-meta').textContent = [year, score !== '—' ? `★ ${score}` : '', runtime].filter(Boolean).join(' · ');
  $('detail-plot').textContent = item.overview || 'Nessuna trama disponibile.';
  $('detail-genres').innerHTML = genreNames(item).map(g => `<span class="pill">${escapeHTML(g)}</span>`).join('');
  $('episodes-section').classList.add('hidden');
}
function mockSeasons(item) {
  const n = item.number_of_seasons || 1;
  return Array.from({ length: n }, (_, i) => ({ season_number: i + 1, episode_count: null }));
}
async function renderSeasons(item) {
  const seasons = item.seasons?.filter(s => Number(s.season_number) > 0) || mockSeasons(item);
  $('season-tabs').innerHTML = seasons.map(s =>
    `<button class="season-tab${s.season_number === 1 ? ' active' : ''}" data-season="${s.season_number}">Stagione ${s.season_number}</button>`
  ).join('');
  await loadSeason(item.id, 1);
}
async function loadSeason(tvId, seasonNumber) {
  currentSeason = seasonNumber;
  currentEpisode = null;
  $$('.season-tab').forEach(b => b.classList.toggle('active', Number(b.dataset.season) === Number(seasonNumber)));
  try {
    const data = await fetchJSON(`/tv/${tvId}/season/${seasonNumber}`, { language: 'it-IT' });
    const today = new Date().toISOString().slice(0, 10);
    currentEpisodes = (data.episodes || []).filter(ep => !ep.air_date || ep.air_date <= today);
    $('episodes-subtitle').textContent = `Stagione ${seasonNumber} · ${currentEpisodes.length} episodi disponibili`;
    $('episodes-grid').innerHTML = currentEpisodes.length
      ? currentEpisodes.map(ep => episodeHTML(ep)).join('')
      : emptyMessage('Nessun episodio disponibile.');
    $('episodes-section').classList.remove('hidden');
  } catch (e) {
    console.warn('Stagione non caricata', e);
    $('episodes-grid').innerHTML = emptyMessage('Errore caricamento episodi.');
    $('episodes-section').classList.remove('hidden');
  }
}
function episodeHTML(ep) {
  const n = ep.episode_number;
  const name = ep.name || `Episodio ${n}`;
  const img = ep.still_path ? imageURL(ep.still_path, 'w300') : '';
  const runtime = ep.runtime ? `${ep.runtime} min` : '';
  return `<article class="episode-card" data-episode="${n}">
    <div class="episode-thumb">${img ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(name)}" loading="lazy">` : `<div class="card-ph">${n}</div>`}<button class="episode-play" type="button" data-episode-play="${n}">▶</button></div>
    <div class="episode-info">
      <div class="episode-header"><strong>${n}. ${escapeHTML(name)}</strong>${runtime ? `<span>${runtime}</span>` : ''}</div>
      <p>${escapeHTML(ep.overview || '')}</p>
    </div>
  </article>`;
}
function selectEpisode(n, scroll = true) {
  currentEpisode = n;
  $$('.episode-card').forEach(el => el.classList.toggle('active', Number(el.dataset.episode) === Number(n)));
  if (scroll) {
    const card = document.querySelector(`.episode-card[data-episode="${n}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
async function renderRelated(item) {
  const type = getType(item);
  const ep = type === 'movie' ? 'movie' : 'tv';
  try {
    let data = await fetchJSON(`/${ep}/${item.id}/recommendations`, { language: 'it-IT' });
    let items = toTyped(data.results || [], type).slice(0, 14);
    if (!items.length) {
      data = await fetchJSON(`/${ep}/${item.id}/similar`, { language: 'it-IT' });
      items = toTyped(data.results || [], type).slice(0, 14);
    }
    renderRow('row-related', items);
  } catch { renderRow('row-related', []); }
}

// ─── PLAYER (vixsrc.to) ───────────────────────────────────────────────────────
function buildVixsrcUrl() {
  if (!currentDetail) return null;
  const type = getType(currentDetail);
  let url;
  if (type === 'movie') {
    url = `https://vixsrc.to/movie/${currentDetail.id}`;
  } else {
    const ep = currentEpisode || (currentEpisodes[0]?.episode_number) || 1;
    url = `https://vixsrc.to/tv/${currentDetail.id}/${currentSeason}/${ep}`;
  }
  // Passa parametri lingua italiana
  return url + (url.includes('?') ? '&' : '?') + 'lang=it&language=it&audio=it&locale=it-IT';
}

function ensurePlayableSelection() {
  if (!currentDetail) {
    if (currentHero) return openDetail(currentHero.id, getType(currentHero), true).then(() => true);
    toast('Nessun titolo selezionato.');
    return false;
  }
  if (getType(currentDetail) === 'tv' && !currentEpisode) {
    const first = currentEpisodes[0];
    if (first) selectEpisode(first.episode_number, false);
    else { toast('Seleziona un episodio disponibile.'); return false; }
  }
  return true;
}

async function playSelected(resumeAt = 0) {
  const ready = await ensurePlayableSelection();
  if (!ready) return;

  const title = getTitle(currentDetail);
  const type = getType(currentDetail);
  const subtitle = type === 'tv'
    ? `Stagione ${currentSeason} · Episodio ${currentEpisode || 1}`
    : 'Film';

  $('player-title').textContent = title;
  $('player-subtitle').textContent = subtitle;
  $('player-screen').classList.remove('hidden');
  $('player-screen').setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');

  let vixUrl = buildVixsrcUrl();
  if (resumeAt > 0) vixUrl += `&t=${Math.floor(resumeAt)}`;

  $('player-area').innerHTML = `<iframe
    src="${escapeAttr(vixUrl)}"
    allowfullscreen
    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
    referrerpolicy="origin"
    loading="lazy"
    style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;">
  </iframe>`;

  // Salva inizio visione
  saveProgress(resumeAt, 0);

  tryFullScreen();
}

function tryFullScreen() {
  const el = $('player-screen');
  if (document.fullscreenElement) return;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function closePlayer() {
  saveProgress(0, 0);
  $('player-area').innerHTML = '';
  $('player-screen').classList.add('hidden');
  $('player-screen').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// ─── MY LIST ──────────────────────────────────────────────────────────────────
function addToMyList() {
  if (!CURRENT_USER) { openAuth('login'); toast('Accedi per usare La mia lista'); return; }
  if (!currentDetail) return;
  if (!FB) { toast('Connessione in corso, riprova.'); return; }
  const type = getType(currentDetail);
  FB.setDoc(
    FB.doc(FB.db, 'users', CURRENT_USER.uid, 'myList', `${type}_${currentDetail.id}`),
    { type, tmdbId: currentDetail.id, title: getTitle(currentDetail), posterPath: currentDetail.poster_path || null, updatedAt: FB.serverTimestamp() },
    { merge: true }
  ).then(() => toast('Aggiunto alla lista', true)).catch(() => toast('Errore salvataggio lista'));
}

// ─── EVENTS ───────────────────────────────────────────────────────────────────
function bindEvents() {
  $('logo').addEventListener('click', e => { e.preventDefault(); navigate('home'); });
  $$('.nav-link,.mobile-link,.slider-browse').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.page)));
  $('hamburger').addEventListener('click', () => $('mobile-menu').classList.toggle('open'));

  $('search-toggle').addEventListener('click', () => {
    $('search-box').classList.add('active');
    $('search-toggle').classList.add('hidden');
    $('search-input').focus();
  });
  $('search-close').addEventListener('click', closeSearch);
  $('search-input').addEventListener('input', debounce(e => runSearch(e.target.value), 260));
  document.addEventListener('click', e => {
    if (!$('search-shell').contains(e.target)) $('search-results').classList.remove('open');
  });

  document.addEventListener('click', async e => {
    const card = e.target.closest('.card,.search-item');
    if (card && card.dataset.id) { await openDetail(Number(card.dataset.id), card.dataset.type); return; }

    const epPlay = e.target.closest('[data-episode-play]');
    if (epPlay) { e.stopPropagation(); selectEpisode(Number(epPlay.dataset.episodePlay), false); await playSelected(); return; }

    const epCard = e.target.closest('.episode-card');
    if (epCard) { selectEpisode(Number(epCard.dataset.episode)); return; }

    const cont = e.target.closest('.continue-card');
    if (cont) {
      // Tasto rimuovi (×) se cliccato
      if (e.target.dataset.removeProgress) {
        await removeProgressItem(e.target.dataset.removeProgress);
        return;
      }
      await resumeProgress(cont);
    }
  });

  $$('.slider-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = btn.parentElement.querySelector('.slider-track');
      const dir = btn.classList.contains('left') ? -1 : 1;
      track.scrollBy({ left: dir * track.clientWidth * 0.82, behavior: 'smooth' });
    });
  });

  $('hero-info').addEventListener('click', () => currentHero && openDetail(currentHero.id, getType(currentHero)));
  $('hero-play').addEventListener('click', async () => {
    if (!currentHero) return;
    await openDetail(currentHero.id, getType(currentHero), true);
    await playSelected();
  });
  $('detail-back').addEventListener('click', () => {
    if (lastPage === 'browse') setActivePage('browse');
    else navigate('home');
  });
  $('detail-play').addEventListener('click', () => playSelected());
  $('detail-list').addEventListener('click', addToMyList);

  $('filter-type').addEventListener('change', async e => { browse.type = normalizeType(e.target.value); browse.page = 1; await openBrowse(browse.type); });
  $('filter-sort').addEventListener('change', async e => { browse.sort = e.target.value; browse.page = 1; await loadBrowse(false); });
  $('browse-refresh').addEventListener('click', () => { browse.page = 1; loadBrowse(false); });
  $('load-more').addEventListener('click', () => loadBrowse(true));

  $('login-open').addEventListener('click', () => openAuth('login'));
  $('register-open').addEventListener('click', () => openAuth('register'));
  $('logout-btn').addEventListener('click', async () => {
    if (FB) await FB.signOut(FB.auth);
    CURRENT_USER = null;
    updateAuthUI();
    renderContinueWatching([]);
    toast('Sei uscito');
  });
  $('auth-close').addEventListener('click', closeAuth);
  $('auth-overlay').addEventListener('click', e => { if (e.target === $('auth-overlay')) closeAuth(); });
  $('tab-login').addEventListener('click', () => setAuthMode('login'));
  $('tab-register').addEventListener('click', () => setAuthMode('register'));
  $('auth-form').addEventListener('submit', handleAuthSubmit);
  $('clear-progress').addEventListener('click', clearProgress);

  $('player-close').addEventListener('click', closePlayer);
  // Barra progresso e controlli rimangono ma senza playerVideo: gestiti solo da vixsrc interno
  $('p-play').addEventListener('click', () => toast('Usa i controlli del player video'));
  $('p-back10').addEventListener('click', () => toast('Usa i controlli del player video'));
  $('p-forward10').addEventListener('click', () => toast('Usa i controlli del player video'));
  $('p-volume').addEventListener('click', () => toast('Usa i controlli del player video'));
  $('p-fullscreen').addEventListener('click', tryFullScreen);

  document.addEventListener('keydown', e => {
    if (!$('player-screen').classList.contains('hidden')) {
      if (e.key === 'Escape') closePlayer();
      if (e.key === 'f' || e.key === 'F') tryFullScreen();
    } else if (e.key === 'Escape') {
      closeSearch();
      closeAuth();
    }
  });

  $('season-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.season-tab');
    if (btn && currentDetail) loadSeason(currentDetail.id, Number(btn.dataset.season));
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Prima di tutto avvia Firebase
  try {
    FB = await FIREBASE_LOADED;
    // Ascolta cambio stato autenticazione
    FB.onAuthStateChanged(FB.auth, async user => {
      CURRENT_USER = user;
      updateAuthUI();
      if (user) {
        try {
          await FB.setDoc(
            FB.doc(FB.db, 'users', user.uid),
            { email: user.email || '', displayName: user.displayName || '', lastLoginAt: FB.serverTimestamp() },
            { merge: true }
          );
        } catch (e) { console.warn('Update profilo fallito', e); }
        await loadProgress();
      } else {
        renderContinueWatching([]);
      }
    });
  } catch (e) {
    console.warn('Firebase non caricato, uso modalità offline', e);
    FB = null;
  }

  showSetupIfNeeded();
  updateAuthUI();
  bindEvents();
  await loadGenres();
  await initHome();
}

document.addEventListener('DOMContentLoaded', init);
