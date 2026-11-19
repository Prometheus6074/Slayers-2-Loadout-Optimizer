/*
  Waypoint - trip planner
  APIs: Geoapify (places), OpenWeatherMap (forecast), OpenRouteService (routes),
        ExchangeRate-API (currency), Firebase (auth + storage)
*/
(() => {
  'use strict';

  const CFG = window.WAYPOINT_CONFIG || {};
  const $ = (sel, root = document) => root.querySelector(sel);

  /* ---------- Constants ---------- */
  const MODES = { 'driving-car': 'Driving', 'cycling-regular': 'Cycling', 'foot-walking': 'Walking' };
  const MODE_PHRASE = { 'driving-car': 'by car', 'cycling-regular': 'by bike', 'foot-walking': 'on foot' };

  const CATEGORIES = [
    { id: 'tourism.sights', label: 'Sights' },
    { id: 'entertainment.museum', label: 'Museums' },
    { id: 'catering.restaurant', label: 'Restaurants' },
    { id: 'catering.cafe', label: 'Cafes' },
    { id: 'natural,leisure.park', label: 'Nature and parks' },
    { id: 'accommodation.hotel', label: 'Hotels' },
  ];
  const HOTEL_CAT = 'accommodation.hotel';

  const PLAN_CATEGORIES = CATEGORIES.filter(c => c.id !== HOTEL_CAT);
  const PLAN_DEFAULT = ['tourism.sights', 'entertainment.museum', 'catering.restaurant'];
  const PLAN_RADIUS = { 'foot-walking': 2000, 'cycling-regular': 4000, 'driving-car': 8000 };

  const VISIT_OPTIONS = [0, 15, 30, 45, 60, 90, 120, 180, 240];

  const OUTDOOR_PREFIXES = ['natural', 'leisure', 'beach', 'national_park', 'camping', 'sport'];
  const WET_CONDITIONS = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow'];

  const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'SGD', 'KRW',
    'INR', 'THB', 'PHP', 'MYR', 'IDR', 'VND', 'AED', 'NZD', 'MXN', 'BRL', 'ZAR', 'TRY'];

  const COUNTRY_CURRENCY = {
    US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
    GB: 'GBP', CH: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
    RO: 'RON', TR: 'TRY', RU: 'RUB', UA: 'UAH', IS: 'ISK',
    JP: 'JPY', CN: 'CNY', HK: 'HKD', TW: 'TWD', KR: 'KRW', SG: 'SGD', MY: 'MYR', TH: 'THB',
    VN: 'VND', ID: 'IDR', PH: 'PHP', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', KH: 'KHR',
    AE: 'AED', SA: 'SAR', QA: 'QAR', IL: 'ILS', EG: 'EGP', MA: 'MAD', ZA: 'ZAR', KE: 'KES', NG: 'NGN',
    AU: 'AUD', NZ: 'NZD',
  };
  ['AT', 'BE', 'BG', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT',
    'SK', 'SI', 'ES', 'HR'].forEach(c => { COUNTRY_CURRENCY[c] = 'EUR'; });

  /* ---------- State ---------- */
  const state = {
    uid: null,
    guest: false,
    email: '',
    verified: false,
    trips: [],
    favorites: [],
    trip: null,
    day: 1,
    panel: 'itinerary',

    forecast: null,
    forecastError: null,

    ratesCache: {},
    rates: null,
    ratesError: null,

    places: [],
    placesStatus: 'idle',
    placesError: null,
    placesCenter: '',
    category: CATEGORIES[0].id,
    query: '',
    radius: 3000,
    hideUsed: true,

    legs: {},
    routeLine: {},
    routeError: {},

    reach: null,
    reachPin: null,
    reachBusy: false,
    reachPick: false,

    planBusy: false,
    noteOpen: new Set(),
    menu: null,
  };

  let db = null;
  let auth = null;
  let map = null;
  const layers = {};
  let pendingDest = null;
  let saveTimer = null;
  let savePending = false;
  let searchTimer = null;
  let authMode = 'login';
  let authChecked = false;
  let placesSeq = 0;
  let dragId = null;
  let nmap = null;
  let nmarker = null;
  const nt = { month: null, touchedName: false, previewKey: '', step: 0, ok: [false, false] };
  let reachSig = '';
  const routeTimers = {};
  const stopMarkers = {};
  const routeSeq = {};

  /* ---------- Helpers ---------- */
  // Helper: escape HTML
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Helper: random id
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Helper: add leading zero
  const pad = n => String(n).padStart(2, '0');
  // Helper: date to YYYY-MM-DD
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Itinerary: date of a trip day
  function dateFor(day) {
    const d = new Date(state.trip.startDate + 'T12:00:00');
    d.setDate(d.getDate() + day - 1);
    return d;
  }
  // Helper: format date
  const fmtDate = (d, opts) => d.toLocaleDateString(undefined, opts);

  // Helper: format distance
  function fmtDist(m) {
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
  }
  // Helper: format duration
  function fmtDur(s) {
    const mins = Math.round(s / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  // Budget: format currency
  function money(v, code) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(v);
    } catch {
      return `${v.toFixed(2)} ${code}`;
    }
  }

  // Helper: distance between two points (haversine)
  function distanceM(aLat, aLon, bLat, bLon) {
    const rad = x => x * Math.PI / 180;
    const dLat = rad(bLat - aLat);
    const dLon = rad(bLon - aLon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }

  // Helper: fetch JSON from an API
  async function getJSON(url, opts) {
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = (data && (data.message || (data.error && (data.error.message || data.error)) || data['error-type']))
        || res.statusText || 'Request failed';
      throw new Error(`${res.status}: ${msg}`);
    }
    return data;
  }

  // UI: pop-up message
  function toast(msg, undo) {
    const el = document.createElement('div');
    el.className = 'toast';
    const text = document.createElement('span');
    text.textContent = msg;
    el.appendChild(text);
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-undo';
      b.textContent = 'Undo';
      b.addEventListener('click', () => { el.remove(); undo(); });
      el.appendChild(b);
    }
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), undo ? 8000 : 5500);
  }

  // Itinerary: stops of a day
  const dayStops = (day = state.day) => (state.trip ? state.trip.stops.filter(s => s.day === day) : []);
  // Itinerary: find stop by id
  const stopById = id => (state.trip ? state.trip.stops.find(s => s.id === id) : null);

  // Itinerary: save new stop order
  function setDayOrder(day, ordered) {
    const idxs = [];
    state.trip.stops.forEach((s, i) => { if (s.day === day) idxs.push(i); });
    idxs.forEach((idx, k) => { state.trip.stops[idx] = ordered[k]; });
  }

  // Routing: points of a day's route
  function routePoints(day = state.day) {
    const stops = dayStops(day);
    if (!stops.length) return [];
    const h = state.trip.hotel;
    return h ? [h, ...stops, h] : stops;
  }

  const EXP_CATS = [['food', 'Food'], ['transport', 'Transport'], ['tickets', 'Tickets'], ['stay', 'Stay'], ['other', 'Other']];
  // Budget: expense category lookup
  const catOf = id => EXP_CATS.find(c => c[0] === id) || EXP_CATS[4];

  // Schedule: time to minutes
  const toMin = s => { const [h, m] = String(s || '09:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  // Schedule: minutes to time
  const fmtClock = m => { const d = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(d / 60))}:${pad(d % 60)}`; };

  // Schedule: arrive/leave times
  function schedule(day) {
    const stops = dayStops(day);
    const legs = state.legs[day] || [];
    const hotel = state.trip.hotel;
    const need = hotel ? stops.length : Math.max(0, stops.length - 1);
    let now = toMin(state.trip.dayStart);
    const out = stops.map((s, i) => {
      const leg = legs[hotel ? i : i - 1];
      if (leg) now += leg.duration / 60;
      const arrive = now;
      now += s.minutes || 0;
      return { arrive, leave: now };
    });
    const last = hotel ? legs[stops.length] : null;
    return { ok: legs.length >= need, out, back: last ? now + last.duration / 60 : null };
  }

  /* ---------- Config ---------- */
  // Setup: check API key
  const isPlaceholder = v => !v || /^YOUR_/.test(v);
  // Setup: check Firebase keys
  const firebaseReady = () => !!(CFG.firebase && !isPlaceholder(CFG.firebase.apiKey) && !isPlaceholder(CFG.firebase.projectId));

  // Setup: list missing keys
  function missingKeys() {
    const names = { geoapify: 'Geoapify', openweather: 'OpenWeatherMap', ors: 'OpenRouteService', exchange: 'ExchangeRate-API' };
    const out = Object.keys(names).filter(k => isPlaceholder(CFG[k])).map(k => names[k]);
    if (!firebaseReady()) out.push('Firebase');
    return out;
  }

  // Setup: warning banner
  function showBanner(message) {
    const el = $('#banner');
    const missing = missingKeys();
    if (message) {
      el.innerHTML = message;
      el.hidden = false;
    } else if (missing.length) {
      el.innerHTML = `<strong>Setup needed.</strong> Add keys for ${esc(missing.join(', '))} in <code>config.js</code>.`;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  /* ---------- Firebase ---------- */
  const GUEST_KEY = 'waypoint.guest.trips';
  const GUEST_FAV_KEY = 'waypoint.guest.favs';
  const IMPORTED_KEY = 'waypoint.imported';
  const MODE_KEY = 'waypoint.mode';

  // Guest mode: read saved mode
  const readMode = () => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } };
  // Guest mode: load trips
  const guestRead = () => { try { return JSON.parse(localStorage.getItem(GUEST_KEY)) || []; } catch { return []; } };
  // Guest mode: save trips
  const guestWrite = list => localStorage.setItem(GUEST_KEY, JSON.stringify(list));
  // Guest mode: load favorites
  const guestFavRead = () => { try { return JSON.parse(localStorage.getItem(GUEST_FAV_KEY)) || []; } catch { return []; } };
  // Guest mode: save favorites
  const guestFavWrite = list => localStorage.setItem(GUEST_FAV_KEY, JSON.stringify(list));
  // Guest import: read imported list
  const importedRead = () => { try { return JSON.parse(localStorage.getItem(IMPORTED_KEY)) || {}; } catch { return {}; } };
  // Guest import: save imported list
  const importedWrite = o => { try { localStorage.setItem(IMPORTED_KEY, JSON.stringify(o)); } catch {} };

  // Storage: trips (guest or Firestore)
  const store = {
    async list() {
      if (state.guest) return guestRead();
      const snap = await db.collection('trips').where('uid', '==', state.uid).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async add(trip) {
      if (state.guest) {
        const id = 'g' + uid();
        guestWrite([{ ...trip, id }, ...guestRead()]);
        return id;
      }
      const ref = await db.collection('trips').add(trip);
      return ref.id;
    },
    async set(id, data) {
      if (state.guest) {
        const list = guestRead();
        const i = list.findIndex(x => x.id === id);
        const row = { ...data, id };
        if (i >= 0) list[i] = row; else list.unshift(row);
        guestWrite(list);
        return;
      }
      await db.collection('trips').doc(id).set(data);
    },
    async remove(id) {
      if (state.guest) { guestWrite(guestRead().filter(x => x.id !== id)); return; }
      await db.collection('trips').doc(id).delete();
    },
  };

  // Storage: favorites (guest or Firestore)
  const favStore = {
    async load() {
      if (state.guest) return guestFavRead();
      const snap = await db.collection('users').doc(state.uid).get();
      return snap.exists ? (snap.data().favorites || []) : [];
    },
    async save(list) {
      if (state.guest) { guestFavWrite(list); return; }
      await db.collection('users').doc(state.uid).set({ favorites: list }, { merge: true });
    },
  };

  // Login: start Firebase
  function initFirebase() {
    firebase.initializeApp(CFG.firebase);
    db = firebase.firestore();
    auth = firebase.auth();
    auth.onAuthStateChanged(handleAuthChange);
  }

  // Trips list: sort by newest
  const sortTrips = () => state.trips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  // Trips list: load trips
  async function loadTrips() {
    state.trips = await store.list();
    sortTrips();
  }

  /* ---------- Login ---------- */
  // Login: auth state changed
  async function handleAuthChange(user) {
    const initial = !authChecked;
    authChecked = true;
    // Clear legacy anonymous sessions
    if (user && user.isAnonymous) { try { await auth.signOut(); } catch {} return; }
    if (user) {
      try { localStorage.removeItem(MODE_KEY); } catch {}
      await startSession({ uid: user.uid, email: user.email || '', guest: false, verified: user.emailVerified });
    } else if (initial && readMode() === 'guest') {
      await startSession({ uid: 'guest', email: '', guest: true });
    } else if (!state.guest) {
      showAuth();
    }
  }

  // Login: resume guest or show login
  function resumeOrShowAuth() {
    if (readMode() === 'guest') startSession({ uid: 'guest', email: '', guest: true });
    else showAuth();
  }

  // Login: start session
  async function startSession({ uid: id, email, guest, verified = false }) {
    resetWorkspace();
    state.uid = id;
    state.guest = guest;
    state.email = email;
    state.verified = verified;
    state.favorites = [];
    $('#authForm').reset();
    clearEmailState();
    showAuthMsg('');
    $('#auth').hidden = true;
    $('.app').hidden = false;
    renderAccount();
    try {
      await loadTrips();
    } catch (e) {
      state.trips = [];
      toast(firestoreMessage(e));
    }
    try {
      state.favorites = await favStore.load();
    } catch (e) {
      state.favorites = [];
      toast(firestoreMessage(e));
    }
    renderSidebar();
    if (map) map.invalidateSize();
    if (!guest) offerImport();
  }

  // Logout: clear workspace
  function resetWorkspace() {
    clearTimeout(saveTimer);
    clearTimeout(searchTimer);
    savePending = false;
    Object.keys(routeTimers).forEach(k => clearTimeout(routeTimers[k]));
    Object.keys(routeSeq).forEach(k => { routeSeq[k] += 1; });
    placesSeq += 1;
    state.trip = null;
    state.trips = [];
    state.day = 1;
    state.panel = 'itinerary';
    state.forecast = null;
    state.forecastError = null;
    state.places = [];
    state.placesStatus = 'idle';
    state.query = '';
    state.legs = {};
    state.routeLine = {};
    state.routeError = {};
    state.reach = null;
    state.reachPin = null;
    state.reachPick = false;
    reachSig = '';
    $('#workspace').hidden = true;
    $('#newPage').hidden = true;
    $('#empty').hidden = false;
    if (map) Object.values(layers).forEach(l => l.clearLayers());
    setSaveState('');
  }

  // Login: show login screen
  function showAuth() {
    if (!$('#auth').hidden) return;
    $('.app').hidden = true;
    $('#auth').hidden = false;
    $('#authForm').reset();
    clearEmailState();
    setAuthMode('login');
  }

  // Account: show user info
  function renderAccount() {
    $('#accountId').textContent = state.guest
      ? 'Guest, this device only'
      : state.email + (state.verified ? '' : ' (not verified)');
    $('#logoutBtn').innerHTML = state.guest ? ic('login') + ' Log in or sign up' : ic('logout') + ' Log out';
    $('#accountBtn').hidden = state.guest;
  }

  // Login: switch login / sign up
  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === 'signup';
    document.querySelectorAll('#authSeg button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.auth === mode)));
    $('#authTitle').textContent = signup ? 'Create your account' : 'Welcome back';
    $('.auth-lead').textContent = signup
      ? 'Take your plans with you on any device.'
      : 'Log in to pick up where you left off.';
    $('#authSubmit').textContent = signup ? 'Create account' : 'Log in';
    $('#confirmField').hidden = !signup;
    $('#authConfirm').required = signup;
    $('#authPass').minLength = signup ? 6 : 0;
    $('#authPass').autocomplete = signup ? 'new-password' : 'current-password';
    $('#forgotBtn').hidden = signup;
    showAuthMsg('');
  }

  // Login: show message
  function showAuthMsg(text, kind = 'error') {
    const el = $('#authMsg');
    el.textContent = text || '';
    el.dataset.kind = kind;
    el.hidden = !text;
  }

  // Login: error messages
  function authMessage(e) {
    switch (e && e.code) {
      case 'auth/invalid-email': return 'Not a valid email';
      case 'auth/missing-password': return 'Enter your password.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials': return 'Incorrect email or password.';
      case 'auth/email-already-in-use': return 'Email already in use.';
      case 'auth/weak-password': return 'Password needs 6+ characters.';
      case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
      case 'auth/network-request-failed': return 'Network error. Try again.';
      case 'auth/user-disabled': return 'Account disabled.';
      case 'auth/requires-recent-login': return 'Log in again to continue.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is off in Firebase. Enable it under Authentication, Sign-in method.';
      default: return (e && e.message) || 'Something went wrong. Try again.';
    }
  }

  // Login: disable buttons while busy
  function setAuthBusy(busy) {
    $('#authSubmit').disabled = busy;
    $('#guestBtn').disabled = busy;
  }

  const EMAIL_RE = /^[^\s@,;]+@(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}$/u;

  // Login: email check mark
  function setEmailState(kind, label) {
    const input = $('#authEmail');
    const field = input.closest('.field');
    if (kind) field.dataset.state = kind; else delete field.dataset.state;
    $('#authEmailLabel').textContent = label || 'Email';
    $('#authEmailMark').innerHTML = kind === 'bad' ? ic('close') : kind === 'ok' ? ic('check') : '';
    if (kind === 'bad') input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  // Login: clear email check mark
  const clearEmailState = () => setEmailState(null);

  // Login: validate email
  function checkEmail(force = false) {
    const v = $('#authEmail').value.trim();
    if (!v) {
      if (force) setEmailState('bad', 'Enter your email'); else clearEmailState();
      return false;
    }
    if (EMAIL_RE.test(v)) { setEmailState('ok'); return true; }
    setEmailState('bad', 'Not a valid email');
    return false;
  }

  // Sign up / Login
  async function submitAuth(e) {
    e.preventDefault();
    if (!auth) {
      showAuthMsg('Login unavailable. Check Firebase in config.js, or continue as guest.');
      return;
    }
    if (!checkEmail(true)) { $('#authEmail').focus(); return; }
    const email = $('#authEmail').value.trim();
    const pass = $('#authPass').value;
    if (authMode === 'signup' && pass !== $('#authConfirm').value) {
      showAuthMsg('Passwords do not match.');
      return;
    }
    showAuthMsg('');
    setAuthBusy(true);
    try {
      if (authMode === 'signup') {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        try {
          await cred.user.sendEmailVerification();
          toast('Verification email sent.');
        } catch {
          toast('Verification email not sent. Resend it from Account.');
        }
      } else {
        await auth.signInWithEmailAndPassword(email, pass);
      }
    } catch (err) {
      showAuthMsg(authMessage(err));
    } finally {
      setAuthBusy(false);
    }
  }

  // Login: forgot password
  async function resetPassword() {
    if (!auth) { showAuthMsg('Login unavailable. Check Firebase in config.js.'); return; }
    const email = $('#authEmail').value.trim();
    if (!email) { showAuthMsg('Enter your email first.'); return; }
    if (!checkEmail(true)) { $('#authEmail').focus(); return; }
    try {
      await auth.sendPasswordResetEmail(email);
      showAuthMsg('If that account exists, a reset link is on its way.', 'ok');
    } catch (err) {
      showAuthMsg(authMessage(err));
    }
  }

  // Guest mode: start
  async function continueAsGuest() {
    try {
      localStorage.setItem(MODE_KEY, 'guest');
    } catch {
      showAuthMsg('Guest mode needs browser storage, which is blocked.');
      return;
    }
    await startSession({ uid: 'guest', email: '', guest: true });
  }

  // Logout
  async function leaveSession() {
    clearTimeout(saveTimer);
    if (savePending) await saveTrip();
    const wasGuest = state.guest;
    try { localStorage.removeItem(MODE_KEY); } catch {}
    resetWorkspace();
    state.uid = null;
    state.guest = false;
    state.email = '';
    state.verified = false;
    state.favorites = [];
    showAuth();
    if (!wasGuest && auth) { try { await auth.signOut(); } catch {} }
  }

  /* ---------- Guest import ---------- */
  // Guest import: trips to copy
  function pendingGuestTrips() {
    const done = importedRead()[state.uid] || [];
    return guestRead().filter(t => !done.includes(t.id));
  }
  // Guest import: favorites to copy
  const pendingGuestFavs = () => guestFavRead().filter(f => !state.favorites.some(x => x.id === f.id));

  // Guest import: ask user
  function offerImport() {
    if (state.guest) return;
    const key = 'waypoint.importAsked.' + state.uid;
    try { if (sessionStorage.getItem(key)) return; } catch {}
    const trips = pendingGuestTrips().length;
    const favs = pendingGuestFavs().length;
    if (!trips && !favs) return;
    try { sessionStorage.setItem(key, '1'); } catch {}

    const parts = [];
    if (trips) parts.push(`${trips} ${trips === 1 ? 'trip' : 'trips'}`);
    if (favs) parts.push(`${favs} saved ${favs === 1 ? 'place' : 'places'}`);
    $('#importText').textContent =
      `${parts.join(' and ')} from guest mode. Copy them to your account?`;
    $('#importDialog').showModal();
  }

  // Guest import: copy data to account
  async function importGuestData() {
    const btn = $('#importGo');
    btn.disabled = true;
    let copied = 0;
    try {
      const done = importedRead();
      const list = done[state.uid] = done[state.uid] || [];
      for (const t of pendingGuestTrips()) {
        const { id, ...data } = t;
        const row = JSON.parse(JSON.stringify({ ...data, uid: state.uid }));
        const newId = await store.add(row);
        state.trips.unshift({ ...row, id: newId });
        list.push(id);
        importedWrite(done);
        copied += 1;
      }
      const extra = pendingGuestFavs();
      if (extra.length) {
        state.favorites = [...state.favorites, ...extra];
        await favStore.save(state.favorites);
      }
      $('#importDialog').close();
      sortTrips();
      renderSidebar();
      if (state.trip) renderPanel();
      toast(copied || extra.length ? 'Copied to your account.' : 'Nothing new to copy.');
    } catch (e) {
      toast(firestoreMessage(e));
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Account ---------- */
  // Account: show message
  function acctMsg(text, kind = 'error') {
    const el = $('#acctMsg');
    el.textContent = text || '';
    el.dataset.kind = kind;
    el.hidden = !text;
  }

  // Account: disable buttons while busy
  function setAcctBusy(busy) {
    document.querySelectorAll('#accountDialog button').forEach(b => { b.disabled = busy; });
  }

  // Account: email verified status
  function renderVerify() {
    const u = auth && auth.currentUser;
    if (!u) return;
    state.verified = u.emailVerified;
    $('#acctEmail').textContent = u.email;
    $('#verifyState').textContent = u.emailVerified ? 'Email verified' : 'Email not verified yet';
    $('#resendVerify').hidden = u.emailVerified;
    $('#refreshVerify').hidden = u.emailVerified;
    renderAccount();
  }

  // Account: open dialog
  function openAccount() {
    if (!auth || !auth.currentUser) { toast('Log in to an account first.'); return; }
    $('#pwForm').reset();
    $('#delForm').reset();
    acctMsg('');
    renderVerify();
    $('#accountDialog').showModal();
  }

  // Account: resend verification email
  async function resendVerification() {
    try {
      await auth.currentUser.sendEmailVerification();
      acctMsg('Verification email sent.', 'ok');
    } catch (err) {
      acctMsg(authMessage(err));
    }
  }

  // Account: re-check verification
  async function refreshVerification() {
    try {
      await auth.currentUser.reload();
      renderVerify();
      acctMsg(auth.currentUser.emailVerified ? 'Email verified.' : 'Not verified yet.', 'ok');
    } catch (err) {
      acctMsg(authMessage(err));
    }
  }

  // Account: re-check password
  async function reauth(pass) {
    const u = auth.currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(u.email, pass);
    await u.reauthenticateWithCredential(cred);
  }

  // Account: change password
  async function changePassword(e) {
    e.preventDefault();
    const cur = $('#pwCurrent').value;
    const next = $('#pwNew').value;
    if (next !== $('#pwConfirm').value) { acctMsg('Passwords do not match.'); return; }
    if (next === cur) { acctMsg('Use a new password.'); return; }
    acctMsg('');
    setAcctBusy(true);
    try {
      await reauth(cur);
      await auth.currentUser.updatePassword(next);
      $('#pwForm').reset();
      acctMsg('Password changed.', 'ok');
    } catch (err) {
      acctMsg(authMessage(err));
    } finally {
      setAcctBusy(false);
    }
  }

  // Account: delete all data
  async function deleteAllUserData() {
    const snap = await db.collection('trips').where('uid', '==', state.uid).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('users').doc(state.uid));
    await batch.commit();
  }

  // Account: delete account
  async function deleteAccount(e) {
    e.preventDefault();
    const pass = $('#delPass').value;
    if (!confirm('Delete your account and all your data? This cannot be undone.')) return;
    acctMsg('');
    setAcctBusy(true);
    try {
      await reauth(pass);
      await deleteAllUserData();
      await auth.currentUser.delete();
      $('#accountDialog').close();
      resetWorkspace();
      state.uid = null;
      state.email = '';
      state.verified = false;
      state.favorites = [];
      showAuth();
      toast('Account deleted.');
    } catch (err) {
      acctMsg(err && err.code ? authMessage(err) : firestoreMessage(err));
    } finally {
      setAcctBusy(false);
    }
  }

  /* ---------- Saving ---------- */
  // Saving: status text
  function setSaveState(text) { $('#saveState').textContent = text; }

  // Saving: debounced save
  function queueSave() {
    savePending = true;
    setSaveState('Saving...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveTrip, 600);
  }

  // Saving: write trip
  async function saveTrip() {
    savePending = false;
    const t = state.trip;
    if (!t || !t.id) return;
    t.updatedAt = Date.now();
    const { id, ...data } = t;
    try {
      await store.set(id, JSON.parse(JSON.stringify(data)));
      const copy = JSON.parse(JSON.stringify(t));
      const i = state.trips.findIndex(x => x.id === id);
      if (i >= 0) state.trips[i] = copy; else state.trips.unshift(copy);
      setSaveState('All changes saved');
    } catch (e) {
      setSaveState('Not saved');
      toast(firestoreMessage(e));
    }
  }

  // Saving: error message
  function firestoreMessage(e) {
    if (e && e.code === 'permission-denied') {
      return 'Firestore blocked the request. Check your security rules.';
    }
    return 'Could not save: ' + (e && e.message ? e.message : 'unknown error');
  }

  /* ---------- Place search ---------- */
  // New trip: destination autocomplete
  function setupAutocomplete(input, list, onPick) {
    let timer = null;
    let seq = 0;

    input.addEventListener('input', () => {
      pendingDest = null;
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { list.hidden = true; return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const data = await getJSON(
            `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&limit=5&apiKey=${CFG.geoapify}`);
          if (mine !== seq) return;
          const items = (data.features || []).map(f => {
            const p = f.properties;
            return {
              name: p.city || p.name || (p.formatted || '').split(',')[0],
              label: p.formatted,
              lat: p.lat,
              lon: p.lon,
              country: (p.country_code || '').toUpperCase(),
            };
          });
          list.innerHTML = items.map((it, i) =>
            `<li><button type="button" data-i="${i}">${ic('pin')}<span>${esc(it.label)}</span></button></li>`).join('');
          list.hidden = !items.length;
          list._items = items;
        } catch (e) {
          list.hidden = true;
          toast('Place search failed. ' + e.message);
        }
      }, 300);
    });

    list.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      pendingDest = list._items[+b.dataset.i];
      input.value = pendingDest.label;
      list.hidden = true;
      if (onPick) onPick();
    });
  }

  /* ---------- Weather ---------- */
  // Weather: load forecast
  async function loadForecast() {
    const t = state.trip;
    state.forecast = null;
    state.forecastError = null;
    renderWeather();
    try {
      const d = await getJSON(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${t.destination.lat}&lon=${t.destination.lon}&units=metric&appid=${CFG.openweather}`);
      const byDate = {};
      d.list.forEach(it => {
        const date = new Date((it.dt + d.city.timezone) * 1000).toISOString().slice(0, 10);
        const o = byDate[date] || (byDate[date] = { min: Infinity, max: -Infinity, pop: 0, wind: 0, counts: {}, icons: {}, desc: {} });
        o.min = Math.min(o.min, it.main.temp_min);
        o.max = Math.max(o.max, it.main.temp_max);
        o.pop = Math.max(o.pop, it.pop || 0);
        o.wind = Math.max(o.wind, it.wind ? it.wind.speed : 0);
        const w = it.weather[0];
        o.counts[w.main] = (o.counts[w.main] || 0) + 1;
        o.icons[w.main] = w.icon.replace('n', 'd');
        o.desc[w.main] = w.description;
      });
      Object.values(byDate).forEach(o => {
        o.main = Object.keys(o.counts).sort((a, b) => o.counts[b] - o.counts[a])[0];
        o.icon = o.icons[o.main];
        o.description = o.desc[o.main];
      });
      state.forecast = byDate;
    } catch (e) {
      state.forecastError = e.message + (/401/.test(e.message) ? ' New keys can take a couple of hours to activate.' : '');
    }
    renderDays();
    renderWeather();
    renderPanel();
  }

  // Weather: forecast for a day
  const weatherFor = day => (state.forecast ? state.forecast[toISO(dateFor(day))] : null);
  // Weather: is rain likely
  const isWet = w => !!w && (w.pop >= 0.5 || WET_CONDITIONS.includes(w.main));

  /* ---------- Exchange rates ---------- */
  // Budget: load exchange rates
  async function loadRates() {
    const base = state.trip.homeCurrency;
    state.ratesError = null;
    if (state.ratesCache[base]) { state.rates = state.ratesCache[base]; return; }
    try {
      const d = await getJSON(`https://v6.exchangerate-api.com/v6/${CFG.exchange}/latest/${base}`);
      if (d.result !== 'success') throw new Error(d['error-type'] || 'Request failed');
      state.rates = { base, rates: d.conversion_rates, updated: d.time_last_update_utc };
      state.ratesCache[base] = state.rates;
    } catch (e) {
      state.rates = null;
      state.ratesError = e.message;
    }
  }

  /* ---------- Nearby places ---------- */
  // Find places: search center
  function discoverCenter() {
    const d = state.trip.destination;
    if (state.category === HOTEL_CAT) return { lat: d.lat, lon: d.lon, label: d.name };
    const s = dayStops();
    if (s.length) { const l = s[s.length - 1]; return { lat: l.lat, lon: l.lon, label: l.name }; }
    return { lat: d.lat, lon: d.lon, label: d.name };
  }

  // Find places: format a result
  function normalizePlace(f) {
    const p = f.properties;
    const cats = p.categories || [];
    return {
      id: p.place_id,
      name: p.name,
      address: p.address_line2 || p.formatted || '',
      lat: p.lat,
      lon: p.lon,
      distance: p.distance,
      outdoor: cats.some(c => OUTDOOR_PREFIXES.some(pre => c === pre || c.startsWith(pre + '.'))),
      hotel: cats.some(c => c === 'accommodation' || c.startsWith('accommodation.')),
    };
  }

  // Find places: search
  async function discover() {
    const c = discoverCenter();
    const mine = ++placesSeq;
    state.placesStatus = 'loading';
    state.placesError = null;
    renderPanel();
    try {
      const cats = state.category === 'all' ? CATEGORIES.map(x => x.id).join(',') : state.category;
      const q = state.query.trim();
      const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(cats)}`
        + (q.length >= 2 ? `&name=${encodeURIComponent(q)}` : '')
        + `&filter=circle:${c.lon},${c.lat},${state.radius}&bias=proximity:${c.lon},${c.lat}&limit=20&apiKey=${CFG.geoapify}`;
      const data = await getJSON(url);
      if (mine !== placesSeq) return;
      const seen = new Set();
      state.places = (data.features || []).map(normalizePlace)
        .filter(p => p.name && !seen.has(p.id) && seen.add(p.id)
          && !(state.hideUsed && state.category !== HOTEL_CAT && state.trip.stops.some(x => x.placeId === p.id && x.day !== state.day)));
      state.placesCenter = c.label;
      state.placesStatus = 'done';
    } catch (e) {
      if (mine !== placesSeq) return;
      state.placesStatus = 'error';
      state.placesError = e.message;
    }
    renderPanel();
    renderMap();
  }

  /* ---------- Routing ---------- */
  // Find places: name search
  function runSearch() {
    if (state.panel !== 'discover') return;
    const q = state.query.trim();
    if (q.length === 1) return;
    if (q && state.category !== 'all') state.category = 'all';
    discover();
  }

  // Routing: API headers
  const orsHeaders = () => ({
    Authorization: CFG.ors,
    'Content-Type': 'application/json',
    Accept: 'application/json, application/geo+json',
  });

  // Routing: request route (debounced)
  function requestRoute(day = state.day, delay = 350) {
    clearTimeout(routeTimers[day]);
    if (routePoints(day).length < 2) {
      routeSeq[day] = (routeSeq[day] || 0) + 1;
      delete state.trip.routes[day];
      state.legs[day] = [];
      state.routeLine[day] = null;
      delete state.routeError[day];
      renderPanel();
      renderMap();
      return;
    }
    routeTimers[day] = setTimeout(() => updateRoute(day), delay);
  }

  // Routing: route if missing
  function ensureRoute(day) {
    if (routePoints(day).length >= 2 && !state.routeLine[day] && !state.routeError[day]) requestRoute(day, 0);
  }

  // Routing: recalculate all routes
  function resetRoutes() {
    const t = state.trip;
    t.routes = {};
    state.routeLine = {};
    state.routeError = {};
    state.legs = {};
    queueSave();
    renderPanel();
    renderMap();
    for (let d = 1; d <= t.days; d++) requestRoute(d, (d - 1) * 300);
  }

  // Routing: get route from API
  async function updateRoute(day) {
    const t = state.trip;
    const pts = routePoints(day);
    if (pts.length < 2) return;
    const mine = (routeSeq[day] = (routeSeq[day] || 0) + 1);
    try {
      const d = await getJSON(`https://api.heigit.org/openrouteservice/v2/directions/${t.mode}/geojson`, {
        method: 'POST',
        headers: orsHeaders(),
        body: JSON.stringify({ coordinates: pts.map(s => [s.lon, s.lat]) }),
      });
      if (mine !== routeSeq[day]) return;
      const f = d.features[0];
      state.routeLine[day] = f.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      state.legs[day] = f.properties.segments.map(s => ({ distance: s.distance, duration: s.duration }));
      t.routes[day] = { distance: f.properties.summary.distance, duration: f.properties.summary.duration, mode: t.mode };
      delete state.routeError[day];
      queueSave();
    } catch (e) {
      if (mine !== routeSeq[day]) return;
      state.routeLine[day] = null;
      state.legs[day] = [];
      delete t.routes[day];
      state.routeError[day] = e.message;
    }
    renderPanel();
    renderMap();
  }

  // Optimize order: algorithm
  async function reorderByTravelTime(day) {
    const stops = dayStops(day);
    const hotel = state.trip.hotel;
    const pts = hotel ? [hotel, ...stops] : stops;
    if (pts.length < 3) return null;

    const d = await getJSON(`https://api.heigit.org/openrouteservice/v2/matrix/${state.trip.mode}`, {
      method: 'POST',
      headers: orsHeaders(),
      body: JSON.stringify({ locations: pts.map(s => [s.lon, s.lat]), metrics: ['duration'] }),
    });
    const M = d.durations;
    const n = pts.length;
    const cost = order => order.slice(1).reduce((sum, v, i) => sum + (M[order[i]][v] ?? 1e9), 0)
      + (hotel ? (M[order[order.length - 1]][0] ?? 1e9) : 0);

    // Nearest neighbour
    const order = [0];
    const left = new Set(Array.from({ length: n - 1 }, (_, i) => i + 1));
    while (left.size) {
      const last = order[order.length - 1];
      let best = null;
      let bestVal = Infinity;
      left.forEach(i => { const v = M[last][i] ?? 1e9; if (v < bestVal) { bestVal = v; best = i; } });
      order.push(best);
      left.delete(best);
    }
    // 2-opt
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      for (let i = 1; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          if (cost(cand) < cost(order) - 1) { order.splice(0, n, ...cand); improved = true; }
        }
      }
    }

    const base = hotel ? 1 : 0;
    return {
      before: cost(pts.map((_, i) => i)),
      after: cost(order),
      ordered: order.filter(i => i >= base).map(i => stops[i - base]),
    };
  }

  // Optimize order: button
  async function optimizeDay() {
    const day = state.day;
    const need = state.trip.hotel ? 2 : 3;
    if (dayStops(day).length < need) { toast(`Add ${need}+ stops to optimize.`); return; }
    try {
      const r = await reorderByTravelTime(day);
      if (!r) return;
      setDayOrder(day, r.ordered);
      touch();
      requestRoute(day, 0);
      toast(r.after < r.before - 30
        ? `Reordered: ${fmtDur(r.before)} to ${fmtDur(r.after)}.`
        : 'Already near the fastest order.');
    } catch (e) {
      toast('Could not optimize. ' + e.message);
    }
  }

  // Within reach
  // Within reach: starting point
  function reachOrigin() {
    const t = state.trip;
    const v = $('#reachFrom').value || '';
    if (v === 'hotel' && t.hotel) return { lat: t.hotel.lat, lon: t.hotel.lon, label: t.hotel.name };
    if (v === 'pin' && state.reachPin) return { ...state.reachPin, label: 'the spot you picked' };
    if (v.startsWith('stop:')) {
      const s = stopById(v.slice(5));
      if (s) return { lat: s.lat, lon: s.lon, label: s.name };
    }
    return { lat: t.destination.lat, lon: t.destination.lon, label: t.destination.name };
  }

  // Within reach: show area
  async function showReach() {
    if (!state.trip || state.reachBusy) return;
    const t = state.trip;
    const src = reachOrigin();
    const minutes = +$('#reachMin').value || 15;
    state.reachBusy = true;
    renderReachUI();
    try {
      const d = await getJSON(`https://api.heigit.org/openrouteservice/v2/isochrones/${t.mode}`, {
        method: 'POST',
        headers: orsHeaders(),
        body: JSON.stringify({
          locations: [[src.lon, src.lat]],
          range: [minutes * 60],
          interval: Math.round(minutes * 60 / 3),
          range_type: 'time',
        }),
      });
      state.reach = { geo: d, label: src.label, minutes, mode: t.mode, lat: src.lat, lon: src.lon };
      renderMap();
      try {
        const b = L.geoJSON(d).getBounds();
        if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
      } catch {}
    } catch (e) {
      toast('Could not draw the area. ' + e.message);
    }
    state.reachBusy = false;
    renderReachUI();
  }

  // Within reach: clear
  function clearReach() {
    state.reach = null;
    renderMap();
    renderReachUI();
  }

  // Within reach: pick point on map
  function pickReachPoint() {
    if (!map || !state.trip || state.reachPick) return;
    state.reachPick = true;
    map.getContainer().style.cursor = 'crosshair';
    toast('Click the map to pick a start.');
    map.once('click', e => {
      map.getContainer().style.cursor = '';
      if (!state.reachPick || !state.trip) return;
      state.reachPick = false;
      state.reachPin = { lat: e.latlng.lat, lon: e.latlng.lng };
      renderReachOptions('pin');
      showReach();
    });
  }

  // Within reach: dropdown
  function renderReachOptions(select) {
    if (!state.trip) return;
    const t = state.trip;
    const opts = [];
    if (t.hotel) opts.push(['hotel', `Hotel: ${t.hotel.name}`]);
    dayStops().forEach((s, i) => opts.push([`stop:${s.id}`, `Stop ${i + 1}: ${s.name}`]));
    opts.push(['center', `Centre of ${t.destination.name}`]);
    if (state.reachPin) opts.push(['pin', 'Spot picked on the map']);
    const sig = JSON.stringify(opts);
    if (sig === reachSig && !select) return;
    reachSig = sig;
    const el = $('#reachFrom');
    const cur = select || el.value;
    el.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    el.value = opts.some(o => o[0] === cur) ? cur : opts[0][0];
  }

  // Within reach: buttons and note
  function renderReachUI() {
    const r = state.reach;
    $('#reachGo').disabled = state.reachBusy;
    $('#reachGo').textContent = state.reachBusy ? 'Drawing...' : 'Show area';
    $('#reachClear').hidden = !r;
    $('#reachNote').textContent = r
      ? `${r.minutes} min ${MODE_PHRASE[r.mode]} from ${r.label}.`
      : 'Shows what you can reach in that time.';
  }

  /* ---------- Trip actions ---------- */
  // Trips: save and re-render
  function touch() {
    queueSave();
    renderSidebar();
    renderDays();
    renderPanel();
    renderMap();
  }

  // Trips: open
  async function openTrip(id) {
    const found = state.trips.find(t => t.id === id);
    if (!found) return;
    state.trip = JSON.parse(JSON.stringify(found));
    const t = state.trip;
    t.stops = t.stops || [];
    t.expenses = t.expenses || [];
    t.routes = t.routes || {};
    t.budget = t.budget || 0;
    t.hotel = t.hotel || null;
    t.dayStart = t.dayStart || '09:00';
    t.expenses.forEach(e => { e.cat = e.cat || 'other'; });
    state.noteOpen = new Set();
    state.menu = null;
    t.stops.forEach(s => { s.note = s.note || ''; s.minutes = s.minutes || 0; s.done = !!s.done; });
    state.day = 1;
    state.panel = 'itinerary';
    state.legs = {};
    state.routeLine = {};
    state.routeError = {};
    state.places = [];
    state.placesStatus = 'idle';
    state.query = '';
    state.reach = null;
    state.reachPin = null;
    reachSig = '';

    $('#empty').hidden = true;
    $('#newPage').hidden = true;
    $('#workspace').hidden = false;
    renderAll();
    enterPanel();
    ensurePhoto();
    map.invalidateSize();
    fitMap();

    loadForecast();
    await loadRates();
    renderPanel();
    for (let d = 1; d <= t.days; d++) if (routePoints(d).length >= 2) requestRoute(d, (d - 1) * 300);
    setSaveState('');
  }

  // New trip: create
  async function createTrip(e) {
    e.preventDefault();
    if (nt.step < 2) { if (nt.ok[nt.step]) goStep(nt.step + 1); return; }
    if (!pendingDest) { toast('Pick a destination from the suggestions.'); return; }
    const days = Math.min(14, Math.max(1, parseInt($('#ntDays').value, 10) || 1));
    const home = $('#ntHome').value;
    try { localStorage.setItem('waypoint.home', home); } catch {}

    const trip = {
      uid: state.uid,
      name: $('#ntName').value.trim() || `Trip to ${pendingDest.name}`,
      destination: { ...pendingDest },
      startDate: $('#ntStart').value,
      days,
      mode: 'driving-car',
      homeCurrency: home,
      tripCurrency: COUNTRY_CURRENCY[pendingDest.country] || 'USD',
      budget: Math.max(0, parseFloat($('#ntBudget').value) || 0),
      ...(nt.photo ? { photo: nt.photo } : {}),
      hotel: null,
      stops: [],
      expenses: [],
      routes: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      trip.id = await store.add(trip);
      state.trips.unshift(trip);
      closeNewPage();
      await openTrip(trip.id);
    } catch (err) {
      toast(firestoreMessage(err));
    }
  }

  // Trips: delete (with undo)
  async function deleteTrip() {
    const t = state.trip;
    if (!t) return;
    const copy = JSON.parse(JSON.stringify(t));
    try {
      await store.remove(t.id);
      state.trips = state.trips.filter(x => x.id !== t.id);
      state.trip = null;
      state.reach = null;
      $('#workspace').hidden = true;
      $('#empty').hidden = false;
      renderSidebar();
      setSaveState('Trip deleted');
      toast(`Deleted "${t.name}"`, async () => {
        try {
          const { id, ...data } = copy;
          await store.set(id, data);
          state.trips.unshift(copy);
          sortTrips();
          renderSidebar();
          await openTrip(id);
        } catch (err) {
          toast(firestoreMessage(err));
        }
      });
    } catch (err) {
      toast(firestoreMessage(err));
    }
  }

  // UI: panel animation
  function enterPanel() {
    const el = $('#panel');
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
  }

  // Itinerary: switch day
  function setDay(n) {
    enterPanel();
    state.day = n;
    state.places = [];
    state.placesStatus = 'idle';
    renderDays();
    renderWeather();
    renderPanel();
    renderMap();
    fitMap();
    ensureRoute(n);
    if (state.panel === 'discover') discover();
  }

  // UI: switch panel
  function setPanel(name) {
    enterPanel();
    state.panel = name;
    renderSeg();
    renderPanel();
    renderMap();
    if (name === 'discover' && state.placesStatus === 'idle') discover();
  }

  // Itinerary: create stop
  function makeStop(p, day) {
    return {
      id: uid(), placeId: p.id, name: p.name, address: p.address,
      lat: p.lat, lon: p.lon, outdoor: !!p.outdoor, hotel: !!p.hotel,
      day, note: '', minutes: 0, done: false,
    };
  }

  // Itinerary: add stop
  function addPlace(p) {
    const t = state.trip;
    if (!p) return;
    if (t.stops.some(s => s.placeId === p.id && s.day === state.day)) { toast('Already on this day.'); return; }
    t.stops.push(makeStop(p, state.day));
    touch();
    requestRoute(state.day);
    fitMap();
    toast(`Added to Day ${state.day}: ${p.name}`);
  }

  // Itinerary: move up/down
  function moveStop(id, dir) {
    const list = dayStops();
    const i = list.findIndex(s => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setDayOrder(state.day, list);
    touch();
    requestRoute(state.day);
  }

  // Itinerary: drag and drop reorder
  function dropStop(dragged, target, after) {
    if (dragged === target) return;
    const list = dayStops();
    const from = list.findIndex(s => s.id === dragged);
    if (from < 0) return;
    const [item] = list.splice(from, 1);
    const to = list.findIndex(s => s.id === target);
    if (to < 0) return;
    list.splice(after ? to + 1 : to, 0, item);
    setDayOrder(state.day, list);
    touch();
    requestRoute(state.day);
  }

  // Itinerary: remove stop (with undo)
  function removeStop(id) {
    const t = state.trip;
    const idx = t.stops.findIndex(s => s.id === id);
    if (idx < 0) return;
    const [s] = t.stops.splice(idx, 1);
    touch();
    requestRoute(s.day);
    fitMap();
    toast(`Removed ${s.name}`, () => {
      const cur = state.trip;
      if (!cur || cur.id !== t.id) return;
      cur.stops.splice(Math.min(idx, cur.stops.length), 0, s);
      touch();
      requestRoute(s.day);
      fitMap();
    });
  }

  // Itinerary: move to another day
  function moveStopToDay(id, newDay) {
    const s = state.trip.stops.find(x => x.id === id);
    if (!s || s.day === newDay) return;
    const old = s.day;
    s.day = newDay;
    state.menu = null;
    touch();
    requestRoute(old);
    requestRoute(newDay);
  }

  /* ---------- Hotel ---------- */
  // Hotel: set
  function setHotel(p) {
    if (!p) return;
    state.trip.hotel = { placeId: p.id, name: p.name, address: p.address, lat: p.lat, lon: p.lon };
    touch();
    resetRoutes();
    fitMap();
    toast(`Hotel set: ${p.name}`);
  }

  // Hotel: remove
  function clearHotel() {
    state.trip.hotel = null;
    touch();
    resetRoutes();
    fitMap();
  }

  /* ---------- Favorites ---------- */
  // Favorites: is saved
  const isFav = id => state.favorites.some(f => f.id === id);
  // Favorites: stop to place
  const stopPlace = s => ({ id: s.placeId, name: s.name, address: s.address, lat: s.lat, lon: s.lon, outdoor: !!s.outdoor, hotel: !!s.hotel });

  // Favorites: add/remove
  async function toggleFav(p) {
    if (!p || !p.id) return;
    if (isFav(p.id)) {
      state.favorites = state.favorites.filter(f => f.id !== p.id);
    } else {
      state.favorites.unshift({
        id: p.id, name: p.name, address: p.address, lat: p.lat, lon: p.lon,
        outdoor: !!p.outdoor, hotel: !!p.hotel, savedAt: Date.now(),
      });
      state.favorites = state.favorites.slice(0, 300);
    }
    renderPanel();
    renderMap();
    try {
      await favStore.save(state.favorites);
    } catch (e) {
      toast(firestoreMessage(e));
    }
  }

  /* ---------- Auto-plan ---------- */
  // Auto-plan: message
  function planMsg(text, kind = 'ok') {
    const el = $('#planMsg');
    el.textContent = text || '';
    el.dataset.kind = kind;
    el.hidden = !text;
  }

  // Auto-plan: disable buttons while busy
  function setPlanBusy(busy) {
    state.planBusy = busy;
    $('#planSubmit').disabled = busy;
    $('#planSubmit').textContent = busy ? 'Planning...' : 'Plan my day';
    $('#cancelPlan').disabled = busy;
  }

  // Auto-plan: open dialog
  function openPlanDialog() {
    const t = state.trip;
    const day = state.day;
    if (isPlaceholder(CFG.geoapify)) { toast('Add your Geoapify key in config.js first.'); return; }
    $('#planTitle').textContent = `Auto-plan Day ${day}`;
    $('#planLead').textContent = `Places near ${t.hotel ? 'your hotel' : t.destination.name}, ordered by travel time.`;
    $('#planCats').innerHTML = PLAN_CATEGORIES.map(c =>
      `<label class="check"><input type="checkbox" value="${esc(c.id)}" ${PLAN_DEFAULT.includes(c.id) ? 'checked' : ''}> ${esc(c.label)}</label>`).join('');
    $('#planCount').value = '5';
    $('#planReplaceWrap').hidden = !dayStops(day).length;
    $('#planReplace').checked = false;
    $('#planHideUsed').checked = state.hideUsed;
    planMsg('');
    setPlanBusy(false);
    $('#planDialog').showModal();
  }

  // Auto-plan: plan the day
  async function runAutoPlan(e) {
    e.preventDefault();
    if (state.planBusy) return;
    const t = state.trip;
    const day = state.day;
    const cats = [...document.querySelectorAll('#planCats input:checked')].map(i => i.value);
    if (!cats.length) { planMsg('Pick at least one category.', 'error'); return; }
    const count = +$('#planCount').value || 5;
    const replace = $('#planReplace').checked && dayStops(day).length > 0;
    state.hideUsed = $('#planHideUsed').checked;
    const w = weatherFor(day);
    const wet = isWet(w);
    const center = t.hotel || t.destination;
    const radius = PLAN_RADIUS[t.mode] || 5000;

    setPlanBusy(true);
    planMsg(wet ? `Rain likely (${Math.round(w.pop * 100)}%). Skipping outdoor places...` : 'Looking for places...');
    try {
      const taken = new Set(t.stops.filter(s => !(replace && s.day === day) && (state.hideUsed || s.day === day)).map(s => s.placeId));
      const pools = [];
      for (const c of cats) {
        const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(c)}`
          + `&filter=circle:${center.lon},${center.lat},${radius}&bias=proximity:${center.lon},${center.lat}&limit=20&apiKey=${CFG.geoapify}`;
        const data = await getJSON(url);
        const seen = new Set();
        pools.push((data.features || []).map(normalizePlace)
          .filter(p => p.name && !seen.has(p.id) && seen.add(p.id) && !taken.has(p.id) && !(wet && p.outdoor)));
      }

      const picks = [];
      const used = new Set();
      let progress = true;
      while (picks.length < count && progress) {
        progress = false;
        for (const pool of pools) {
          while (pool.length && used.has(pool[0].id)) pool.shift();
          if (!pool.length || picks.length >= count) continue;
          const p = pool.shift();
          used.add(p.id);
          picks.push(p);
          progress = true;
        }
      }
      if (!picks.length) {
        planMsg('Nothing found. Try other categories.', 'error');
        setPlanBusy(false);
        return;
      }

      if (replace) t.stops = t.stops.filter(s => s.day !== day);
      picks.forEach(p => t.stops.push(makeStop(p, day)));

      let extra = '';
      try {
        const r = await reorderByTravelTime(day);
        if (r) setDayOrder(day, r.ordered);
      } catch (err) {
        extra = ' Not reordered.';
      }

      touch();
      requestRoute(day, 0);
      fitMap();
      $('#planDialog').close();
      setPanel('itinerary');
      const weatherNote = !w ? ' No forecast, weather not checked.'
        : wet ? ' Outdoor places skipped for rain.' : '';
      toast(`Planned Day ${day} with ${picks.length} ${picks.length === 1 ? 'stop' : 'stops'}.${weatherNote}${extra}`);
    } catch (err) {
      planMsg('Could not plan the day. ' + err.message, 'error');
    }
    setPlanBusy(false);
  }

  /* ---------- Rendering ---------- */
  // UI: render everything
  function renderAll() {
    renderSidebar();
    renderHeader();
    renderDays();
    renderWeather();
    renderSeg();
    renderPanel();
    renderMap();
    renderReachUI();
  }

  // Trips list: days-to-go label
  function countdown(t) {
    const n = Math.round((new Date(t.startDate + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5);
    const txt = n > 1 ? `${n} days to go` : n === 1 ? 'Tomorrow'
      : n <= 0 && n + t.days - 1 >= 0 ? (n === 0 ? 'Starts today' : `Day ${1 - n} of ${t.days}`) : '';
    return txt ? `<span class="trip-count">${txt}</span>` : '';
  }

  // Trips list: render
  function renderSidebar() {
    const list = $('#tripList');
    if (!state.trips.length) {
      list.innerHTML = '<p class="rail-empty">Your trips will show up here.</p>';
      return;
    }
    list.innerHTML = state.trips.map(t => {
      const cur = state.trip && state.trip.id === t.id ? state.trip : t;
      const s = new Date(cur.startDate + 'T12:00:00');
      return `<button class="trip-item${cur.photo ? ' has-photo' : ''}" ${cur.photo ? `style="--photo:url('${esc(cur.photo)}')"` : ''} type="button" data-id="${esc(cur.id)}" ${state.trip && state.trip.id === cur.id ? 'aria-current="true"' : ''}>
        <span class="trip-item-name">${esc(cur.name)}</span>
        <span class="trip-item-meta">${esc(cur.destination.name)}, ${fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        ${countdown(cur)}
      </button>`;
    }).join('');
  }

  // Trip photo: get from Wikipedia
  async function fetchPhoto(name) {
    try {
      const d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(name).replace(/ /g, '_'))}`);
      const src = d.thumbnail && d.thumbnail.source;
      return src ? src.replace(/\/\d+px-/, '/960px-') : '';
    } catch { return ''; }
  }

  // Trip photo: show
  function renderPhoto() {
    const t = state.trip;
    const h = $('.trip-head');
    if (!t || !h) return;
    h.classList.toggle('has-photo', !!t.photo);
    h.style.setProperty('--photo', t.photo ? `url("${t.photo}")` : 'none');
  }

  // Trip photo: load if missing
  async function ensurePhoto() {
    const t = state.trip;
    if (!t || t.photo !== undefined) return;
    const src = await fetchPhoto(t.destination.name);
    if (state.trip !== t) return;
    t.photo = src;
    queueSave();
    renderPhoto();
    renderSidebar();
  }

  // UI: trip header
  function renderHeader() {
    const t = state.trip;
    $('#tripName').value = t.name;
    renderPhoto();
    $('#modeSelect').value = t.mode;
    const a = dateFor(1);
    const b = dateFor(t.days);
    const opts = { day: 'numeric', month: 'short' };
    $('#tripSub').textContent =
      `${t.destination.label}. ${fmtDate(a, opts)} to ${fmtDate(b, { ...opts, year: 'numeric' })}.`;
  }

  // Itinerary: day tabs
  function renderDays() {
    const t = state.trip;
    if (!t) return;
    let h = '';
    for (let i = 1; i <= t.days; i++) {
      const w = weatherFor(i);
      h += `<button type="button" role="tab" class="day" data-day="${i}" aria-selected="${i === state.day}">
        <span class="day-name">Day ${i}</span>
        <span class="day-temp">${w ? ic(wxIconName(w.icon), 'day-ico') + Math.round(w.max) + '°' + (isWet(w) ? '<i class="wet-dot" title="Rain likely"></i>' : '') : ''}</span>
        <span class="day-date">${fmtDate(dateFor(i), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </button>`;
    }
    $('#days').innerHTML = h;
    $('#addDay').disabled = t.days >= 14;
    $('#removeDay').disabled = t.days <= 1 || dayStops(t.days).length > 0;
    $('#tripSub').textContent =
      `${t.destination.label}. ${fmtDate(dateFor(1), { day: 'numeric', month: 'short' })} to ${fmtDate(dateFor(t.days), { day: 'numeric', month: 'short', year: 'numeric' })}.`;
  }

  // Weather: render card
  function renderWeather() {
    const el = $('#weather');
    if (!state.trip) return;
    el.removeAttribute('data-sky');
    if (state.forecastError) {
      el.innerHTML = `<p class="wx-empty">Weather unavailable. ${esc(state.forecastError)}</p>`;
      return;
    }
    if (!state.forecast) { el.innerHTML = '<div class="skel" style="height:34px;width:100%" aria-label="Loading forecast"></div>'; return; }
    const w = weatherFor(state.day);
    if (!w) {
      el.innerHTML = `<p class="wx-empty">No forecast for ${esc(fmtDate(dateFor(state.day), { day: 'numeric', month: 'long' }))}. Only the next 5 days are covered.</p>`;
      return;
    }
    el.dataset.sky = SKY[w.main] || 'mist';
    el.innerHTML = `<div class="wx">
      ${ic(wxIconName(w.icon), 'wx-icon')}
      <div class="wx-temp">${Math.round(w.max)}° <small>${Math.round(w.min)}°</small></div>
      <div class="wx-desc">${esc(w.description)}</div>
      <div class="wx-facts">
        <div><span>${ic('droplet')} Chance of rain</span><b>${Math.round(w.pop * 100)}%</b></div>
        <div><span>${ic('wind')} Wind</span><b>${Math.round(w.wind * 3.6)} km/h</b></div>
      </div>
    </div>`;
  }

  // UI: active panel button
  function renderSeg() {
    document.querySelectorAll('#seg button').forEach(b =>
      b.setAttribute('aria-selected', String(b.dataset.panel === state.panel)));
  }

  // UI: render selected panel
  function renderPanel() {
    if (!state.trip) return;
    const el = $('#panel');
    const a = document.activeElement;
    const key = a && a.dataset ? a.dataset.focus : null;
    const sel = key && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    el.innerHTML = state.panel === 'discover' ? discoverHTML()
      : state.panel === 'saved' ? savedHTML()
        : state.panel === 'budget' ? budgetHTML()
          : itineraryHTML();
    if (key) {
      const input = [...el.querySelectorAll('[data-focus]')].find(x => x.dataset.focus === key);
      if (input) {
        input.focus();
        if (sel) { try { input.setSelectionRange(sel[0], sel[1]); } catch {} }
      }
    }
  }

  const ic = (name, cls = '') => `<svg class="ico${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const ICON = { up: ic('up'), down: ic('down'), close: ic('close'), star: ic('star'), grip: ic('grip') };

  const WX_ICON = { '01': 'sun', '02': 'cloud-sun', '03': 'cloud', '04': 'cloud', '09': 'rain', '10': 'rain', '11': 'bolt', '13': 'snow', '50': 'mist' };
  const SKY = { Clear: 'clear', Clouds: 'clouds', Rain: 'rain', Drizzle: 'rain', Thunderstorm: 'storm', Snow: 'snow' };
  // Weather: icon
  const wxIconName = code => WX_ICON[String(code || '').slice(0, 2)] || 'cloud';

  // Favorites: star button
  const starBtn = (act, attrs, on) =>
    `<button class="icon-btn star" type="button" data-act="${act}" ${attrs} aria-pressed="${on}" aria-label="${on ? 'Remove from favorites' : 'Save to favorites'}" title="${on ? 'Remove from favorites' : 'Save to favorites'}">${ICON.star}</button>`;

  // Itinerary panel
  function itineraryHTML() {
    const t = state.trip;
    const day = state.day;
    const stops = dayStops();
    const hotel = t.hotel;
    const r = t.routes[day];
    const err = state.routeError[day];
    const legs = state.legs[day] || [];
    const w = weatherFor(day);
    const canRoute = routePoints(day).length >= 2;
    const sc = schedule(day);
    let h = '';

    h += hotel
      ? `<div class="base-card">
          <span class="pin pin-hotel">${ic('bed')}</span>
          <div class="base-text"><div class="base-label">Hotel</div><div class="base-name">${esc(hotel.name)}</div></div>
          <div class="base-actions">
            <button class="btn small" type="button" data-act="findHotel">Change</button>
            <button class="btn small ghost" type="button" data-act="clearHotel">Remove</button>
          </div></div>`
      : `<div class="base-card">
          <div class="base-text"><div class="base-label">Home base</div><div class="base-sub">Pick a hotel to start and end each day.</div></div>
          <div class="base-actions"><button class="btn small" type="button" data-act="findHotel">${ic('bed')} Find hotels</button></div></div>`;

    h += `<div class="toolbar"><button class="btn small" type="button" data-act="autoplan">${ic('sparkles')} Auto-plan Day ${day}</button>
      <label class="start-time">Day starts at <input type="time" data-act="dayStart" value="${esc(t.dayStart)}"></label></div>`;

    const outdoor = stops.filter(s => s.outdoor).length;
    if (isWet(w) && outdoor) {
      h += `<div class="notice">${ic('alert')}<p>Rain likely (${Math.round(w.pop * 100)}%). ${outdoor} outdoor ${outdoor === 1 ? 'stop' : 'stops'} affected.</p>
        <button class="btn small" type="button" data-act="findIndoor">${ic('umbrella')} Find indoor places</button></div>`;
    }

    if (canRoute) {
      if (r) {
        h += `<div class="route-card"><div>
            <div class="route-main">${fmtDist(r.distance)}, ${fmtDur(r.duration)}</div>
            <div class="route-sub">${MODES[t.mode]} route, Day ${day}</div>
          </div>
          <button class="btn small" type="button" data-act="optimize">${ic('sort')} Optimize order</button></div>`;
      } else if (err) {
        h += `<p class="route-error">Route unavailable. ${esc(err)}</p>`;
      } else {
        h += '<div class="route-card"><div class="skel" style="height:26px;width:150px" aria-label="Calculating route"></div></div>';
      }
    } else {
      h += `<p class="route-note">${hotel ? 'Add a stop to see the route.' : 'Add 2+ stops to see the route.'}</p>`;
    }

    if (stops.length) {
      const visitMin = stops.reduce((a, s) => a + (s.minutes || 0), 0);
      const doneN = stops.filter(s => s.done).length;
      const parts = [];
      if (visitMin) parts.push(`${fmtDur(visitMin * 60)} at stops`);
      if (r) parts.push(`${fmtDur(r.duration)} travelling`);
      if (visitMin && r) parts.push(`about ${fmtDur(visitMin * 60 + r.duration)} in total`);
      parts.push(`${doneN} of ${stops.length} done`);
      h += `<p class="route-note">${parts.join(', ')}.</p>`;
    }

    const total = Object.entries(t.routes)
      .filter(([d, v]) => +d <= t.days && v.mode === t.mode)
      .reduce((a, [, v]) => ({ distance: a.distance + v.distance, duration: a.duration + v.duration }), { distance: 0, duration: 0 });
    if (total.distance > 0 && Object.keys(t.routes).length > 1) {
      h += `<p class="route-note">Whole trip: ${fmtDist(total.distance)}, ${fmtDur(total.duration)}.</p>`;
    } else if (r) {
      h += '<div style="height:12px"></div>';
    }

    if (!stops.length) {
      h += `<div class="empty-note"><p>No stops for Day ${day} yet.</p>
        <button class="btn" type="button" data-act="openDiscover">${ic('search')} Find places</button></div>`;
      return h;
    }

    const dayOptions = sel => Array.from({ length: t.days }, (_, i) =>
      `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>Day ${i + 1}</option>`).join('');

    const legHTML = leg => (leg ? `<li class="leg">${fmtDur(leg.duration)}, ${fmtDist(leg.distance)}</li>` : '<li class="leg">&nbsp;</li>');
    const hotelRow = text => `<li class="stop stop-base"><span class="pin pin-hotel">${ic('bed')}</span>
        <div><div class="stop-name">${esc(hotel.name)}</div><div class="stop-addr">${text}</div></div></li>`;

    h += '<ol class="stops" style="list-style:none;padding:0;margin:0">';
    if (hotel) {
      h += hotelRow(`Leave at ${fmtClock(toMin(t.dayStart))}`);
      h += legHTML(legs[0]);
    }
    stops.forEach((s, i) => {
      const mins = VISIT_OPTIONS.concat(s.minutes && !VISIT_OPTIONS.includes(s.minutes) ? [s.minutes] : []).sort((a, b) => a - b);
      const minOpts = mins.map(m =>
        `<option value="${m}" ${m === (s.minutes || 0) ? 'selected' : ''}>${m ? fmtDur(m * 60) : 'Time here'}</option>`).join('');
      const tm = sc.ok ? sc.out[i] : null;
      const timeTxt = tm ? `${fmtClock(tm.arrive)} arrive${s.minutes ? `, ${fmtClock(tm.leave)} leave` : ''}` : '';
      const noteOpen = !!s.note || state.noteOpen.has(s.id);
      const menu = state.menu === s.id ? `<div class="stop-menu" role="menu">
          <button type="button" data-act="up" data-id="${s.id}" ${i === 0 ? 'disabled' : ''}>${ic('up')} Move up</button>
          <button type="button" data-act="down" data-id="${s.id}" ${i === stops.length - 1 ? 'disabled' : ''}>${ic('down')} Move down</button>
          <label>Move to <select data-act="moveDay" data-id="${s.id}" aria-label="Move to day">${dayOptions(s.day)}</select></label>
          <button type="button" data-act="photosStop" data-id="${s.id}">${ic('image')} Photos</button>
          <button type="button" data-act="favStop" data-id="${s.id}">${ic('star')} ${isFav(s.placeId) ? 'Remove from favorites' : 'Save to favorites'}</button>
          <button type="button" class="danger" data-act="remove" data-id="${s.id}">${ic('close')} Remove stop</button>
        </div>` : '';
      h += `<li class="stop${s.done ? ' is-done' : ''}${state.stamp === s.id ? ' stamp' : ''}" data-id="${s.id}">
        <span class="grip" draggable="true" data-id="${s.id}" title="Drag to reorder" aria-hidden="true">${ICON.grip}</span>
        <span class="pin">${s.done ? ic('check') : i + 1}</span>
        <div class="stop-main">
          <div class="stop-name">${esc(s.name)}</div>
          ${timeTxt ? `<div class="stop-time">${timeTxt}</div>` : ''}
          <div class="stop-addr">${esc(s.address)}</div>
          ${s.outdoor && isWet(w) ? '<div class="stop-note">Outdoor stop, rain likely</div>' : ''}
        </div>
        <label class="done-box"><input type="checkbox" data-act="done" data-id="${s.id}" ${s.done ? 'checked' : ''}><span>Done</span></label>
        <button class="icon-btn" type="button" data-act="menu" data-id="${s.id}" aria-label="More actions" aria-haspopup="menu" aria-expanded="${state.menu === s.id}">${ic('more')}</button>
        ${menu}
        <div class="stop-extra">
          ${noteOpen
    ? `<input class="note-input" type="text" data-act="note" data-id="${s.id}" data-focus="note-${s.id}" maxlength="140" placeholder="Add a note" value="${esc(s.note || '')}" aria-label="Notes for ${esc(s.name)}">`
    : `<button class="add-note" type="button" data-act="noteOpen" data-id="${s.id}">Add note</button>`}
          <select data-act="minutes" data-id="${s.id}" aria-label="Time spent here">${minOpts}</select>
        </div>
      </li>`;
      const leg = legs[i + (hotel ? 1 : 0)];
      if (i < stops.length - 1 || hotel) h += legHTML(leg);
    });
    if (hotel) h += hotelRow(sc.ok && sc.back != null ? `Back about ${fmtClock(sc.back)}` : 'End of the day');
    h += '</ol>';
    return h;
  }

  // Find places panel
  function discoverHTML() {
    const s = state;
    const chips = [{ id: 'all', label: 'All' }, ...CATEGORIES].map(c =>
      `<button class="chip" type="button" data-act="cat" data-cat="${esc(c.id)}" aria-pressed="${c.id === s.category}">${esc(c.label)}</button>`).join('');
    const radii = [1000, 3000, 5000, 10000].map(v =>
      `<option value="${v}" ${v === s.radius ? 'selected' : ''}>${v / 1000} km</option>`).join('');
    const c = discoverCenter();

    let body = '';
    if (s.placesStatus === 'loading' || s.placesStatus === 'idle') {
      body = '<ul class="results" aria-busy="true">' + '<li class="result"><div style="flex:1"><div class="skel" style="height:14px;width:55%"></div><div class="skel" style="height:11px;width:85%;margin-top:8px"></div></div></li>'.repeat(5) + '</ul>';
    } else if (s.placesStatus === 'error') {
      body = `<p class="route-error">Search failed. ${esc(s.placesError)}</p>`;
    } else if (!s.places.length) {
      body = s.query.trim().length >= 2
        ? `<p class="empty-note">No results for "${esc(s.query.trim())}". Try a larger radius.</p>`
        : '<p class="empty-note">Nothing found. Try a larger radius.</p>';
    } else {
      body = '<ul class="results">' + s.places.map((p, i) => {
        const added = s.trip.stops.some(x => x.placeId === p.id && x.day === s.day);
        const isHotel = s.trip.hotel && s.trip.hotel.placeId === p.id;
        return `<li class="result">
          <div class="result-text"><div class="result-name">${esc(p.name)}</div>
          <div class="result-meta">${esc(p.address)}${p.distance != null ? `, ${fmtDist(p.distance)} away` : ''}</div></div>
          <div class="result-actions">
            ${starBtn('fav', `data-i="${i}"`, isFav(p.id))}
            <button class="icon-btn" type="button" data-act="photos" data-i="${i}" aria-label="Photos of ${esc(p.name)}" title="Photos">${ic('image')}</button>
            ${p.hotel ? `<button class="btn small" type="button" data-act="setHotel" data-i="${i}" ${isHotel ? 'disabled' : ''}>${isHotel ? 'Your hotel' : 'Set as hotel'}</button>` : ''}
            <button class="btn small" type="button" data-act="add" data-i="${i}" ${added ? 'disabled' : ''}>${added ? 'Added' : `Add to Day ${s.day}`}</button>
          </div>
        </li>`;
      }).join('') + '</ul>';
    }

    return `<form id="placeForm" class="search" role="search" autocomplete="off">
        <label class="sr-only" for="placeSearch">Search places by name</label>
        <input id="placeSearch" data-act="query" data-focus="placeSearch" type="search" enterkeyhint="search" maxlength="80"
          placeholder="Search places by name" value="${esc(s.query)}">
      </form>
      <div class="chips">${chips}</div>
      ${s.category !== HOTEL_CAT && s.trip.stops.some(x => x.day !== s.day)
        ? `<label class="check hide-used"><input type="checkbox" data-act="hideUsed" ${s.hideUsed ? 'checked' : ''}> Hide places already on other days</label>` : ''}
      <div class="discover-bar"><span>Near ${esc(c.label)}</span>
        <label>Within <select data-act="radius">${radii}</select></label></div>${body}`;
  }

  // Saved places panel
  function savedHTML() {
    const t = state.trip;
    const d = t.destination;
    if (!state.favorites.length) {
      return `<div class="empty-note"><p>No saved places yet. Star a place to keep it here.</p>
        <button class="btn" type="button" data-act="openDiscover">${ic('search')} Find places</button></div>`;
    }
    const list = state.favorites
      .map(f => ({ ...f, dist: distanceM(d.lat, d.lon, f.lat, f.lon) }))
      .sort((a, b) => a.dist - b.dist);
    return `<p class="route-note">Nearest to ${esc(d.name)} first.</p>
      <ul class="results">` + list.map(f => {
      const added = t.stops.some(x => x.placeId === f.id && x.day === state.day);
      const isHotel = t.hotel && t.hotel.placeId === f.id;
      return `<li class="result">
          <div class="result-text"><div class="result-name">${esc(f.name)}</div>
          <div class="result-meta">${esc(f.address)}, ${fmtDist(f.dist)} from ${esc(d.name)}</div></div>
          <div class="result-actions">
            ${starBtn('unfav', `data-pid="${esc(f.id)}"`, true)}
            <button class="icon-btn" type="button" data-act="photosFav" data-pid="${esc(f.id)}" aria-label="Photos of ${esc(f.name)}" title="Photos">${ic('image')}</button>
            ${f.hotel ? `<button class="btn small" type="button" data-act="hotelFav" data-pid="${esc(f.id)}" ${isHotel ? 'disabled' : ''}>${isHotel ? 'Your hotel' : 'Set as hotel'}</button>` : ''}
            <button class="btn small" type="button" data-act="addFav" data-pid="${esc(f.id)}" ${added ? 'disabled' : ''}>${added ? 'Added' : `Add to Day ${state.day}`}</button>
          </div>
        </li>`;
    }).join('') + '</ul>';
  }

  // Budget panel
  function budgetHTML() {
    const t = state.trip;
    const rates = state.rates && state.rates.base === t.homeCurrency ? state.rates.rates : null;
    const codes = rates ? Object.keys(rates).sort() : COMMON_CURRENCIES;
    const opts = sel => (codes.includes(sel) ? '' : `<option selected>${esc(sel)}</option>`)
      + codes.map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');

    const rate = rates ? rates[t.tripCurrency] : null;
    const spentTrip = t.expenses.reduce((a, e) => a + e.amount, 0);
    const spentHome = rate ? spentTrip / rate : null;
    const remaining = spentHome != null ? t.budget - spentHome : null;
    const pct = t.budget > 0 && spentHome != null ? Math.min(100, (spentHome / t.budget) * 100) : 0;

    const catOpts = EXP_CATS.map(([id, l]) => `<option value="${id}">${l}</option>`).join('');
    const byCat = {};
    t.expenses.forEach(e => { const k = catOf(e.cat)[0]; byCat[k] = (byCat[k] || 0) + e.amount; });
    const bdRows = EXP_CATS.filter(c => byCat[c[0]]).sort((x, y) => byCat[y[0]] - byCat[x[0]]);
    const fmtSpend = v => (rate ? money(v / rate, t.homeCurrency) : money(v, t.tripCurrency));
    const breakdown = bdRows.length ? '<div class="breakdown" aria-label="Spending by category">' + bdRows.map(([id, label]) => {
      const p = spentTrip ? (byCat[id] / spentTrip) * 100 : 0;
      return `<div class="bd-row"><span>${label} <small>${Math.round(p)}%</small></span><div class="bd-bar"><i style="width:${p}%"></i></div><b>${fmtSpend(byCat[id])}</b></div>`;
    }).join('') + '</div>' : '';
    let rateInfo = '';
    if (state.ratesError) {
      rateInfo = `<p class="rate-error">Exchange rates unavailable. ${esc(state.ratesError)}</p>`;
    } else if (!rates) {
      rateInfo = '<p class="rate-line">Loading exchange rates...</p>';
    } else if (rate) {
      const upd = state.rates.updated ? new Date(state.rates.updated).toLocaleDateString() : '';
      rateInfo = `<p class="rate-line">1 ${esc(t.homeCurrency)} = ${rate.toFixed(rate < 1 ? 4 : 2)} ${esc(t.tripCurrency)}${upd ? `. Updated ${esc(upd)}.` : ''}</p>`;
    }

    const list = t.expenses.length
      ? '<ul class="expenses">' + t.expenses.map(e => `<li class="expense">
          <div class="expense-left"><button class="icon-btn" type="button" data-act="delExp" data-id="${e.id}" aria-label="Remove expense">${ICON.close}</button><span>${esc(e.name)}<small class="cat-tag">${esc(catOf(e.cat)[1])}</small></span></div>
          <div class="expense-amt">${money(e.amount, t.tripCurrency)}${rate ? `<small>${money(e.amount / rate, t.homeCurrency)}</small>` : ''}</div>
        </li>`).join('') + '</ul>'
      : '';

    return `<div class="card">
        <h3>Budget</h3>
        <div class="row2">
          <div class="field"><label for="budgetInput">Total budget</label>
            <input id="budgetInput" data-act="budget" type="number" min="0" step="any" value="${t.budget || ''}" placeholder="0"></div>
          <div class="field"><label for="homeSel">Home currency</label>
            <select id="homeSel" data-act="home">${opts(t.homeCurrency)}</select></div>
        </div>
        <div class="field"><label for="tripSel">Currency at destination</label>
          <select id="tripSel" data-act="tripCur">${opts(t.tripCurrency)}</select></div>
        ${rateInfo}
      </div>

      <div class="card">
        <h3>Expenses</h3>
        <form id="expForm" class="expense-form" autocomplete="off">
          <div class="field exp-name"><label for="expName">What for</label><input id="expName" type="text" required maxlength="60" placeholder="Dinner, tickets, taxi"></div>
          <div class="field"><label for="expCat">Category</label><select id="expCat">${catOpts}</select></div>
          <div class="field"><label for="expAmt">${esc(t.tripCurrency)}</label><input id="expAmt" type="number" min="0" step="any" required placeholder="0"></div>
          <button class="btn primary" type="submit">Add</button>
        </form>
        ${list}
        ${breakdown}<div class="meter" aria-hidden="true"><i class="${remaining != null && remaining < 0 ? 'bad' : ''}" style="width:${pct}%"></i></div>
        <div class="summary-grid">
          <div><span>Spent</span><b>${rate ? money(spentHome, t.homeCurrency) : money(spentTrip, t.tripCurrency)}</b></div>
          <div><span>${remaining != null && remaining < 0 ? 'Over budget by' : 'Remaining'}</span>
            <b class="${remaining != null && remaining < 0 ? 'over' : ''}">${remaining != null ? money(Math.abs(remaining), t.homeCurrency) : 'n/a'}</b></div>
        </div>
      </div>`;
  }

  /* ---------- Map ---------- */
  // Map: tile layer
  const tiles = () => L.tileLayer(`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${CFG.geoapify}`, {
    maxZoom: 19,
    attribution: 'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; OpenMapTiles &copy; OpenStreetMap contributors',
  });

  // Map: create
  function setupMap() {
    map = L.map('map').setView([20, 10], 2);
    tiles().addTo(map);
    layers.reach = L.layerGroup().addTo(map);
    layers.route = L.layerGroup().addTo(map);
    layers.stops = L.layerGroup().addTo(map);
    layers.places = L.layerGroup().addTo(map);
    const box = $('#reach');
    if (box) { L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box); }
  }

  // Map: marker icon
  const pinIcon = (label, cls = '') => L.divIcon({
    className: '',
    html: `<div class="pin pin-map ${cls}">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  // Map: place popup
  function popupNode(p) {
    const div = document.createElement('div');
    div.innerHTML = `<div class="pop-name">${esc(p.name)}</div><div class="pop-addr">${esc(p.address)}</div>`;
    const row = document.createElement('div');
    row.className = 'pop-actions';
    const b = document.createElement('button');
    b.className = 'btn small';
    b.type = 'button';
    b.textContent = `Add to Day ${state.day}`;
    b.addEventListener('click', () => { addPlace(p); map.closePopup(); });
    row.appendChild(b);
    const pb = document.createElement('button');
    pb.className = 'btn small';
    pb.type = 'button';
    pb.textContent = 'Photos';
    pb.addEventListener('click', () => openPhotos(p));
    row.appendChild(pb);
    if (p.hotel) {
      const hb = document.createElement('button');
      hb.className = 'btn small';
      hb.type = 'button';
      hb.textContent = 'Set as hotel';
      hb.addEventListener('click', () => { setHotel(p); map.closePopup(); });
      row.appendChild(hb);
    }
    div.appendChild(row);
    return div;
  }

  // Map: stop popup
  function stopPopup(s, tm) {
    const div = document.createElement('div');
    div.innerHTML = `<div class="pop-name">${esc(s.name)}</div>
      <div class="pop-addr">${esc(s.address)}${tm ? `<br>${fmtClock(tm.arrive)} arrive` : ''}</div>
      <div class="pop-photo" hidden></div>
      <div class="pop-actions"><button class="btn small" type="button" data-all>All photos</button></div>`;
    div.querySelector('[data-all]').addEventListener('click', () => openPhotos(s));
    return div;
  }

  // Map: popup photos
  async function fillStopPhotos(s, node, marker) {
    const box = node.querySelector('.pop-photo');
    if (box.dataset.done) return;
    box.dataset.done = '1';
    box.hidden = false;
    box.innerHTML = '<div class="skel pop-skel" aria-label="Loading photos"></div>';
    let items = [];
    try { items = await loadPlacePhotos(s); } catch {}
    const pop = marker && marker.getPopup();
    if (!items.length) {
      box.innerHTML = '<p class="pop-credit">No community photos nearby.</p>';
      if (pop) pop.update();
      return;
    }
    let k = 0;
    const nav = (cls, d, label) => `<button type="button" class="icon-btn ph-nav ${cls}" data-d="${d}" aria-label="${label}">${ic('chevron')}</button>`;
    // Update the img and credit in place; replacing buttons breaks Leaflet popup clicks
    box.innerHTML = `<div class="pop-img"><img alt="Photo near ${esc(s.name)}" draggable="false">
        ${items.length > 1 ? nav('prev', -1, 'Previous photo') + nav('next', 1, 'Next photo') : ''}</div><p class="pop-credit"></p>`;
    const img = box.querySelector('img');
    const credit = box.querySelector('.pop-credit');
    const show = () => {
      const it = items[k];
      img.src = it.src;
      credit.innerHTML = `${it.artist ? esc(it.artist) + ', ' : ''}${esc(it.license)} <a href="${esc(it.page)}" target="_blank" rel="noopener">Commons</a> (${k + 1}/${items.length})`;
    };
    img.addEventListener('load', () => {
      if (pop && !img.dataset.sized) { img.dataset.sized = '1'; pop.update(); }
    });
    L.DomEvent.disableClickPropagation(box);
    box.addEventListener('click', e => {
      L.DomEvent.stopPropagation(e);
      const b = e.target.closest('[data-d]');
      if (b) { k = (k + +b.dataset.d + items.length) % items.length; show(); }
    });
    show();
  }

  // Map: render
  function renderMap() {
    if (!map || !state.trip) return;
    Object.values(layers).forEach(l => l.clearLayers());
    renderReachOptions();
    Object.keys(stopMarkers).forEach(k => delete stopMarkers[k]);

    if (state.reach) {
      const feats = ((state.reach.geo && state.reach.geo.features) || []).slice()
        .sort((a, b) => ((b.properties && b.properties.value) || 0) - ((a.properties && a.properties.value) || 0));
      feats.forEach(f => {
        L.geoJSON(f, {
          style: { color: '#6AB0AF', weight: 1.5, opacity: 0.9, fillColor: '#6AB0AF', fillOpacity: 0.16 },
          interactive: false,
        }).addTo(layers.reach);
      });
      L.circleMarker([state.reach.lat, state.reach.lon], {
        radius: 6, color: '#0B1B2B', weight: 2, fillColor: '#FFD27A', fillOpacity: 1, interactive: false,
      }).addTo(layers.reach);
    }

    const line = state.routeLine[state.day];
    if (line) {
      L.polyline(line, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(layers.route);
      L.polyline(line, { color: '#E8604C', weight: 5, opacity: 1 }).addTo(layers.route);
    }
    const hotel = state.trip.hotel;
    if (hotel) {
      L.marker([hotel.lat, hotel.lon], { icon: pinIcon(ic('bed'), 'pin-hotel'), title: hotel.name }).addTo(layers.stops);
    }
    const sc = schedule(state.day);
    dayStops().forEach((s, i) => {
      const tm = sc.ok ? sc.out[i] : null;
      const node = stopPopup(s, tm);
      stopMarkers[s.id] = L.marker([s.lat, s.lon], { icon: pinIcon(s.done ? ic('check') : i + 1, s.done ? 'pin-done' : ''), title: s.name })
        .addTo(layers.stops)
        .bindPopup(node, { minWidth: 240, maxWidth: 280 })
        .on('popupopen', () => fillStopPhotos(s, node, stopMarkers[s.id]))
        .on('mouseover', () => hlStop(s.id, true))
        .on('mouseout', () => hlStop(s.id, false));
    });

    const dots = state.panel === 'discover' ? state.places : state.panel === 'saved' ? state.favorites : [];
    dots.forEach(p => {
      L.circleMarker([p.lat, p.lon], { radius: 7, color: '#6AB0AF', weight: 2, fillColor: '#183450', fillOpacity: 1 })
        .bindPopup(popupNode(p))
        .addTo(layers.places);
    });
  }

  // Map: highlight stop
  function hlStop(id, on) {
    const el = document.querySelector(`.stop[data-id="${id}"]`);
    if (el) el.classList.toggle('hl', on);
  }

  // Map: zoom to stop
  function focusStop(id) {
    const m = stopMarkers[id];
    if (!m || !map) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
    m.openPopup();
    if (window.matchMedia('(max-width: 1050px)').matches) $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Print: build printable itinerary
  function renderPrint() {
    const el = $('#printView');
    const t = state.trip;
    if (!t) { el.innerHTML = ''; return; }
    const o = { day: 'numeric', month: 'short' };
    let h = `<h1>${esc(t.name)}</h1><p class="pv-sub">${esc(t.destination.label)}. ${fmtDate(dateFor(1), o)} to ${fmtDate(dateFor(t.days), { ...o, year: 'numeric' })}.</p>`;
    if (t.hotel) h += `<p class="pv-sub">Hotel: ${esc(t.hotel.name)}${t.hotel.address ? ', ' + esc(t.hotel.address) : ''}</p>`;
    for (let d = 1; d <= t.days; d++) {
      const stops = dayStops(d);
      const w = weatherFor(d);
      const r = t.routes[d];
      const sc = schedule(d);
      const meta = [w && `${Math.round(w.max)}°/${Math.round(w.min)}°, ${w.description}`,
        r && `${fmtDist(r.distance)}, ${fmtDur(r.duration)} ${MODE_PHRASE[r.mode] || ''}`].filter(Boolean).join('. ');
      h += `<section class="pv-day"><h2>Day ${d}, ${esc(fmtDate(dateFor(d), { weekday: 'long', day: 'numeric', month: 'long' }))}</h2>`;
      if (meta) h += `<p class="pv-sub">${esc(meta)}</p>`;
      h += stops.length ? '<ol>' + stops.map((s, i) => {
        const tm = sc.ok ? sc.out[i] : null;
        return `<li><b>${tm ? `<span class="pv-time">${fmtClock(tm.arrive)}</span>` : ''}${esc(s.name)}</b>${tm && s.minutes ? ` (until ${fmtClock(tm.leave)})` : ''}`
          + `<span class="pv-addr">${esc(s.address)}</span>${s.note ? `<span class="pv-note">${esc(s.note)}</span>` : ''}</li>`;
      }).join('') + '</ol>' : '<p class="pv-sub">Nothing planned.</p>';
      h += '</section>';
    }
    el.innerHTML = h;
  }

  // Map: fit to stops
  function fitMap() {
    if (!map || !state.trip) return;
    const pts = dayStops().map(s => [s.lat, s.lon]);
    if (state.trip.hotel && pts.length) pts.push([state.trip.hotel.lat, state.trip.hotel.lon]);
    if (pts.length > 1) map.fitBounds(pts, { padding: [50, 50], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 14);
    else if (state.trip.hotel) map.setView([state.trip.hotel.lat, state.trip.hotel.lon], 14);
    else map.setView([state.trip.destination.lat, state.trip.destination.lon], 12);
  }

  /* ---------- Events ---------- */
  // New trip: open wizard
  function openNewPage() {
    if (!state.uid) { toast('Log in or continue as guest first.'); return; }
    if (isPlaceholder(CFG.geoapify)) { toast('Add your Geoapify key in config.js first.'); return; }
    $('#newForm').reset();
    pendingDest = null;
    nt.touchedName = false;
    nt.previewKey = '';
    nt.step = 0;
    nt.photo = '';
    $('#ntPhoto').hidden = true;
    const vis = $('#ntVisual');
    if (!vis.firstChild) vis.innerHTML = $('#empty .empty-visual').innerHTML.replace(/mapClip/g, 'mapClip2');
    $('#ntList').hidden = true;
    $('#ntHint').hidden = false;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    $('#ntStart').value = toISO(d);
    nt.month = new Date(d.getFullYear(), d.getMonth(), 1);
    let home = 'USD';
    try { home = localStorage.getItem('waypoint.home') || 'USD'; } catch {}
    $('#ntHome').innerHTML = COMMON_CURRENCIES.map(c => `<option ${c === home ? 'selected' : ''}>${c}</option>`).join('');
    $('#empty').hidden = true;
    $('#workspace').hidden = true;
    $('#newPage').hidden = false;
    if (!nmap) {
      nmap = L.map('ntMap').setView([20, 10], 2);
      tiles().addTo(nmap);
    }
    if (nmarker) { nmarker.remove(); nmarker = null; }
    nmap.setView([20, 10], 2);
    goStep(0);
    $('#ntDest').focus();
  }

  // New trip: close wizard
  function closeNewPage() {
    $('#newPage').hidden = true;
    $('#empty').hidden = !!state.trip;
    $('#workspace').hidden = !state.trip;
    if (state.trip && map) map.invalidateSize();
  }

  // New trip: destination preview
  function syncPreview() {
    const p = pendingDest;
    if (!p || document.activeElement === $('#ntDest')) return;
    const key = `${p.lat},${p.lon}`;
    if (key === nt.previewKey) return;
    nt.previewKey = key;
    nt.photo = '';
    $('#ntPhoto').hidden = true;
    fetchPhoto(p.name).then(src => {
      if (nt.previewKey !== key || !src) return;
      nt.photo = src;
      $('#ntPhoto').src = src;
      $('#ntPhoto').hidden = false;
    });
    if (nmarker) nmarker.remove();
    nmarker = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#0B1B2B', weight: 2, fillColor: '#6AB0AF', fillOpacity: 1 }).addTo(nmap);
    $('#ntHint').hidden = true;
    nmap.invalidateSize();
    nmap.setView([p.lat, p.lon], 11);
  }

  // New trip: validate steps
  function renderNew() {
    const days = parseInt($('#ntDays').value, 10);
    const v1 = !!pendingDest;
    const v2 = !!$('#ntStart').value && days >= 1 && days <= 14;
    nt.ok = [v1, v2];
    document.querySelectorAll('#newPage .step').forEach((el, i) => {
      el.classList.toggle('current', i === nt.step);
      el.classList.toggle('done', i < nt.step);
      const numEl = el.querySelector('.step-num');
      const kind = i < nt.step ? 'check' : 'num';
      if (numEl.dataset.k !== kind) { numEl.dataset.k = kind; numEl.innerHTML = kind === 'check' ? ic('check') : String(i + 1); }
    });
    $('#ntNext1').disabled = !v1;
    $('#ntNext2').disabled = !v2;
    $('#ntCreate').disabled = !(v1 && v2);
    renderCal();
  }

  // New trip: go to step
  function goStep(n) {
    nt.step = n;
    renderNew();
    if (n === 0 && nmap) {
      nmap.invalidateSize();
      if (pendingDest && nt.previewKey) nmap.setView([pendingDest.lat, pendingDest.lon], 11);
    }
  }

  // New trip: calendar
  function renderCal() {
    const a = $('#ntStart').value;
    const n = Math.min(14, Math.max(1, parseInt($('#ntDays').value, 10) || 1));
    let b = '';
    let sum = 'Pick a start date.';
    if (a) {
      const s = new Date(a + 'T12:00:00');
      const e = new Date(s);
      e.setDate(e.getDate() + n - 1);
      b = toISO(e);
      const o = { weekday: 'short', day: 'numeric', month: 'short' };
      sum = `${fmtDate(s, o)} to ${fmtDate(e, o)}, ${n} ${n === 1 ? 'day' : 'days'}`;
    }
    const y = nt.month.getFullYear();
    const m = nt.month.getMonth();
    const today = toISO(new Date());
    let cells = '<span></span>'.repeat(new Date(y, m, 1).getDay());
    for (let d = 1, last = new Date(y, m + 1, 0).getDate(); d <= last; d++) {
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
      const cls = ['cal-day', iso === a && 'start', iso === b && 'end', a && iso > a && iso < b && 'mid', iso === today && 'today'].filter(Boolean).join(' ');
      cells += `<button type="button" class="${cls}" data-d="${iso}" aria-pressed="${!!a && iso >= a && iso <= b}">${d}</button>`;
    }
    $('#ntCal').innerHTML = `<div class="cal-head">
        <button type="button" class="icon-btn" data-cal="-1" aria-label="Previous month">${ic('chevron')}</button>
        <span>${esc(nt.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span>
        <button type="button" class="icon-btn" data-cal="1" aria-label="Next month">${ic('chevron')}</button></div>
      <div class="cal-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span class="dow">${x}</span>`).join('')}${cells}</div>
      <p class="cal-sum">${esc(sum)}</p>`;
  }

  // Drag and drop: clear markers
  function clearDropMarks() {
    document.querySelectorAll('.drop-before, .drop-after, .dragging').forEach(el =>
      el.classList.remove('drop-before', 'drop-after', 'dragging'));
  }

  /* ---------- Place photos ---------- */
  const photoCache = {};
  const ph = { items: [], i: 0 };

  // Photos: load from Wikimedia
  async function loadPlacePhotos(p) {
    const key = `${(+p.lat).toFixed(4)},${(+p.lon).toFixed(4)}`;
    if (photoCache[key]) return photoCache[key];
    const d = await getJSON('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch'
      + `&ggscoord=${p.lat}%7C${p.lon}&ggsradius=400&ggslimit=40&ggsnamespace=6&prop=imageinfo`
      + '&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=960&iiextmetadatafilter=Artist%7CLicenseShortName');
    const words = String(p.name).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
    const items = Object.values((d.query && d.query.pages) || {})
      .filter(x => x.imageinfo && x.imageinfo[0].thumburl && /^image\/(jpeg|png|webp)/.test(x.imageinfo[0].mime))
      .map(x => {
        const i = x.imageinfo[0];
        const m = i.extmetadata || {};
        const title = x.title.toLowerCase();
        return {
          src: i.thumburl,
          thumb: i.thumburl.includes('/thumb/') ? i.thumburl.replace(/\/960px-/, '/250px-') : i.thumburl,
          page: i.descriptionurl,
          artist: ((m.Artist && m.Artist.value) || '').replace(/<[^>]*>/g, '').trim(),
          license: (m.LicenseShortName && m.LicenseShortName.value) || '',
          score: words.filter(w => title.includes(w)).length,
          order: x.index || 0,
        };
      })
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, 12);
    return (photoCache[key] = items);
  }

  // Photos: open gallery
  async function openPhotos(p) {
    if (!p) return;
    $('#photoTitle').textContent = p.name;
    $('#photoBody').innerHTML = '<div class="skel" style="aspect-ratio:3/2;width:100%" aria-label="Loading photos"></div>';
    if (!$('#photoDialog').open) $('#photoDialog').showModal();
    try {
      ph.items = await loadPlacePhotos(p);
    } catch (e) {
      $('#photoBody').innerHTML = `<p class="route-error">Could not load photos. ${esc(e.message)}</p>`;
      return;
    }
    ph.i = 0;
    renderPhotos();
  }

  // Photos: render gallery
  function renderPhotos() {
    const n = ph.items.length;
    if (!n) { $('#photoBody').innerHTML = '<p class="empty-note">No community photos found near this place on Wikimedia Commons yet.</p>'; return; }
    const it = ph.items[ph.i];
    const nav = (cls, d, label) => `<button type="button" class="icon-btn ph-nav ${cls}" data-ph="${d}" aria-label="${label}">${ic('chevron')}</button>`;
    $('#photoBody').innerHTML = `<div class="ph-main"><img src="${esc(it.src)}" alt="Photo near ${esc($('#photoTitle').textContent)}">
        ${n > 1 ? nav('prev', -1, 'Previous photo') + nav('next', 1, 'Next photo') : ''}</div>
      <p class="ph-credit">Photo${it.artist ? ` by ${esc(it.artist)}` : ''}${it.license ? `, ${esc(it.license)}` : ''}. <a href="${esc(it.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>. ${ph.i + 1} of ${n}.</p>
      <div class="ph-strip">${ph.items.map((x, k) => `<button type="button" data-phi="${k}" aria-current="${k === ph.i}" aria-label="Photo ${k + 1}"><img src="${esc(x.thumb)}" alt="" loading="lazy"></button>`).join('')}</div>`;
    const cur = $('.ph-strip [aria-current="true"]');
    if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  // Photos: next/previous
  function stepPhoto(d) {
    if (ph.items.length < 2) return;
    ph.i = (ph.i + d + ph.items.length) % ph.items.length;
    renderPhotos();
  }

  // Theme: dark/light
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $('#themeBtn').innerHTML = t === 'light' ? ic('moon') + ' Dark theme' : ic('sun') + ' Light theme';
    try { localStorage.setItem('waypoint.theme', t); } catch {}
  }

  // Events: attach all listeners
  function bindEvents() {
    let theme = 'dark';
    try { theme = localStorage.getItem('waypoint.theme') || 'dark'; } catch {}
    applyTheme(theme);
    // Theme
    $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
    // Photos gallery
    $('#closePhotos').addEventListener('click', () => $('#photoDialog').close());
    $('#photoDialog').addEventListener('click', e => {
      const n = e.target.closest('[data-ph]');
      const t = e.target.closest('[data-phi]');
      if (n) stepPhoto(+n.dataset.ph);
      else if (t) { ph.i = +t.dataset.phi; renderPhotos(); }
    });
    $('#photoDialog').addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') stepPhoto(1);
      else if (e.key === 'ArrowLeft') stepPhoto(-1);
    });
    // New trip wizard
    $('#newTripBtn').addEventListener('click', openNewPage);
    $('#emptyNew').addEventListener('click', openNewPage);
    $('#newForm').addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) goStep(+g.dataset.go); });
    $('#newClose').addEventListener('click', closeNewPage);
    $('#newForm').addEventListener('submit', createTrip);
    setupAutocomplete($('#ntDest'), $('#ntList'), () => {
      if (!nt.touchedName) $('#ntName').value = `Trip to ${pendingDest.name}`;
      syncPreview();
      renderNew();
    });
    $('#ntDest').addEventListener('input', renderNew);
    $('#ntDest').addEventListener('blur', () => { syncPreview(); setTimeout(() => { $('#ntList').hidden = true; }, 200); });
    $('#ntName').addEventListener('input', e => { nt.touchedName = !!e.target.value.trim(); });
    $('#ntStart').addEventListener('input', e => {
      const v = e.target.value;
      if (v) nt.month = new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, 1);
      renderNew();
    });
    $('#ntDays').addEventListener('input', renderNew);
    $('#ntCal').addEventListener('click', e => {
      const nav = e.target.closest('[data-cal]');
      if (nav) { nt.month = new Date(nt.month.getFullYear(), nt.month.getMonth() + +nav.dataset.cal, 1); renderCal(); return; }
      const day = e.target.closest('[data-d]');
      if (day) { $('#ntStart').value = day.dataset.d; renderNew(); }
    });

    // Trips list
    $('#tripList').addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      if (b) openTrip(b.dataset.id);
    });

    // Trip header (rename, mode, delete)
    $('#tripName').addEventListener('change', e => {
      const v = e.target.value.trim();
      if (!v) { e.target.value = state.trip.name; return; }
      state.trip.name = v;
      touch();
    });

    $('#modeSelect').addEventListener('change', e => {
      state.trip.mode = e.target.value;
      state.reach = null;
      renderReachUI();
      resetRoutes();
    });

    $('#deleteTrip').addEventListener('click', deleteTrip);

    // Login / Sign up / Guest / Logout
    $('#authForm').addEventListener('submit', submitAuth);
    $('#authEmail').addEventListener('input', clearEmailState);
    $('#authEmail').addEventListener('blur', () => { if (document.hasFocus()) checkEmail(); });
    $('#authSeg').addEventListener('click', e => {
      const b = e.target.closest('[data-auth]');
      if (b) setAuthMode(b.dataset.auth);
    });
    $('#forgotBtn').addEventListener('click', resetPassword);
    $('#guestBtn').addEventListener('click', continueAsGuest);
    $('#logoutBtn').addEventListener('click', leaveSession);

    // Account settings
    $('#accountBtn').addEventListener('click', openAccount);
    $('#closeAccount').addEventListener('click', () => $('#accountDialog').close());
    $('#resendVerify').addEventListener('click', resendVerification);
    $('#refreshVerify').addEventListener('click', refreshVerification);
    $('#pwForm').addEventListener('submit', changePassword);
    $('#delForm').addEventListener('submit', deleteAccount);

    // Guest import
    $('#importGo').addEventListener('click', importGuestData);
    $('#importLater').addEventListener('click', () => $('#importDialog').close());

    // Auto-plan
    $('#planForm').addEventListener('submit', runAutoPlan);
    $('#cancelPlan').addEventListener('click', () => $('#planDialog').close());

    // Within reach
    $('#reachGo').addEventListener('click', showReach);
    $('#reachPickBtn').addEventListener('click', pickReachPoint);
    $('#reachClear').addEventListener('click', clearReach);

    // Day tabs
    $('#days').addEventListener('click', e => {
      const b = e.target.closest('[data-day]');
      if (b) setDay(+b.dataset.day);
    });
    $('#addDay').addEventListener('click', () => {
      if (state.trip.days >= 14) return;
      state.trip.days += 1;
      touch();
    });
    $('#removeDay').addEventListener('click', () => {
      const t = state.trip;
      if (t.days <= 1 || dayStops(t.days).length) return;
      t.days -= 1;
      if (state.day > t.days) state.day = t.days;
      touch();
      renderWeather();
    });

    // Panel tabs
    $('#seg').addEventListener('click', e => {
      const b = e.target.closest('[data-panel]');
      if (b) setPanel(b.dataset.panel);
    });

    const panel = $('#panel');

    // Panel clicks
    panel.addEventListener('click', e => {
      const card = e.target.closest('.stop[data-id]');
      if (card && !e.target.closest('button, input, select, label, .grip, .stop-menu')) { focusStop(card.dataset.id); return; }
      const b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const act = b.dataset.act;
      const fav = id => state.favorites.find(f => f.id === id);
      if (act !== 'menu') state.menu = null;
      if (act === 'menu') { state.menu = state.menu === b.dataset.id ? null : b.dataset.id; renderPanel(); }
      else if (act === 'noteOpen') {
        state.noteOpen.add(b.dataset.id);
        renderPanel();
        const n = $(`[data-focus="note-${b.dataset.id}"]`);
        if (n) n.focus();
      }
      else if (act === 'up') moveStop(b.dataset.id, -1);
      else if (act === 'down') moveStop(b.dataset.id, 1);
      else if (act === 'remove') removeStop(b.dataset.id);
      else if (act === 'optimize') optimizeDay();
      else if (act === 'autoplan') openPlanDialog();
      else if (act === 'openDiscover') setPanel('discover');
      else if (act === 'findIndoor') { state.category = 'entertainment.museum'; state.query = ''; state.placesStatus = 'idle'; setPanel('discover'); }
      else if (act === 'findHotel') { state.category = HOTEL_CAT; state.query = ''; state.placesStatus = 'idle'; setPanel('discover'); }
      else if (act === 'clearHotel') clearHotel();
      else if (act === 'setHotel') setHotel(state.places[+b.dataset.i]);
      else if (act === 'hotelFav') setHotel(fav(b.dataset.pid));
      else if (act === 'cat') { state.category = b.dataset.cat; discover(); }
      else if (act === 'add') addPlace(state.places[+b.dataset.i]);
      else if (act === 'addFav') addPlace(fav(b.dataset.pid));
      else if (act === 'photos') openPhotos(state.places[+b.dataset.i]);
      else if (act === 'photosFav') openPhotos(fav(b.dataset.pid));
      else if (act === 'photosStop') openPhotos(stopById(b.dataset.id));
      else if (act === 'fav') toggleFav(state.places[+b.dataset.i]);
      else if (act === 'unfav') toggleFav(fav(b.dataset.pid));
      else if (act === 'favStop') { const s = stopById(b.dataset.id); if (s) toggleFav(stopPlace(s)); }
      else if (act === 'delExp') {
        state.trip.expenses = state.trip.expenses.filter(x => x.id !== b.dataset.id);
        queueSave();
        renderPanel();
      }
    });

    // Panel dropdowns / checkboxes
    panel.addEventListener('change', async e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const t = state.trip;
      const act = el.dataset.act;
      if (act === 'dayStart') { t.dayStart = el.value || '09:00'; queueSave(); renderPanel(); renderMap(); }
      else if (act === 'moveDay') moveStopToDay(el.dataset.id, +el.value);
      else if (act === 'done') {
        const s = stopById(el.dataset.id);
        if (s) { s.done = el.checked; state.stamp = el.checked ? s.id : null; queueSave(); renderPanel(); state.stamp = null; renderMap(); }
      } else if (act === 'minutes') {
        const s = stopById(el.dataset.id);
        if (s) { s.minutes = +el.value || 0; queueSave(); renderPanel(); }
      }
      else if (act === 'radius') { state.radius = +el.value; discover(); }
      else if (act === 'hideUsed') { state.hideUsed = el.checked; discover(); }
      else if (act === 'budget') { t.budget = Math.max(0, parseFloat(el.value) || 0); queueSave(); renderPanel(); }
      else if (act === 'tripCur') { t.tripCurrency = el.value; queueSave(); renderPanel(); }
      else if (act === 'home') {
        t.homeCurrency = el.value;
        queueSave();
        state.rates = null;
        renderPanel();
        await loadRates();
        renderPanel();
      }
    });

    // Panel typing
    panel.addEventListener('input', e => {
      const el = e.target;
      if (el.id === 'placeSearch') {
        state.query = el.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 450);
      } else if (el.dataset && el.dataset.act === 'note') {
        const s = stopById(el.dataset.id);
        if (s) { s.note = el.value; queueSave(); }
      }
    });

    // Panel forms
    panel.addEventListener('submit', e => {
      if (e.target.id === 'placeForm') {
        e.preventDefault();
        clearTimeout(searchTimer);
        runSearch();
        return;
      }
      if (e.target.id !== 'expForm') return;
      e.preventDefault();
      const name = $('#expName').value.trim();
      const amount = parseFloat($('#expAmt').value);
      if (!name || !(amount >= 0)) return;
      state.trip.expenses.push({ id: uid(), name, amount, cat: $('#expCat').value });
      queueSave();
      renderPanel();
    });

    // Drag and drop
    panel.addEventListener('dragstart', e => {
      const g = e.target.closest && e.target.closest('.grip');
      if (!g) return;
      dragId = g.dataset.id;
      const li = g.closest('.stop');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      try { e.dataTransfer.setDragImage(li, 24, 24); } catch {}
      li.classList.add('dragging');
    });
    panel.addEventListener('dragover', e => {
      if (!dragId) return;
      const li = e.target.closest('.stop[data-id]');
      if (!li) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    panel.addEventListener('drop', e => {
      if (!dragId) return;
      const li = e.target.closest('.stop[data-id]');
      if (!li) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      const after = e.clientY >= r.top + r.height / 2;
      const from = dragId;
      dragId = null;
      clearDropMarks();
      dropStop(from, li.dataset.id, after);
    });
    panel.addEventListener('dragend', () => { dragId = null; clearDropMarks(); });

    // Window resize / menu close / print
    window.addEventListener('resize', () => map && map.invalidateSize());

    document.addEventListener('click', e => {
      if (state.menu && !e.target.closest('.stop-menu, [data-act="menu"]')) { state.menu = null; renderPanel(); }
    });
    $('#printBtn').addEventListener('click', () => window.print());
    window.addEventListener('beforeprint', renderPrint);
  }

  /* ---------- Start ---------- */
  // Startup
  async function init() {
    setupMap();
    bindEvents();
    renderSidebar();
    showBanner();
    if (!firebaseReady()) { resumeOrShowAuth(); return; }
    try {
      initFirebase();
    } catch (e) {
      db = null;
      auth = null;
      showBanner(`Firebase error: ${esc(e.message || '')}`);
      resumeOrShowAuth();
    }
  }

  init();
})();
