// ═══════════════════════════════════════════
//  settings.js — Theme & options panel
//  Non-module script so all fns are global
// ═══════════════════════════════════════════

const SETTINGS_KEY = 'tippy10_settings';

const DEFAULT_SETTINGS = {
  theme: 'standard',       // 'standard' | '95'
  compact: false,          // smaller hand cards
  colorblind: false,       // letter labels on cards
  noanimations: false,     // suppress confetti / heavy anims
  showcardcount: false,    // always show opponent card counts
  chatnotify: true,        // sound + popup when a new chat arrives while panel is closed
  mobilemode: 'auto',      // 'auto' | 'on' | 'off' — Mobile layout override
  seasonal: true,          // auto date-bounded seasonal themes (e.g. 4th of July)
};

// ── Seasonal themes ──────────────────────────
// Each entry maps a date window (MM-DD, inclusive) to a body class. The active
// season is auto-detected from today's date and only layers on the STANDARD
// theme. To add a new season later, add a row here + a matching
// `body.season-<id>` CSS block (+ optional moment pools in game.js) — no other
// code changes needed.
//
//   fx      — the ambient particle layer:
//               { type:'burst' }                        classic firework sprite
//               { type:'emoji', chars:[…], drift:'up'|'down' }
//   label   — text for the .season-banner ribbon
//   person  — marks a BIRTHDAY season. A player whose name matches gets the
//             full-screen birthday takeover on round 1 (see ui.js).
//
// ORDER MATTERS: the first matching window wins, so narrow/specific seasons
// (birthdays, holidays) must be listed BEFORE broad ones like Summer Break.
const SEASONS = [
  { id: 'julia', cls: 'season-julia', start: '01-29', end: '02-02',
    label: "💛 Julia's Birthday Edition 💛",
    fx: { type: 'emoji', chars: ['🎂','💛','🎈','✨','🌻'], drift: 'up' },
    person: { name: 'Julia', match: ['julia','jules'] } },

  { id: 'july4', cls: 'season-july4', start: '06-24', end: '07-04',
    label: '🎆 4th of July Edition 🎆',
    fx: { type: 'burst' } },

  { id: 'dan', cls: 'season-dan', start: '09-04', end: '09-08',
    label: '🎂 Dan Reed Birthday Edition 🎂',
    fx: { type: 'emoji', chars: ['🎂','👑','🐝','🎈','💍','🍺'], drift: 'up' },
    person: { name: 'Dan', match: ['dan','danny','daniel','dan reed'] } },

  { id: 'halloween', cls: 'season-halloween', start: '10-15', end: '11-01',
    label: '🎃 Halloween Edition 🎃',
    fx: { type: 'emoji', chars: ['🎃','👻','🦇','🕸️','🍬'], drift: 'down' } },

  { id: 'meg', cls: 'season-meg', start: '11-13', end: '11-17',
    label: "🍁 Meg's Birthday Edition 🍁",
    fx: { type: 'emoji', chars: ['🎂','🍁','🎈','✨','🥧'], drift: 'up' },
    person: { name: 'Meg', match: ['meg','megan','meghan'] } },

  { id: 'christmas', cls: 'season-christmas', start: '12-05', end: '12-26',
    label: '🎄 Christmas Edition 🎄',
    fx: { type: 'emoji', chars: ['❄️','🎄','🎁','⭐','🔔'], drift: 'down' } },

  // Broad catch-all — listed last so July 4th and Dan's birthday win their days.
  { id: 'summer', cls: 'season-summer', start: '05-25', end: '09-03',
    label: '🌴 Summer Break Edition 🌴',
    fx: { type: 'emoji', chars: ['🌴','🌮','🍣','🍔','🕶️','🌊','🍹'], drift: 'up' } },
];

// Preview override via URL: ?season=dan forces a season on (any date),
// ?season=off forces all seasons off. Returns:
//   undefined → no override (use the date schedule)
//   null      → force seasons off
//   season    → force this season on
// Handy for previewing a look outside its window or testing future seasons.
function getSeasonOverride() {
  try {
    const p = new URLSearchParams(window.location.search).get('season');
    if (!p) return undefined;
    if (p === 'off' || p === 'none') return null;
    return SEASONS.find(s => s.id === p) || undefined;
  } catch (e) { return undefined; }
}

