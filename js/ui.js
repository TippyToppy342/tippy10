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
let _galleryIdx = 0;
let _galleryTimer = null;
let _galleryPending = null;

function startGallery() {
  _galleryIdx = 0;
  updateGallery();
  _galleryTimer = setInterval(() => {
    _galleryIdx = (_galleryIdx + 1) % GALLERY.length;
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
  const { src, caption } = GALLERY[_galleryIdx];
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

  // Pick Tippy photo + caption based on my rank
  let tippyImg, tippyCaption;
  if (myRank === 0) {
    tippyImg    = 'images/tippy/tippy-happy.jpeg';
    tippyCaption = '🐾 Tippy says you\'re crushing it!';
  } else if (myRank === total - 1) {
    tippyImg    = 'images/tippy/tippy-cone.jpeg';
    tippyCaption = '😂 Cone of shame... but there\'s still time!';
  } else if (myRank < total / 2) {
    tippyImg    = 'images/tippy/tippy-alert.jpeg';
    tippyCaption = '👀 Tippy is watching your every move!';
  } else {
    tippyImg    = 'images/tippy/tippy-yawn.jpeg';
    tippyCaption = '🥱 Tippy is not impressed...';
  }
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
// Slides a card up out of whichever pile a player drew from, so everyone can
// see at a glance whether the draw came from the Draw pile or the Discard pile.
// `source` is 'draw' or 'discard'.
export function playPickupAnimation(source) {
  if (document.body.classList.contains('opt-noanimations')) return;
  const pile = document.getElementById(source === 'discard' ? 'discard-pile' : 'draw-pile');
  if (!pile) return;
  const r = pile.getBoundingClientRect();
  if (!r.width) return; // pile not visible
  const fx = document.createElement('div');
  fx.className = 'pickup-fx' + (source === 'discard' ? ' from-discard' : '');
  fx.style.left   = `${r.left}px`;
  fx.style.top    = `${r.top}px`;
  fx.style.width  = `${r.width}px`;
  fx.style.height = `${r.height}px`;
  document.body.appendChild(fx);
  fx.addEventListener('animationend', () => fx.remove());
  // Safety net in case animationend doesn't fire
  setTimeout(() => fx.remove(), 1200);
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
    const isMe     = pid === myId;
    const isActive = pid === data.currentTurn;
    const isNext   = pid === nextPid && !isActive;
    const name     = isMe ? 'You' : escapeHtml(p.name || 'Player');
    return `<div class="tb-player${isActive ? ' tb-active' : ''}${isNext ? ' tb-next' : ''}${isMe ? ' tb-me' : ''}" title="${name}">
      <div class="tb-avatar">${p.icon || '🎮'}${isNext ? '<span class="tb-next-tag">next</span>' : ''}</div>
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
    panel.className = 'opponent-panel' + (isTheirTurn ? ' active-turn' : '');

    const phaseNum = Math.min(p.phase || 1, 10);
    const phaseObj = PHASES[phaseNum - 1];
    panel.innerHTML = `
      <div class="opp-name">${p.icon || '🎮'} ${p.name} ${isTheirTurn ? '▶' : ''}</div>
      <div class="opp-info">Phase ${phaseNum} · ${p.score || 0} pts ${p.phaseDone ? '✓' : ''}</div>
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
