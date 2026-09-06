// ═══════════════════════════════════════════
//  ui.js  — DOM rendering helpers
// ═══════════════════════════════════════════

import { renderCard, PHASES, firebaseToArray } from './cards.js';
import { updateActionButtons, applySortMode } from './game.js';

// ── Screen switcher ──
export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = document.getElementById(`screen-${name}`);
  if (el) {
    el.style.display = 'flex';
    el.classList.add('active');
  }
  if (name === 'waiting') startGallery();
  else stopGallery();
}

// ── Tippy gallery (waiting room slideshow) ──
const GALLERY = [
  { src: 'images/tippy/tippy-hero.jpeg',       caption: 'Tippy is ready to play! 🐾' },
  { src: 'images/tippy/tippy-donut.jpeg',      caption: 'Tippy spotted through a donut hole 🍩' },
  { src: 'images/tippy/tippy-alert.jpeg',      caption: 'Tippy says: hurry up and join! 👀' },
  { src: 'images/tippy/tippy-yawn.jpeg',       caption: 'Tippy\'s reaction to slow players 🥱' },
  { src: 'images/tippy/tippy-closeup.jpeg',    caption: 'Tippy monitoring your every move 👀' },
  { src: 'images/tippy/tippy-happy.jpeg',      caption: 'Tippy approves of this game 😛' },
  { src: 'images/tippy/tippy-upsidedown.jpeg', caption: 'Tippy says your strategy is upside down 🙃' },
  { src: 'images/tippy/tippy-burrito.jpeg',    caption: 'Tippy warming up for a big round 🌯' },
  { src: 'images/tippy/tippy-sideeye.jpeg',    caption: 'Tippy giving maximum side-eye 😑' },
  { src: 'images/tippy/tippy-peering.jpeg',    caption: 'Tippy watching everyone\'s cards 👁️' },
  { src: 'images/tippy/tippy-pinkblanket.jpeg',caption: 'Tippy lurking under the pink blanket 🩷' },
  { src: 'images/tippy/tippy-carseat.jpeg',    caption: 'Tippy is pumped for game night 😛' },
  { src: 'images/tippy/tippy-park.jpeg',       caption: 'Tippy getting some air between rounds 🌿' },
  { src: 'images/tippy/tippy-blanket.jpeg',    caption: 'Tippy in his thinking pose… 🧠' },
  { src: 'images/tippy/tippy-window.jpeg',     caption: 'Tippy looking for faster players 🔭' },
  { src: 'images/tippy/tippy-flopped.jpeg',    caption: 'Tippy done with everyone\'s bad plays 😑' },
  { src: 'images/tippy/tippy-faceplant.jpeg',  caption: 'Tippy passed out waiting for you 💤' },
  { src: 'images/tippy/tippy-lick.jpeg',       caption: 'Tippy judging your card choices 👅' },
  { src: 'images/tippy/tippy-car.jpeg',        caption: 'Tippy rode all the way here for this 🚗' },
  { src: 'images/tippy/tippy-sidewalk.jpeg',   caption: 'Tippy on patrol, not impressed 🚶' },
  { src: 'images/tippy/tippy-standup.jpeg',    caption: 'Tippy demands you play your card 🐾' },
  { src: 'images/tippy/tippy-peeking.jpeg',    caption: 'Tippy peeking to see if it\'s your turn yet 🚗' },
  { src: 'images/tippy/tippy-sleep.jpeg',      caption: 'Tippy will nap while you take forever 😴' },
  { src: 'images/tippy/tippy-cone.jpeg',       caption: 'Last place gets the cone of shame 🏆😂' },
  { src: 'images/tippy2/tippy2-staredown.jpeg', caption: 'The pre-game staredown 👀' },
  { src: 'images/tippy2/tippy2-daisy.jpeg',     caption: 'Tippy in his flower era 🌼' },
  { src: 'images/tippy2/tippy2-zoomies.jpeg',   caption: 'Zoomies activated — game on! 💨' },
  { src: 'images/tippy2/tippy2-pumpkin.jpeg',   caption: 'Tippy the pug-o-lantern 🎃' },
  { src: 'images/tippy2/tippy2-lifejacket.jpeg',caption: 'Captain Tippy reporting for duty ⛵' },
  { src: 'images/tippy2/tippy2-sweaters.jpeg',  caption: 'The official Tippy fan club 🧶' },
  { src: 'images/tippy2/tippy2-brewery.jpeg',   caption: 'Tippy out with the crew 🍻' },
  { src: 'images/tippy2/tippy2-cot.jpeg',       caption: 'Tippy surveys his kingdom 👑' },
  { src: 'images/tippy2/tippy2-selfie.jpeg',    caption: 'Tippy photobombing the selfie 🤳' },
  { src: 'images/tippy2/tippy2-squish.jpeg',    caption: 'Tippy unimpressed with your shuffle 😒' },
  { src: 'images/tippy2/tippy2-slipper.jpeg',   caption: 'Tippy found contraband 🥾' },
  { src: 'images/tippy2/tippy2-donutbed.jpeg',  caption: 'Tippy flopped mid-strategy session 🫠' },
  { src: 'images/tippy2/tippy2-sunspot.jpeg',   caption: 'Tippy recharging in the sun ☀️' },
  { src: 'images/tippy2/tippy2-parkpets.jpeg',  caption: 'Tippy collecting park pets 🌳' },
  { src: 'images/tippy2/tippy2-blanketnap.jpeg',caption: 'Tippy tucked in for the night 🛌' },
  { src: 'images/tippy2/tippy2-smoosh.jpeg',    caption: 'Maximum smoosh achieved 😴' },
  { src: 'images/tippy2/tippy2-bigbed.jpeg',    caption: 'One pug, one entire bed 🛏️' },
  { src: 'images/tippy2/tippy2-naptime.jpeg',   caption: 'Naps between rounds are mandatory 💤' },
  { src: 'images/tippy2/tippy2-polaroid.jpeg',  caption: 'Vintage Tippy, certified classic 📸' },
  { src: 'images/tippy2/tippy2-carrier.jpeg',   caption: 'Tippy travels for game night ✈️' },
];
// ── Seasonal galleries ──
// A season listed here takes over the waiting-room slideshow entirely;
// anything not listed keeps the standard Tippy reel.
const SEASON_GALLERY = {
  dan: [
    { src: 'images/dan/dan-couch.jpeg',   caption: "It's Dan's birthday — the table is his 🎂" },
    { src: 'images/dan/dan-balcony.jpeg', caption: 'The birthday boy and his co-host 🍺🐾' },
    { src: 'images/dan/dan-wedding.jpeg', caption: 'Dan will now officiate this card game 💍' },
    { src: 'images/dan/dan-couch.jpeg',   caption: 'Tippy has already picked a side 🐾' },
    { src: 'images/dan/dan-balcony.jpeg', caption: "Reed 'em and weep 😎" },
    { src: 'images/dan/dan-wedding.jpeg', caption: 'Who run the world? Dan 👑🐝' },
  ],
  halloween: [
    { src: 'images/tippy2/tippy2-pumpkin.jpeg',   caption: 'Tippy the pug-o-lantern 🎃' },
    { src: 'images/tippy/tippy-peeking.jpeg',     caption: 'Something is watching you… 👻' },
    { src: 'images/tippy2/tippy2-staredown.jpeg', caption: 'The spooky staredown 🦇' },
    { src: 'images/tippy/tippy-closeup.jpeg',     caption: 'Trick or treat? 🍬' },
    { src: 'images/tippy2/tippy2-blanketnap.jpeg',caption: 'Tippy in his ghost costume 👻' },
  ],
  christmas: [
    { src: 'images/tippy2/tippy2-sweaters.jpeg',  caption: 'Matching holiday sweaters 🧶' },
    { src: 'images/tippy/tippy-blanket.jpeg',     caption: 'Tippy is on the nice list 🎄' },
    { src: 'images/tippy2/tippy2-naptime.jpeg',   caption: 'Visions of sugarplums 💤' },
    { src: 'images/tippy/tippy-pinkblanket.jpeg', caption: 'Waiting up for Santa 🎁' },
    { src: 'images/tippy2/tippy2-donutbed.jpeg',  caption: 'Tippy after Christmas dinner 🫠' },
  ],
  summer: [
    { src: 'images/tippy2/tippy2-lifejacket.jpeg',caption: 'Captain Tippy, summer edition ⛵' },
    { src: 'images/tippy2/tippy2-sunspot.jpeg',   caption: 'Beach house, obviously ☀️' },
    { src: 'images/tippy/tippy-car.jpeg',         caption: 'Taco run — everybody in 🌮' },
    { src: 'images/tippy2/tippy2-brewery.jpeg',   caption: 'Summer Break house party 🍹' },
    { src: 'images/tippy/tippy-park.jpeg',        caption: 'Animal Style, extra fries 🍔' },
    { src: 'images/tippy2/tippy2-daisy.jpeg',     caption: 'Tippy in his summer era 🌴' },
  ],
};
function activeSeasonId() {
  try { return window.getActiveSeasonId ? window.getActiveSeasonId() : null; } catch (e) { return null; }
}