// Return the active season for `now`, or null. Handles windows that wrap the
// year boundary (start > end), e.g. a winter season spanning Dec–Jan.
function getActiveSeason(now = new Date()) {
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + '-' +
               String(now.getDate()).padStart(2, '0');
  for (const s of SEASONS) {
    const inRange = s.start <= s.end
      ? (mmdd >= s.start && mmdd <= s.end)
      : (mmdd >= s.start || mmdd <= s.end);
    if (inRange) return s;
  }
  return null;
}

// The season currently painted on <body> (null when none). Everything else in
// the app keys off this rather than re-deriving dates.
function activeSeasonDef() {
  if (typeof document === 'undefined') return null;
  return SEASONS.find(s => document.body.classList.contains(s.cls)) || null;
}

// ── Public season helpers (used by game.js / ui.js / solo.js) ──
window.getActiveSeasonId = function() { const s = activeSeasonDef(); return s ? s.id : null; };
/** The birthday person for the active season, or null. */
window.getSeasonPerson  = function() { const s = activeSeasonDef(); return (s && s.person) ? s.person : null; };
/** True when `name` is the guest of honour of the active birthday season. */
window.isSeasonBirthdayName = function(name) {
  const person = window.getSeasonPerson();
  if (!person || !name) return false;
  const n = String(name).trim().toLowerCase();
  return (person.match || []).some(m => n === m || n.startsWith(m + ' '));
};

// ── Dynamic season particles ──
// While a season is active, continuously spawn small effects at random
// positions inside whichever season layers are currently visible. Ambient
// layers (lobby / game) get a gentle trickle; win layers get a denser show.
function spawnSeasonBurst(layer, big, season) {
  const fx = (season && season.fx) || { type: 'burst' };

  if (fx.type === 'emoji') {
    const el = document.createElement('span');
    const falling = fx.drift === 'down';
    el.className = 'sfx-emoji' + (falling ? ' sfx-fall' : '');
    const chars = fx.chars && fx.chars.length ? fx.chars : ['✨'];
    el.textContent = chars[Math.floor(Math.random() * chars.length)];
    el.style.left = (2 + Math.random() * 94) + '%';
    el.style.top  = falling ? '-10%' : (50 + Math.random() * 45) + '%';
    el.style.fontSize = Math.round((big ? 22 : 15) + Math.random() * 14) + 'px';
    el.style.setProperty('--sfx-drift', Math.round(Math.random() * 70 - 35) + 'px');
    el.style.animationDuration = ((big ? 3.4 : 4.4) + Math.random() * 2).toFixed(2) + 's';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 7200);
    return;
  }

  const fw = document.createElement('span');
  fw.className = 'fw' + (Math.random() < 0.45 ? ' fw-warm' : '');
  fw.style.left = (4 + Math.random() * 92) + '%';
  fw.style.top  = (4 + Math.random() * (big ? 82 : 62)) + '%';
  fw.style.setProperty('--fw-max', ((big ? 1.2 : 0.8) + Math.random() * 0.7).toFixed(2));
  fw.style.animationDelay = (Math.random() * 0.2).toFixed(2) + 's';
  layer.appendChild(fw);
  setTimeout(() => fw.remove(), 2600);
}
function tickSeasonFireworks() {
  const b = document.body;
  if (b.classList.contains('opt-noanimations')) return;
  const season = activeSeasonDef();
  if (!season) return;
  document.querySelectorAll('.season-fw').forEach(layer => {
    if (layer.offsetParent === null) return;          // not on the visible screen
    const big = layer.classList.contains('season-fw-win');
    const n = big ? 1 + (Math.random() < 0.5 ? 1 : 0) // 1–2 per tick on win screens
                  : (Math.random() < 0.4 ? 1 : 0);    // occasional burst in-game/lobby
    for (let i = 0; i < n; i++) spawnSeasonBurst(layer, big, season);
  });
}
if (typeof document !== 'undefined') {
  setInterval(tickSeasonFireworks, 1300);
}

// ── Mobile auto-detect ──
// Coarse pointer (finger) OR narrow viewport (< 768px) counts as mobile.
function isLikelyMobile() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch (e) {}
  return window.innerWidth < 768;
}

