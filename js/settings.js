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
// theme. To add a new season later, just add a row here + a matching
// `body.season-<id>` CSS block — no other code changes needed.
const SEASONS = [
  { id: 'july4', cls: 'season-july4', start: '06-24', end: '07-04' },
];

// Preview override via URL: ?season=july4 forces a season on (any date),
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
  if (override !== undefined) {
    // Explicit URL override: bypasses the date schedule and the toggle.
    if (override && onStandard) b.classList.add(override.cls);
  } else if (_settings.seasonal !== false && onStandard) {
    const season = getActiveSeason();
    if (season) b.classList.add(season.cls);
  }
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