// ── Taped polaroid ──
// A photo taped to the corner of the table during a photo season. The picture
// changes each round, so a whole game shows the whole set. Whole photos only —
// they're framed 3:4, the shape the pictures already are, so nothing gets
// cropped down to a face.
const SEASON_POLAROID = {
  dan: [
    { src: 'images/dan/dan-couch.jpeg',   caption: 'Dan & Tippy, HQ' },
    { src: 'images/dan/dan-balcony.jpeg', caption: 'Rooftop shift 🍺' },
    { src: 'images/dan/dan-wedding.jpeg', caption: 'Officiant Dan 💍' },
  ],
};
function updateSeasonPolaroid(data) {
  const fig = document.getElementById('season-polaroid');
  if (!fig) return;
  const pool = SEASON_POLAROID[activeSeasonId()];
  if (!pool || !pool.length) return;
  const pick = pool[(((data && data.handNum) || 1) - 1) % pool.length];
  const img = document.getElementById('season-polaroid-img');
  const cap = document.getElementById('season-polaroid-cap');
  if (img && !img.src.endsWith(pick.src)) { img.src = pick.src; img.alt = pick.caption; }
  if (cap) cap.textContent = pick.caption;
}
function galleryPool() {
  const id = activeSeasonId();
  const pool = id && SEASON_GALLERY[id];
  return (pool && pool.length) ? pool : GALLERY;
}