// ── Load saved settings ──────────────────────
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch(e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch(e) {}
}

// ── Current settings (module-level) ─────────
let _settings = loadSettings();

// ── Apply everything to <body> ───────────────
function applyAllSettings() {
  const b = document.body;

  // Theme
  b.classList.remove('theme-standard', 'theme-95');
  b.classList.add('theme-' + (_settings.theme || 'standard'));

  // Options as body classes
  b.classList.toggle('opt-compact',       !!_settings.compact);
  b.classList.toggle('opt-colorblind',    !!_settings.colorblind);
  b.classList.toggle('opt-noanimations',  !!_settings.noanimations);
  b.classList.toggle('opt-showcardcount', !!_settings.showcardcount);

  // Mobile layout — auto-detect when 'auto', otherwise honour the override
  const mode = _settings.mobilemode || 'auto';
  const effectiveMobile = mode === 'on' ? true
                        : mode === 'off' ? false
                        : isLikelyMobile();
  b.classList.toggle('opt-mobile', effectiveMobile);

  // Scanline overlay visibility
  const scanline = document.getElementById('scanline-overlay');
  if (scanline) scanline.style.display = _settings.theme === '95' ? 'block' : 'none';

  // ── Seasonal theme (auto, date-bounded) ──
  // Clear any previous season class, then apply the current one — but only
  // when seasonal themes are enabled AND the base theme is standard.
  SEASONS.forEach(s => b.classList.remove(s.cls));
  const onStandard = (_settings.theme || 'standard') === 'standard';
  const override = getSeasonOverride();
  let activeSeason = null;
  if (override !== undefined) {
    // Explicit URL override: bypasses the date schedule and the toggle.
    if (override && onStandard) activeSeason = override;
  } else if (_settings.seasonal !== false && onStandard) {
    activeSeason = getActiveSeason();
  }
  if (activeSeason) b.classList.add(activeSeason.cls);
  // Generic hook so shared season chrome (particle layers, banner, festive
  // icons) can be styled once instead of per-season.
  b.classList.toggle('season-on', !!activeSeason);
  // Banner ribbon text (win + round-end screens)
  document.querySelectorAll('.season-banner span').forEach(el => {
    if (activeSeason) el.textContent = activeSeason.label;
  });
}

// Re-evaluate mobile mode when the viewport changes (only matters in 'auto')
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if ((_settings.mobilemode || 'auto') === 'auto') applyAllSettings();
  });
}

// ── Sync panel UI to current settings ────────
function syncPanelUI() {
  // Theme radios — locked for non-hosts when a game is active
  const inGame = window.getInGame?.();
  const isHost = window.getIsHost?.();
  const locked = !!(inGame && !isHost);

  const radios = document.querySelectorAll('input[name="theme"]');
  radios.forEach(r => {
    r.checked  = (r.value === _settings.theme);
    r.disabled = locked;
  });

  // Show/hide the "Host only" lock note in the panel header
  const lockNote = document.getElementById('theme-host-note');
  if (lockNote) lockNote.style.display = locked ? '' : 'none';

  // Checkboxes
  const checkboxMap = {
    'opt-compact':       'compact',
    'opt-colorblind':    'colorblind',
    'opt-noanimations':  'noanimations',
    'opt-showcardcount': 'showcardcount',
    'opt-chatnotify':    'chatnotify',
    'opt-seasonal':      'seasonal',
  };
  for (const [id, key] of Object.entries(checkboxMap)) {
    const el = document.getElementById(id);
    if (el) el.checked = !!_settings[key];
  }

  // Mobile-mode radio group
  const mode = _settings.mobilemode || 'auto';
  document.querySelectorAll('input[name="mobilemode"]').forEach(r => {
    r.checked = (r.value === mode);
  });
  // Sync the fullscreen button — three cases:
  //   1) Already running as installed PWA (standalone)  → show "Running fullscreen"
  //   2) Browser supports requestFullscreen              → toggle Enter/Exit Fullscreen
  //   3) Otherwise (iOS Safari mostly)                   → show Add-to-Home-Screen hint
  syncFullscreenUi();
}

