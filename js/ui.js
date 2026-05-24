// ═══════════════════════════════════════════
//  ui.js  — DOM rendering helpers
// ═══════════════════════════════════════════

import { renderCard, PHASES, firebaseToArray } from './cards.js';
import { updateActionButtons } from './game.js';

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

showScreen('lobby');

// ── Tippy gallery (waiting room slideshow) ──
const GALLERY = [
  { src: 'images/tippy/tippy-hero.jpeg',    caption: 'Tippy is ready to play! 🐾' },
  { src: 'images/tippy/tippy-alert.jpeg',   caption: 'Tippy says: hurry up and join! 👀' },
  { src: 'images/tippy/tippy-happy.jpeg',   caption: 'Tippy approves of this game 😛' },
  { src: 'images/tippy/tippy-burrito.jpeg', caption: 'Tippy warming up for a big round 🌯' },
  { src: 'images/tippy/tippy-peering.jpeg', caption: 'Tippy watching everyone\'s cards 👁️' },
  { src: 'images/tippy/tippy-car.jpeg',     caption: 'Tippy rode all the way here for this 🚗' },
  { src: 'images/tippy/tippy-blanket.jpeg', caption: 'Tippy in her thinking pose… 🧠' },
  { src: 'images/tippy/tippy-sleep.jpeg',   caption: 'Tippy will nap while you take forever 😴' },
  { src: 'images/tippy/tippy-cone.jpeg',    caption: 'Last place gets the cone of shame 🏆😂' },
];
let _galleryIdx = 0;
let _galleryTimer = null;

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
}

function updateGallery() {
  const img = document.getElementById('gallery-img');
  const cap = document.getElementById('gallery-caption');
  if (!img || !cap) return;
  img.classList.remove('gallery-fade-in');
  void img.offsetWidth; // force reflow
  img.src = GALLERY[_galleryIdx].src;
  cap.textContent = GALLERY[_galleryIdx].caption;
  img.classList.add('gallery-fade-in');
}

// ── Tippy celebration popup ──
let _popupTimer = null;
const TIPPY_MOMENTS = [
  { img: 'images/tippy/tippy-happy.jpeg',  text: '🐾 Phase down! Tippy is hyped!' },
  { img: 'images/tippy/tippy-alert.jpeg',  text: '🐾 WOOF! Let\'s GO!' },
  { img: 'images/tippy/tippy-happy.jpeg',  text: '🐾 Good boi move right there!' },
];
let _momentIdx = 0;

export function showTippyCelebration(customText) {
  const popup = document.getElementById('tippy-popup');
  const img   = document.getElementById('tippy-popup-img');
  const txt   = document.getElementById('tippy-popup-text');
  if (!popup) return;
  const moment = TIPPY_MOMENTS[_momentIdx % TIPPY_MOMENTS.length];
  _momentIdx++;
  img.src   = moment.img;
  txt.textContent = customText || moment.text;
  popup.classList.add('show');
  if (_popupTimer) clearTimeout(_popupTimer);
  _popupTimer = setTimeout(() => popup.classList.remove('show'), 2800);
}

export function showTippySkip() {
  const popup = document.getElementById('tippy-popup');
  const img   = document.getElementById('tippy-popup-img');
  const txt   = document.getElementById('tippy-popup-text');
  if (!popup) return;
  img.src = 'images/tippy/tippy-cone.jpeg';
  txt.textContent = '🏆 SKIPPED! Cone of shame!';
  popup.classList.add('show');
  if (_popupTimer) clearTimeout(_popupTimer);
  _popupTimer = setTimeout(() => popup.classList.remove('show'), 2800);
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

// ── Phase pill badges ──
function renderPhasePills(phaseObj) {
  if (!phaseObj) return '';
  const icons  = { set: '🎯', run: '➡️', color: '🌈' };
  const labels = { set: 'Set', run: 'Run', color: 'Color' };
  return phaseObj.parts.map(p =>
    `<span class="phase-pill phase-pill-${p.type}">${icons[p.type]} ${labels[p.type]} ${p.count}</span>`
  ).join('');
}

// ── Track previous turn for "your turn!" notification ──
let _prevTurn = null;

// ── Render full board ──
export function renderBoard(data, localState) {
  const myId  = localState.playerId;

  // HUD
  document.getElementById('hud-room').textContent = localState.roomCode;
  const myPlayer = data.players?.[myId];
  const phaseNum = Math.min(myPlayer?.phase || 1, 10);
  const phaseObj = PHASES[phaseNum - 1];
  document.getElementById('hud-phase').textContent   = phaseNum;
  document.getElementById('my-phase-num').textContent = phaseNum;
  document.getElementById('my-phase-desc').innerHTML  = renderPhasePills(phaseObj);
  document.getElementById('my-name-display').textContent =
    (myPlayer?.icon || '') + ' ' + (myPlayer?.name || '');

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
      <div class="opp-phase-pills">${renderPhasePills(phaseObj)}</div>
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

// ── My Hand ──
export function renderHand(localState) {
  const zone = document.getElementById('my-hand');
  zone.innerHTML = '';
  const data        = localState.gameData;
  const isMyTurn    = data?.currentTurn === localState.playerId;
  const isPlayPhase = data?.turnPhase === 'play';

  localState.hand.forEach((card) => {
    const isSelected = localState.selectedCards.includes(card.id);
    const cEl = renderCard(card, {
      onClick: (c, el) => {
        // Only toggle selection if not finishing a drag
        if (isMyTurn && isPlayPhase && !_dragSrcId) window.toggleSelect(c, el);
      }
    });
    if (isSelected) cEl.classList.add('selected');

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
      renderHand(localState);
    });

    zone.appendChild(cEl);
  });
}