let _galleryIdx = 0;
let _galleryTimer = null;
let _galleryPending = null;

function startGallery() {
  _galleryIdx = 0;
  updateGallery();
  _galleryTimer = setInterval(() => {
    _galleryIdx = (_galleryIdx + 1) % galleryPool().length;
    updateGallery();
  }, 3500);
}

function stopGallery() {
  if (_galleryTimer) { clearInterval(_galleryTimer); _galleryTimer = null; }
  // Cancel any in-flight preload so stale onload doesn't fire after stop
  if (_galleryPending) { _galleryPending.onload = null; _galleryPending = null; }
}

function updateGallery() {
  const img = document.getElementById('gallery-img');
  const cap = document.getElementById('gallery-caption');
  if (!img || !cap) return;
  const pool = galleryPool();
  const { src, caption } = pool[_galleryIdx % pool.length];
  // Cancel any previous in-flight preload
  if (_galleryPending) { _galleryPending.onload = null; _galleryPending = null; }
  // Preload the new image; only swap src + caption together once it's ready
  const preload = new Image();
  _galleryPending = preload;
  preload.onload = () => {
    if (_galleryPending !== preload) return; // superseded by a later call
    _galleryPending = null;
    img.classList.remove('gallery-fade-in');
    void img.offsetWidth; // force reflow for CSS transition
    img.src = src;
    cap.textContent = caption;
    img.classList.add('gallery-fade-in');
  };
  preload.onerror = () => {
    // Still update on error so the slideshow doesn't stall
    if (_galleryPending !== preload) return;
    _galleryPending = null;
    img.src = src;
    cap.textContent = caption;
  };
  preload.src = src;
}

// ── Tippy popup (shown to all players via Firebase broadcast) ──
let _popupTimer = null;
let _popupDismissalInit = false;

function _dismissTippyPopup() {
  const popup = document.getElementById('tippy-popup');
  if (popup) popup.classList.remove('show');
  if (_popupTimer) { clearTimeout(_popupTimer); _popupTimer = null; }
}

// Wire up tap-to-dismiss (any device) and swipe-to-dismiss (touch only).
// Idempotent — only installs listeners once.
function _initPopupDismissal() {
  if (_popupDismissalInit) return;
  const popup = document.getElementById('tippy-popup');
  if (!popup) return;
  _popupDismissalInit = true;

  // Click / tap anywhere on the popup to dismiss
  popup.addEventListener('click', _dismissTippyPopup);

  // Swipe in any direction (>30px) to dismiss on touch devices
  let startX = 0, startY = 0, startT = 0;
  popup.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = Date.now();
  }, { passive: true });
  popup.addEventListener('touchend', (e) => {
    if (!e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt = Date.now() - startT;
    // Swipe = >30px movement, OR quick flick (>20px in <300ms)
    if (dist > 30 || (dist > 20 && dt < 300)) {
      _dismissTippyPopup();
    }
  }, { passive: true });
}

export function showTippyPopup(text, img) {
  const popup = document.getElementById('tippy-popup');
  const imgEl = document.getElementById('tippy-popup-img');
  const txt   = document.getElementById('tippy-popup-text');
  if (!popup) return;
  _initPopupDismissal();
  imgEl.src = img || 'images/tippy/tippy-happy.jpeg';
  txt.textContent = text || '🐾 Woof!';
  popup.classList.add('show');
  if (_popupTimer) clearTimeout(_popupTimer);
  // 2.5s feels snappy — long enough to read, short enough not to block content
  _popupTimer = setTimeout(_dismissTippyPopup, 2500);
}