function syncFullscreenUi() {
  const fsBtn = document.getElementById('btn-toggle-fullscreen');
  const hint  = document.getElementById('install-hint');
  if (!fsBtn || !hint) return;

  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                  || window.navigator.standalone === true;
  const docEl = document.documentElement;
  const fsSupported = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen);
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const ua   = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && 'ontouchend' in document);

  if (standalone) {
    fsBtn.textContent = '✓ Running as installed app';
    fsBtn.disabled = true;
    fsBtn.classList.add('fullscreen-btn-disabled');
    hint.style.display = 'none';
    return;
  }
  fsBtn.disabled = false;
  fsBtn.classList.remove('fullscreen-btn-disabled');

  if (fsSupported) {
    fsBtn.textContent = inFs ? 'Exit Fullscreen' : 'Enter Fullscreen';
    // Still suggest install for the best mobile feel
    if (isIos) {
      hint.style.display = '';
      hint.innerHTML = 'For the full app feel on iOS, tap the Share button <span class="hint-icon">⬆︎</span> in Safari and choose <strong>Add to Home Screen</strong>.';
    } else {
      hint.style.display = 'none';
    }
  } else {
    // iOS Safari: requestFullscreen isn't available at all. Reframe the button.
    fsBtn.textContent = '📱 Install for Fullscreen';
    fsBtn.disabled = true;
    fsBtn.classList.add('fullscreen-btn-disabled');
    hint.style.display = '';
    if (isIos) {
      hint.innerHTML = 'iOS doesn\'t allow fullscreen in Safari. To play fullscreen, tap the Share button <span class="hint-icon">⬆︎</span> at the bottom of Safari and choose <strong>Add to Home Screen</strong>.';
    } else {
      hint.innerHTML = 'Your browser doesn\'t support fullscreen. Try installing the app from your browser menu.';
    }
  }
}

// ── Public: called by theme radio onchange ───
window.applyTheme = function(value) {
  // During an active game, only the host may change the theme
  if (window.getInGame?.() && !window.getIsHost?.()) {
    syncPanelUI(); // snap radio back to current setting
    return;
  }
  _settings.theme = value;
  saveSettings(_settings);
  applyAllSettings();
  // Broadcast to all players via Firebase (host only)
  if (window.setRoomTheme) window.setRoomTheme(value);
};

// ── Public: receive theme change broadcast from Firebase ──
//   Called by game.js handleRoomUpdate for all players (including host, idempotent)
window.applyThemeFromFirebase = function(theme) {
  if (_settings.theme === theme) return; // no change
  _settings.theme = theme;
  saveSettings(_settings);
  applyAllSettings();
  syncPanelUI();
};

// ── Public: called by toggle checkboxes ──────
window.applyOption = function(key, value) {
  _settings[key] = value;
  saveSettings(_settings);
  applyAllSettings();
};

// ── Public: toggle settings panel ────────────
window.toggleSettingsPanel = function() {
  const overlay = document.getElementById('settings-overlay');
  if (!overlay) return;
  const isOpen = overlay.classList.contains('open');
  if (isOpen) {
    overlay.classList.remove('open');
  } else {
    syncPanelUI();
    overlay.classList.add('open');
  }
};

// ── Public: close if user clicked backdrop ───
window.closeSettingsPanelIfBg = function(e) {
  if (e.target === document.getElementById('settings-overlay')) {
    document.getElementById('settings-overlay').classList.remove('open');
  }
};

// ── Public: expose settings for other scripts ─
window.getSettings = function() { return { ..._settings }; };

// ── Public: Fullscreen API toggle (used from the settings panel) ─
window.toggleFullscreen = function() {
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  try {
    if (inFs) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  } catch (e) {
    // Some browsers (notably iOS Safari) don't support the Fullscreen API.
    // PWA install ("Add to Home Screen") gives them a similar full-screen
    // experience — the LAYOUT settings already cover mobile-friendly UI.
  }
};

// Keep the Fullscreen button label in sync if the user exits via Esc
if (typeof document !== 'undefined') {
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => {
    document.addEventListener(ev, () => syncFullscreenUi());
  });

  // iOS Safari respects the viewport meta + these gesture handlers together to
  // block pinch-zoom. Without them, players accidentally zoom in mid-game.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  });
}

// ── Init on DOM ready ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyAllSettings();
  syncPanelUI();
});
// Also run immediately in case DOM is already loaded
applyAllSettings();