// ── Round-end scoring screen ──
export function showRoundEndScreen(data, localState) {
  showScreen('round-end');
  const order   = firebaseToArray(data.playerOrder || []);
  const summary = data.roundSummary || {};
  const goOutPid    = summary.goOutPlayer;
  const scoreDeltas = summary.scoreDeltas || {};
  const completedPhase = summary.completedPhase || {};
  const prevPhase   = summary.prevPhase || {};

  // Who went out
  const goOutPlayer = goOutPid ? data.players?.[goOutPid] : null;
  const goOutEl = document.getElementById('round-end-goout');
  goOutEl.textContent = goOutPlayer
    ? `${goOutPlayer.icon || '🐾'} ${goOutPlayer.name} went out!`
    : 'Round complete!';

  // Sort players by rank (highest phase, then lowest score)
  const sorted = [...order].sort((a, b) => {
    const pa = data.players[a], pb = data.players[b];
    const phaseA = pa.phase || 1, phaseB = pb.phase || 1;
    if (phaseB !== phaseA) return phaseB - phaseA;
    return (pa.score || 0) - (pb.score || 0);
  });
  const myRank = sorted.indexOf(localState.playerId);
  const total  = sorted.length;

  // Pick photo + caption based on how I placed. Winning the round (going out,
  // or sitting top of the table) gets the celebration slot — during a season
  // that's where the seasonal payoff lands, e.g. "DANTASTIC job!".
  const wonRound = (goOutPid === localState.playerId) || myRank === 0;
  const bucket = wonRound ? 'first'
               : myRank === total - 1 ? 'last'
               : myRank < total / 2 ? 'upper'
               : 'lower';
  const STANDARD_ROUND_END = {
    first: { img: 'images/tippy/tippy-happy.jpeg', caption: '🐾 Tippy says you\'re crushing it!' },
    last:  { img: 'images/tippy/tippy-cone.jpeg',  caption: '😂 Cone of shame... but there\'s still time!' },
    upper: { img: 'images/tippy/tippy-alert.jpeg', caption: '👀 Tippy is watching your every move!' },
    lower: { img: 'images/tippy/tippy-yawn.jpeg',  caption: '🥱 Tippy is not impressed...' },
  };
  const SEASON_ROUND_END = {
    dan: {
      first: { img: 'images/dan/dan-couch.jpeg',   caption: '🎂 DANTASTIC job!' },
      last:  { img: 'images/dan/dan-wedding.jpeg', caption: '💍 Dan objects to that performance.' },
      upper: { img: 'images/dan/dan-balcony.jpeg', caption: '😎 Reed \'em and weep — you\'re climbing.' },
      lower: { img: 'images/dan/dan-couch.jpeg',   caption: '🛋️ Dan and Tippy are unbothered. You should be worried.' },
    },
    halloween: {
      first: { img: 'images/tippy2/tippy2-pumpkin.jpeg', caption: '🎃 King of the pumpkin patch!' },
      last:  { img: 'images/tippy/tippy-cone.jpeg',      caption: '👻 Spooky. And not in a good way.' },
      upper: { img: 'images/tippy2/tippy2-staredown.jpeg',caption: '🦇 Creeping up the standings…' },
      lower: { img: 'images/tippy/tippy-sideeye.jpeg',   caption: '🕸️ Tangled up back here, huh?' },
    },
    christmas: {
      first: { img: 'images/tippy2/tippy2-sweaters.jpeg', caption: '🎄 Straight to the top of the nice list!' },
      last:  { img: 'images/tippy/tippy-cone.jpeg',       caption: '🪨 Naughty list. Enjoy the coal.' },
      upper: { img: 'images/tippy/tippy-blanket.jpeg',    caption: '🎁 Something good is coming…' },
      lower: { img: 'images/tippy2/tippy2-naptime.jpeg',  caption: '❄️ Cold out here in last place.' },
    },
    summer: {
      first: { img: 'images/tippy2/tippy2-zoomies.jpeg',  caption: '🌴 Summer Break MVP!' },
      last:  { img: 'images/tippy/tippy-cone.jpeg',       caption: '🍔 No fries for you.' },
      upper: { img: 'images/tippy2/tippy2-sunspot.jpeg',  caption: '🍹 Cruising. Order another round.' },
      lower: { img: 'images/tippy/tippy-yawn.jpeg',       caption: '🌮 Taco \'bout a rough round.' },
    },
    july4: {
      first: { img: 'images/tippy/tippy-happy.jpeg',   caption: '🎆 Grand finale performance!' },
      last:  { img: 'images/tippy/tippy-cone.jpeg',    caption: '🧨 All fizzle, no bang.' },
      upper: { img: 'images/tippy/tippy-standup.jpeg', caption: '🇺🇸 Tippy salutes your climb!' },
      lower: { img: 'images/tippy/tippy-yawn.jpeg',    caption: '🥱 Dud firework of a round.' },
    },
  };
  const seasonId  = activeSeasonId();
  const seasonSet = (seasonId && SEASON_ROUND_END[seasonId]) || {};
  const pick = seasonSet[bucket] || STANDARD_ROUND_END[bucket];
  const tippyImg     = pick.img;
  const tippyCaption = pick.caption;
  document.getElementById('round-end-tippy-img').src     = tippyImg;
  document.getElementById('round-end-tippy-caption').textContent = tippyCaption;

  // Score table
  const scoresEl = document.getElementById('round-end-scores');
  scoresEl.innerHTML = '';
  sorted.forEach((pid, rank) => {
    const p     = data.players[pid];
    const delta = scoreDeltas[pid] ?? 0;
    const phase = Math.min(p.phase || 1, 10);
    const didComplete = completedPhase[pid];
    const prev  = prevPhase[pid] || phase;

    const row = document.createElement('div');
    row.className = 'round-score-row' + (rank === 0 ? ' round-leader' : '');

    const deltaText  = delta === 0 ? '+0 pts ✓' : `+${delta} pts`;
    const deltaClass = 'round-score-delta' + (delta === 0 ? ' zero-delta' : '');
    const phaseLabel = didComplete ? `Phase ${prev} ✓ → ${phase}` : `Phase ${phase}`;

    row.innerHTML = `
      <span class="round-score-player">${p.icon || '🎮'} ${p.name}</span>
      <span class="round-score-phase">${phaseLabel}</span>
      <span class="${deltaClass}">${deltaText}</span>
      <span class="round-score-total">${p.score || 0} total</span>
    `;
    scoresEl.appendChild(row);
  });

  // Show start button to host, waiting message to others
  const btnNext   = document.getElementById('btn-next-round');
  const waitingEl = document.getElementById('round-end-waiting');
  if (localState.isHost) {
    btnNext.style.display   = '';
    waitingEl.style.display = 'none';
  } else {
    btnNext.style.display   = 'none';
    waitingEl.style.display = '';
  }
}

// ── Message toast ──
let _msgTimer = null;
export function showMessage(text, duration = 3000) {
  const el = document.getElementById('game-message');
  el.textContent = text;
  el.classList.add('show');
  if (_msgTimer) clearTimeout(_msgTimer);
  _msgTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Phase card visualization (mini card rectangles) ──
function renderPhaseVisual(phaseObj) {
  if (!phaseObj) return '';
  return phaseObj.parts.map(part => {
    let cards = '';
    for (let i = 0; i < part.count; i++) {
      let label = '';
      if (part.type === 'run')   label = (i + 1).toString();
      else if (part.type === 'set')   label = '=';
      else if (part.type === 'color') label = '♦';
      cards += `<span class="mini-card mini-card-${part.type}">${label}</span>`;
    }
    const typeLabel = { set: `Set ${part.count}`, run: `Run ${part.count}`, color: `Color ${part.count}` }[part.type];
    return `<span class="phase-visual-group"><span class="phase-visual-cards">${cards}</span><span class="phase-visual-label">${typeLabel}</span></span>`;
  }).join('<span class="phase-visual-plus">+</span>');
}

// ── Track previous turn for "your turn!" notification ──
let _prevTurn = null;

// ── Pick-up animation ──
// Briefly pulses a glow on whichever pile a player drew from, so everyone can
// see at a glance whether the draw came from the Draw pile or the Discard pile.
// `source` is 'draw' or 'discard'.
export function playPickupAnimation(source) {
  if (document.body.classList.contains('opt-noanimations')) return;
  const pile = document.getElementById(source === 'discard' ? 'discard-pile' : 'draw-pile');
  if (!pile) return;
  // Glow the inner card element so the highlight hugs the card's shape
  const target = pile.querySelector('.pile-back, .discard-top-card') || pile;
  target.classList.remove('pickup-glow');
  void target.offsetWidth;            // force reflow so the animation restarts
  target.classList.add('pickup-glow');
  setTimeout(() => target.classList.remove('pickup-glow'), 1000);
}

// ── Render full board ──
export function renderBoard(data, localState) {
  const myId  = localState.playerId;

  // HUD
  document.getElementById('hud-room').textContent = localState.roomCode;
  const myPlayer = data.players?.[myId];
  const phaseNum = Math.min(myPlayer?.phase || 1, 10);
  const phaseObj = PHASES[phaseNum - 1];
  document.getElementById('hud-phase').textContent = phaseNum;
  // Phase visual lives in the player-info-bar next to the player's name.
  const myPhaseNum  = document.getElementById('my-phase-num');
  const myPhaseDesc = document.getElementById('my-phase-desc');
  if (myPhaseNum)  myPhaseNum.textContent = phaseNum;
  if (myPhaseDesc) myPhaseDesc.innerHTML  = `<span class="phase-visual">${renderPhaseVisual(phaseObj)}</span>`;
  const myNameText = document.getElementById('my-name-text');
  if (myNameText) {
    myNameText.textContent = (myPlayer?.icon || '') + ' ' + (myPlayer?.name || '');
  } else {
    // Fallback for older markup without the name/score split
    document.getElementById('my-name-display').textContent =
      (myPlayer?.icon || '') + ' ' + (myPlayer?.name || '');
  }
  const myScoreText = document.getElementById('my-score-text');
  if (myScoreText) myScoreText.textContent = `${myPlayer?.score || 0} pts`;

  // ── Turn indicator ──
  const isMyTurn    = data.currentTurn === myId;
  const turnChanged = data.currentTurn !== _prevTurn;
  _prevTurn = data.currentTurn;

  const topBar = document.querySelector('.top-bar');
  const ind    = document.getElementById('turn-indicator');
  const currentPlayer = data.players?.[data.currentTurn];
  const currentName   = (currentPlayer?.icon || '') + ' ' + (currentPlayer?.name || '?');

  if (isMyTurn) {
    topBar.classList.add('my-turn-bar');
    if (data.turnPhase === 'draw') {
      ind.innerHTML = '🟢 YOUR TURN — Draw a card';
      document.getElementById('draw-pile').classList.add('draw-ready');
      document.getElementById('discard-pile').classList.add('draw-ready');
    } else {
      ind.innerHTML = '🟡 YOUR TURN — Play or Discard';
      document.getElementById('draw-pile').classList.remove('draw-ready');
      document.getElementById('discard-pile').classList.remove('draw-ready');
    }
    ind.classList.add('my-turn');
    // Show a pop-up notification when it first becomes your turn
    if (turnChanged) showMessage('⬆ Your turn!', 2500);
  } else {
    topBar.classList.remove('my-turn-bar');
    document.getElementById('draw-pile').classList.remove('draw-ready');
    document.getElementById('discard-pile').classList.remove('draw-ready');
    ind.innerHTML = `${currentName}'s turn`;
    ind.classList.remove('my-turn');
  }

  // Seasonal polaroid taped to the table (no-op outside a photo season)
  updateSeasonPolaroid(data);

  // Turn bar (avatars in turn order + scores)
  renderTurnBar(data, myId);

  // Opponents
  renderOpponents(data, myId);

  // Discard top
  const discardPile = firebaseToArray(data.discardPile || []);
  const topCard     = discardPile[discardPile.length - 1];
  const discardEl   = document.getElementById('discard-top');
  discardEl.innerHTML = '';
  if (topCard) discardEl.appendChild(renderCard(topCard));

  // Melds
  renderMelds(data, myId);

  // My hand
  renderHand(localState);
  updateActionButtons();
}

// ── Turn bar — avatar rings in turn order; pulsing gold ring = current
//    turn, dashed ring + tag = up next. Details live in the opponent
//    panels — this strip is pure turn order. Hidden for 1v1. ──
function renderTurnBar(data, myId) {
  const bar = document.getElementById('turn-bar');
  if (!bar) return;
  const order = firebaseToArray(data.playerOrder || []);
  // 1v1 — turn order is obvious from the top banner
  if (order.length <= 2) { bar.innerHTML = ''; return; }
  const curIdx  = Math.max(0, order.indexOf(data.currentTurn));
  const nextPid = order[(curIdx + 1) % order.length];
  bar.innerHTML = order.map(pid => {
    const p = data.players[pid];
    if (!p) return '';
    const isMe      = pid === myId;
    const isActive  = pid === data.currentTurn;
    const isNext    = pid === nextPid && !isActive;
    const isOffline = p.online === false;
    const isSkipped = p.skipNext === true;
    const name      = isMe ? 'You' : escapeHtml(p.name || 'Player');
    const title     = name + (isOffline ? ' — disconnected' : '') + (isSkipped ? ' — skipping next turn' : '');
    let tag = '';
    if (isSkipped)     tag = '<span class="tb-skip-tag">⊘</span>';
    else if (isNext)   tag = '<span class="tb-next-tag">next</span>';
    return `<div class="tb-player${isActive ? ' tb-active' : ''}${isNext ? ' tb-next' : ''}${isMe ? ' tb-me' : ''}${isOffline ? ' tb-offline' : ''}" title="${title}">
      <div class="tb-avatar">${p.icon || '🎮'}${tag}</div>
    </div>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ── Opponents ──
function renderOpponents(data, myId) {
  const area  = document.getElementById('opponents-area');
  const order = firebaseToArray(data.playerOrder || []);
  area.innerHTML = '';

  for (const pid of order) {
    if (pid === myId) continue;
    const p       = data.players[pid];
    const panel   = document.createElement('div');
    const isTheirTurn = data.currentTurn === pid;
    const isOffline   = p.online === false;
    panel.className = 'opponent-panel' + (isTheirTurn ? ' active-turn' : '') + (isOffline ? ' opp-offline' : '');

    const phaseNum = Math.min(p.phase || 1, 10);
    const phaseObj = PHASES[phaseNum - 1];
    // A dropped player can be invited straight back — the button copies the
    // room's invite link so it can be texted over.
    const offlineRow = isOffline
      ? `<div class="opp-offline-row">
           <span class="opp-offline-tag">🔌 disconnected</span>
           <button type="button" class="opp-invite-btn" onclick="invitePlayerBack('${pid}')">Invite back</button>
         </div>`
      : '';
    const skipTag = p.skipNext ? ' <span class="opp-skip-tag" title="Skipping their next turn">⊘ skipped</span>' : '';
    panel.innerHTML = `
      <div class="opp-name">${p.icon || '🎮'} ${p.name} ${isTheirTurn ? '▶' : ''}${skipTag}</div>
      <div class="opp-info">Phase ${phaseNum} · ${p.score || 0} pts ${p.phaseDone ? '✓' : ''}</div>
      ${offlineRow}
      <div class="opp-phase-visual phase-visual">${renderPhaseVisual(phaseObj)}</div>
      <div class="opp-cards"></div>
    `;
    const cardsEl = panel.querySelector('.opp-cards');
    const count   = p.handCount || 0;
    for (let i = 0; i < Math.min(count, 20); i++) {
      const back = document.createElement('div');
      back.className = 'opp-card-back';
      cardsEl.appendChild(back);
    }
    area.appendChild(panel);
  }
}

// ── Melds — fixed Firebase array normalization + hit zones ──
function renderMelds(data, myId) {
  const area       = document.getElementById('meld-area');
  area.innerHTML   = '';
  const melds      = data.melds || {};
  const myPhaseDone = data.players?.[myId]?.phaseDone;
  const isMyTurn    = data.currentTurn === myId;
  const isPlayPhase = data.turnPhase === 'play';
  const canHitMelds = myPhaseDone && isMyTurn && isPlayPhase;

  for (const [ownerId, groupsRaw] of Object.entries(melds)) {
    // Normalize: Firebase may return arrays as objects with numeric string keys
    const groups    = firebaseToArray(groupsRaw);
    const ownerName = data.players?.[ownerId]?.name || ownerId;
    const ownerIcon = data.players?.[ownerId]?.icon || '🎮';

    groups.forEach((group, gi) => {
      const div = document.createElement('div');
      div.className = 'meld-group' + (canHitMelds ? ' can-hit' : '');

      const typeLabel = { set: 'SET', run: 'RUN', color: 'COLOR' }[group.partType] || group.partType.toUpperCase();
      div.innerHTML = `<div class="meld-group-label">${ownerIcon} ${ownerName} — ${typeLabel}</div>`;

      // Cards in the meld (normalized)
      const cards = firebaseToArray(group.cards);
      cards.forEach(card => {
        div.appendChild(renderCard(card));
      });

      // Hit zone: visible ➕ button when the player can add a card
      if (canHitMelds) {
        const hitBtn = document.createElement('div');
        hitBtn.className = 'hit-zone';
        hitBtn.title = 'Click to add your selected card here';
        hitBtn.innerHTML = '➕';
        hitBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.hitMeld(ownerId, gi);
        });
        div.appendChild(hitBtn);

        // Also clicking anywhere on the meld group hits it
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => window.hitMeld(ownerId, gi));
      }

      area.appendChild(div);
    });
  }
}

// ── Drag state for hand reordering ──
let _dragSrcId = null;

// ── Highlight whichever sort button is active ──
function updateSortButtons(sortMode) {
  const map = { number: 'btn-sort-number', color: 'btn-sort-color' };
  for (const [mode, id] of Object.entries(map)) {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('sort-active', sortMode === mode);
  }
}

// ── My Hand ──
export function renderHand(localState) {
  const zone = document.getElementById('my-hand');
  if (!zone) return;

  // Safety net — if our local hand is empty but the game data still has cards
  // for this player, restore from the game data. Prevents stale-state bugs where
  // a sort or other action accidentally wipes localState.hand on certain iOS layouts.
  if ((!localState.hand || localState.hand.length === 0) && localState.gameData) {
    const myData = localState.gameData.players?.[localState.playerId];
    const recoverable = myData?.hand;
    if (Array.isArray(recoverable) && recoverable.length > 0) {
      localState.hand = recoverable.slice();
    }
  }

  zone.innerHTML = '';

  // Keep sort buttons in sync with current mode
  updateSortButtons(localState.sortMode);
  const data        = localState.gameData;
  const isMyTurn    = data?.currentTurn === localState.playerId;
  const isPlayPhase = data?.turnPhase === 'play';

  (localState.hand || []).forEach((card) => {
    const isSelected = localState.selectedCards.includes(card.id);
    const cEl = renderCard(card, {
      onClick: (c, el) => {
        // Only toggle selection if not finishing a drag
        if (isMyTurn && isPlayPhase && !_dragSrcId) window.toggleSelect(c, el);
      }
    });
    if (isSelected) cEl.classList.add('selected');
    // Just-drawn animation — lowers the new card into the hand so the player
    // can see which card was added.
    if (localState.justDrawnCardId === card.id) {
      cEl.classList.add('card-just-drawn');
    }

    // ── Drag-and-drop reordering ──
    cEl.draggable = true;

    cEl.addEventListener('dragstart', (e) => {
      _dragSrcId = card.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => cEl.classList.add('dragging'), 0);
    });

    cEl.addEventListener('dragend', () => {
      cEl.classList.remove('dragging');
      zone.querySelectorAll('.card').forEach(c => c.classList.remove('drag-over'));
      // Clear drag state after a tick so click handler doesn't fire
      setTimeout(() => { _dragSrcId = null; }, 50);
    });

    cEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (_dragSrcId !== card.id) {
        zone.querySelectorAll('.card').forEach(c => c.classList.remove('drag-over'));
        cEl.classList.add('drag-over');
      }
    });

    cEl.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!_dragSrcId || _dragSrcId === card.id) return;
      const srcIdx = localState.hand.findIndex(c => c.id === _dragSrcId);
      const dstIdx = localState.hand.findIndex(c => c.id === card.id);
      if (srcIdx === -1 || dstIdx === -1) return;
      const newHand = [...localState.hand];
      const [moved] = newHand.splice(srcIdx, 1);
      newHand.splice(dstIdx, 0, moved);
      localState.hand = newHand;
      // Manual reorder overrides the persistent sort mode
      localState.sortMode = null;
      renderHand(localState);
    });

    zone.appendChild(cEl);
  });
}

// ── Initialize: show lobby after all variables are declared ──
showScreen('lobby');

// ═══════════════════════════════════════════
//  BIRTHDAY TAKEOVER
//  Birthday seasons (see SEASONS in settings.js) name a guest of honour. When
//  a player with that name sits down, round 1 opens with a full-screen
//  celebration — once per page load, dismissed by a tap or after 8 seconds.
// ═══════════════════════════════════════════
const BIRTHDAY_LOOK = {
  dan: {
    photo: 'images/dan/dan-couch.jpeg',
    lines: [
      'Have a DANTASTIC one 🎂',
      'Who run the world? You do 👑🐝',
      'Reed \'em and weep — it\'s your day 😎',
      'Dan-gerously in love with this birthday 💜',
    ],
  },
  julia: {
    photo: 'images/tippy2/tippy2-daisy.jpeg',
    lines: ['Tippy picked you a flower 🌼', 'Happy birthday, Julia! 💛'],
  },
  meg: {
    photo: 'images/tippy2/tippy2-sweaters.jpeg',
    lines: ['The whole fan club is here 🧶', 'Happy birthday, Meg! 🍁'],
  },
};

let _birthdayShown = false;
let _birthdayTimer = null;

/**
 * Show the birthday takeover if a birthday season is active, `playerName` is
 * the guest of honour, and this is the first round. Safe to call every render.
 */
export function maybeBirthdayTakeover(playerName, handNum) {
  if (_birthdayShown) return;
  if ((handNum || 1) !== 1) return;
  let isBirthdayPlayer = false;
  try { isBirthdayPlayer = !!(window.isSeasonBirthdayName && window.isSeasonBirthdayName(playerName)); } catch (e) {}
  if (!isBirthdayPlayer) return;
  _birthdayShown = true;
  showBirthdayTakeover();
}

function showBirthdayTakeover() {
  const overlay = document.getElementById('birthday-overlay');
  if (!overlay) return;
  const seasonId = activeSeasonId();
  const person   = (window.getSeasonPerson && window.getSeasonPerson()) || { name: 'You' };
  const look     = BIRTHDAY_LOOK[seasonId] || { photo: 'images/tippy/tippy-happy.jpeg', lines: ['🎂 Have a great one!'] };

  const titleEl = document.getElementById('birthday-title');
  const subEl   = document.getElementById('birthday-sub');
  const photoEl = document.getElementById('birthday-photo');
  if (titleEl) titleEl.textContent = `HAPPY BIRTHDAY, ${String(person.name || '').toUpperCase()}!`;
  if (subEl)   subEl.textContent   = look.lines[Math.floor(Math.random() * look.lines.length)];
  if (photoEl) { photoEl.src = look.photo; photoEl.alt = person.name || 'Birthday'; }

  // Emoji shower behind the card (skipped when animations are reduced)
  const fx = document.getElementById('birthday-fx');
  if (fx && !document.body.classList.contains('opt-noanimations')) {
    fx.innerHTML = '';
    const chars = ['🎂','🎈','🎉','👑','✨','🎁','🐝'];
    for (let i = 0; i < 34; i++) {
      const el = document.createElement('span');
      el.className = 'bd-emoji';
      el.textContent = chars[Math.floor(Math.random() * chars.length)];
      el.style.left = (Math.random() * 98) + '%';
      el.style.fontSize = Math.round(18 + Math.random() * 22) + 'px';
      el.style.animationDelay = (Math.random() * 2.5).toFixed(2) + 's';
      el.style.animationDuration = (3.2 + Math.random() * 2.6).toFixed(2) + 's';
      fx.appendChild(el);
    }
  }

  overlay.classList.add('show');
  if (_birthdayTimer) clearTimeout(_birthdayTimer);
  _birthdayTimer = setTimeout(() => window.dismissBirthdayTakeover(), 8000);
}

window.dismissBirthdayTakeover = function() {
  const overlay = document.getElementById('birthday-overlay');
  if (overlay) overlay.classList.remove('show');
  if (_birthdayTimer) { clearTimeout(_birthdayTimer); _birthdayTimer = null; }
  const fx = document.getElementById('birthday-fx');
  if (fx) fx.innerHTML = '';
};

// Solo mode is a non-module script path, so expose it on window too.
window.maybeBirthdayTakeover = maybeBirthdayTakeover;
