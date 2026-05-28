// ═══════════════════════════════════════════
//  game.js  — Firebase-backed game state
// ═══════════════════════════════════════════

import { db, authReady } from './firebase-config.js';
import { ref, set, get, update, remove, onValue, push } from
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { buildDeck, shuffle, cardPoints, validatePhase, canHit, firebaseToArray, PHASES } from './cards.js';
import { renderBoard, renderHand, showMessage, showScreen, showTippyPopup, showRoundEndScreen } from './ui.js';

// ── Local state ──
export let localState = {
  playerId: null,
  playerName: null,
  playerIcon: '🦁',
  roomCode: null,
  isHost: false,
  hand: [],
  selectedCards: [],
  gameData: null,
  lastPopupTs: 0,
  sortMode: null,   // 'number' | 'color' | 'wilds' | null — persists across draws
};

// ── Popup celebrations — images + varied text pools ──
const PHASE_DOWN_MOMENTS = [
  { img: 'images/tippy/tippy-happy.jpeg',      text: '🐾 Phase down! Tippy is hyped!' },
  { img: 'images/tippy/tippy-park.jpeg',        text: '🌿 Tippy says that was clean!' },
  { img: 'images/tippy/tippy-carseat.jpeg',     text: '😛 Let\'s gooo! Tippy is pumped!' },
  { img: 'images/tippy/tippy-lick.jpeg',        text: '👅 Tippy approves of that play!' },
  { img: 'images/tippy/tippy-alert.jpeg',       text: '👀 WOOF! Nice one!' },
  { img: 'images/tippy/tippy-standup.jpeg',     text: '🐾 Tippy demands more phases!' },
  { img: 'images/tippy/tippy-donut.jpeg',       text: '🍩 Sweet play, donut you think?' },
  { img: 'images/tippy/tippy-upsidedown.jpeg',  text: '🙃 Tippy\'s world is upside down with joy!' },
  { img: 'images/tippy/tippy-window.jpeg',      text: '🔭 Tippy spotted a winner emerging!' },
  { img: 'images/tippy/tippy-pinkblanket.jpeg', text: '🩷 Tippy peeks and approves!' },
  { img: 'images/tippy/tippy-closeup.jpeg',     text: '👁️ Tippy is WATCHING. Nice move.' },
  { img: 'images/tippy/tippy-sidewalk.jpeg',    text: '🚶 Tippy nods. Very respectable.' },
];
const SKIP_MOMENTS = [
  { img: 'images/tippy/tippy-cone.jpeg',   text: '⊘ Skip card! Cone of shame incoming!' },
  { img: 'images/tippy/tippy-cone.jpeg',   text: '🏆 Someone got SKIPPED! Ha!' },
  { img: 'images/tippy/tippy-yawn.jpeg',   text: '🥱 Skip! Tippy doesn\'t feel bad for you.' },
  { img: 'images/tippy/tippy-sideeye.jpeg',text: '😑 Skip. Tippy gives maximum side-eye.' },
];
const GOOUT_MOMENTS = [
  { img: 'images/tippy/tippy-happy.jpeg',  text: '🏆 went out! Tippy celebrates!' },
  { img: 'images/tippy/tippy-park.jpeg',   text: '🌿 went out! Tippy is impressed!' },
  { img: 'images/tippy/tippy-carseat.jpeg',text: '🚗 went out! Tippy is doing victory laps!' },
  { img: 'images/tippy/tippy-lick.jpeg',   text: '👅 went out! Even Tippy is jealous.' },
];
let _phaseMomentIdx = 0, _skipMomentIdx = 0, _goOutMomentIdx = 0;
function nextPhaseMoment()  { return PHASE_DOWN_MOMENTS[_phaseMomentIdx++  % PHASE_DOWN_MOMENTS.length]; }
function nextSkipMoment()   { return SKIP_MOMENTS[_skipMomentIdx++   % SKIP_MOMENTS.length]; }
function nextGoOutMoment()  { return GOOUT_MOMENTS[_goOutMomentIdx++ % GOOUT_MOMENTS.length]; }

async function broadcastPopup(text, img) {
  if (!localState.roomCode) return;
  try {
    await update(ref(db), {
      [`rooms/${localState.roomCode}/popup`]: { text, img: img || nextPopupImg(), ts: Date.now() }
    });
  } catch(e) { /* non-critical */ }
}

// ── Wild declaration modal state ──
let _wildResolve            = null;
let _wildModalGroup         = null;
let _wildModalPartCount     = 0;
let _wildModalPossibleStarts = [];
let _wildModalCurrentStart  = 1;

/** All valid starting numbers for a run given the real cards in the group */
function getRunPossibleStarts(group, partCount) {
  const reals = group.filter(c => c.type !== 'wild').sort((a,b) => a.number - b.number);
  if (!reals.length) return Array.from({length: 13 - partCount}, (_, i) => i + 1);
  const min = reals[0].number, max = reals[reals.length-1].number;
  const out = [];
  for (let s = Math.max(1, max - partCount + 1); s <= Math.min(min, 13 - partCount); s++) out.push(s);
  return out;
}

/** Build a fully-ordered run starting at startNum, assigning declaredValue to wilds */
function buildRunWithStart(group, startNum, partCount) {
  const wilds = group.filter(c => c.type === 'wild');
  const reals = group.filter(c => c.type !== 'wild');
  const result = new Array(partCount).fill(null);
  for (const r of reals) { const idx = r.number - startNum; if (idx >= 0 && idx < partCount) result[idx] = r; }
  let wi = 0;
  for (let i = 0; i < partCount && wi < wilds.length; i++) {
    if (!result[i]) result[i] = { ...wilds[wi++], declaredValue: startNum + i };
  }
  return result.filter(Boolean);
}

/** Show the shift modal and return a Promise<startNum> */
function showWildShiftModal(group, partCount, possibleStarts) {
  return new Promise(resolve => {
    _wildResolve             = resolve;
    _wildModalGroup          = group;
    _wildModalPartCount      = partCount;
    _wildModalPossibleStarts = possibleStarts;
    _wildModalCurrentStart   = possibleStarts[Math.floor(possibleStarts.length / 2)];
    // Render shift UI
    document.getElementById('wild-modal-shift-controls').style.display = 'flex';
    document.getElementById('wild-modal-choice-controls').style.display = 'none';
    document.getElementById('wild-modal-confirm').style.display = '';
    _renderWildModalRun();
    _updateWildShiftButtons();
    document.getElementById('wild-modal').classList.add('show');
  });
}

/** Show a simple 2-option choice modal (for hit-meld wild) and return Promise<value> */
function showWildChoiceModal(options) {
  return new Promise(resolve => {
    _wildResolve = resolve;
    document.getElementById('wild-modal-hint').textContent = 'Which end does the wild extend?';
    document.getElementById('wild-modal-run').innerHTML = '';
    document.getElementById('wild-modal-shift-controls').style.display = 'none';
    document.getElementById('wild-modal-confirm').style.display = 'none';
    const choiceEl = document.getElementById('wild-modal-choice-controls');
    choiceEl.style.display = 'flex';
    choiceEl.innerHTML = '';
    options.forEach(num => {
      const btn = document.createElement('button');
      btn.className = 'wild-choice-btn';
      btn.textContent = num;
      btn.onclick = () => { document.getElementById('wild-modal').classList.remove('show'); resolve(num); };
      choiceEl.appendChild(btn);
    });
    document.getElementById('wild-modal').classList.add('show');
  });
}

function _renderWildModalRun() {
  const runCards = buildRunWithStart(_wildModalGroup, _wildModalCurrentStart, _wildModalPartCount);
  const container = document.getElementById('wild-modal-run');
  const hint      = document.getElementById('wild-modal-hint');
  hint.textContent = `Run of ${_wildModalPartCount}: ${_wildModalCurrentStart} → ${_wildModalCurrentStart + _wildModalPartCount - 1}`;
  container.innerHTML = '';
  runCards.forEach(card => {
    const { renderCard } = window._cardRenderFn || {};
    const el = document.createElement('div');
    el.className = `card card-${card.color}`;
    el.style.cssText = 'width:52px;height:74px;position:relative;flex-shrink:0;cursor:default;';
    if (card.type === 'wild') {
      const dv = card.declaredValue;
      const tl = dv ?? 'W';
      el.innerHTML = `<span class="corner tl">${tl}</span>`
        + `<img class="wild-tippy-img" src="images/tippy/tippy-closeup.jpeg" alt="Wild" draggable="false" />`
        + `<span class="corner br">${tl}</span>`;
    } else {
      el.innerHTML = `<span class="corner tl">${card.number}</span><span class="center-num">${card.number}</span><span class="corner br">${card.number}</span>`;
    }
    container.appendChild(el);
  });
}

function _updateWildShiftButtons() {
  const min = _wildModalPossibleStarts[0];
  const max = _wildModalPossibleStarts[_wildModalPossibleStarts.length - 1];
  const l = document.getElementById('wild-shift-left');
  const r = document.getElementById('wild-shift-right');
  if (l) l.disabled = _wildModalCurrentStart <= min;
  if (r) r.disabled = _wildModalCurrentStart >= max;
}

window.shiftWildRun = function(dir) {
  const min = _wildModalPossibleStarts[0];
  const max = _wildModalPossibleStarts[_wildModalPossibleStarts.length - 1];
  _wildModalCurrentStart = Math.max(min, Math.min(max, _wildModalCurrentStart + dir));
  _renderWildModalRun();
  _updateWildShiftButtons();
};

window.confirmWildModal = function() {
  document.getElementById('wild-modal').classList.remove('show');
  if (_wildResolve) _wildResolve(_wildModalCurrentStart);
};

/** For each run group in the phase result, resolve wild declarations */
async function declareWildsIfNeeded(resultGroups, phaseObj) {
  const out = [];
  for (let i = 0; i < resultGroups.length; i++) {
    const group = resultGroups[i];
    const part  = phaseObj.parts[i];
    if (part.type !== 'run') { out.push(group); continue; }
    const wilds = group.filter(c => c.type === 'wild');
    if (!wilds.length) {
      // Sort even no-wild runs — player may have selected cards in any order
      out.push(group.slice().sort((a, b) => a.number - b.number));
      continue;
    }
    const possibleStarts = getRunPossibleStarts(group, part.count);
    if (possibleStarts.length === 1) {
      out.push(buildRunWithStart(group, possibleStarts[0], part.count));
    } else {
      const chosen = await showWildShiftModal(group, part.count, possibleStarts);
      out.push(buildRunWithStart(group, chosen, part.count));
    }
  }
  return out;
}

// ── Sort wilds into correct position in a run ──
function sortRunWithWilds(cards) {
  const wilds = cards.filter(c => c.type === 'wild');
  const reals = cards.filter(c => c.type !== 'wild').sort((a, b) => a.number - b.number);
  if (!wilds.length) return reals;
  if (!reals.length) return wilds;

  const min = reals[0].number;
  const max = reals[reals.length - 1].number;

  // Build a result array covering min..max, place reals, then fill gaps with wilds
  const result = new Array(max - min + 1).fill(null);
  for (const r of reals) result[r.number - min] = r;

  let wi = 0;
  for (let i = 0; i < result.length && wi < wilds.length; i++) {
    if (result[i] === null) result[i] = wilds[wi++];
  }
  // Any remaining wilds extend the run to the right
  while (wi < wilds.length) result.push(wilds[wi++]);

  return result.filter(Boolean);
}

// ─────────────────────────────────────────────
//  ICON PICKER
// ─────────────────────────────────────────────
window.setPlayerIcon = function(icon) {
  localState.playerIcon = icon;
  document.querySelectorAll('.icon-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.icon === icon);
  });
};

// ─────────────────────────────────────────────
//  SESSION PERSISTENCE (save / resume)
// ─────────────────────────────────────────────
const SESSION_KEY = 'tippy10_session';

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      roomCode:   localState.roomCode,
      playerId:   localState.playerId,
      playerName: localState.playerName,
      playerIcon: localState.playerIcon,
      isHost:     localState.isHost,
    }));
  } catch(e) { /* localStorage unavailable */ }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
}

async function checkSavedSession() {
  let raw;
  try { raw = localStorage.getItem(SESSION_KEY); } catch(e) { return; }
  if (!raw) return;
  let session;
  try { session = JSON.parse(raw); } catch { clearSession(); return; }
  if (!session.roomCode || !session.playerId) { clearSession(); return; }

  // Wait for anonymous sign-in before hitting the DB
  await authReady;

  // Verify the room + player still exist in Firebase
  try {
    const snap = await get(ref(db, `rooms/${session.roomCode}/players/${session.playerId}`));
    if (!snap.exists()) { clearSession(); return; }
  } catch(e) { return; }

  // Show the rejoin prompt in the lobby
  document.getElementById('rejoin-room-text').textContent = `Room: ${session.roomCode}`;
  document.getElementById('rejoin-name-text').textContent = `as ${session.playerIcon} ${session.playerName}`;
  document.getElementById('rejoin-section').style.display = '';
}

window.rejoinGame = async function() {
  let raw;
  try { raw = localStorage.getItem(SESSION_KEY); } catch(e) { return; }
  if (!raw) return;
  let session;
  try { session = JSON.parse(raw); } catch { clearSession(); return; }

  // Wait for anonymous sign-in before hitting the DB
  await authReady;

  // Verify room still exists
  let snap;
  try { snap = await get(ref(db, `rooms/${session.roomCode}`)); } catch(e) { setLobbyError('Connection error — try again'); return; }
  if (!snap.exists()) {
    clearSession();
    document.getElementById('rejoin-section').style.display = 'none';
    setLobbyError('That game no longer exists — start a new one');
    return;
  }

  // Restore localState
  localState.playerId   = session.playerId;
  localState.playerName = session.playerName;
  localState.playerIcon = session.playerIcon;
  localState.roomCode   = session.roomCode;
  localState.isHost     = session.isHost;
  localState.hand       = [];
  localState.selectedCards = [];
  localState.lastPopupTs   = 0;

  const data = snap.val();
  if (data.status === 'waiting') {
    enterWaiting();
  } else {
    // Game in progress — sync hand from Firebase and jump to the active screen
    const myData = data.players?.[session.playerId];
    if (myData?.hand) localState.hand = firebaseToArray(myData.hand);
    subscribeRoom();
    // handleRoomUpdate will show the correct screen
  }
};

window.dismissRejoin = function() {
  clearSession();
  document.getElementById('rejoin-section').style.display = 'none';
};

// ─────────────────────────────────────────────
//  LOBBY
// ─────────────────────────────────────────────
window.createRoom = async function() {
  const name     = document.getElementById('input-name').value.trim();
  const room     = document.getElementById('input-room').value.trim().toUpperCase() || randomCode();
  const icon     = localState.playerIcon || '🦁';
  const password = document.getElementById('input-password').value.trim();
  if (!name) { setLobbyError('Enter your name'); return; }

  // Wait for anonymous sign-in before hitting the DB
  await authReady;

  localState.playerId   = 'p_' + Math.random().toString(36).slice(2,8);
  localState.playerName = name;
  localState.roomCode   = room;
  localState.isHost     = true;

  const roomRef = ref(db, `rooms/${room}`);
  const snap = await get(roomRef);
  if (snap.exists()) { setLobbyError('Room already exists — pick another code'); return; }

  const roomData = {
    host: localState.playerId,
    status: 'waiting',
    players: {
      [localState.playerId]: { name, icon, phase: 1, score: 0, handCount: 0, phaseDone: false }
    },
    playerOrder: [localState.playerId],
  };
  if (password) roomData.password = password;

  await set(roomRef, roomData);
  saveSession();
  enterWaiting();
};

window.joinRoom = async function() {
  const name     = document.getElementById('input-name').value.trim();
  const room     = document.getElementById('input-room').value.trim().toUpperCase();
  const icon     = localState.playerIcon || '🦁';
  const password = document.getElementById('input-password').value.trim();
  if (!name) { setLobbyError('Enter your name'); return; }
  if (!room) { setLobbyError('Enter a room code'); return; }

  // Wait for anonymous sign-in before hitting the DB
  await authReady;

  const roomRef = ref(db, `rooms/${room}`);
  const snap = await get(roomRef);
  if (!snap.exists()) { setLobbyError('Room not found'); return; }
  const data = snap.val();
  if (data.status !== 'waiting') { setLobbyError('Game already started'); return; }
  const count = Object.keys(data.players || {}).length;
  if (count >= 6) { setLobbyError('Room is full (max 6)'); return; }

  // Password check
  if (data.password) {
    if (!password) { setLobbyError('This room requires a password 🔒'); return; }
    if (password !== data.password) { setLobbyError('Wrong password — try again 🔒'); return; }
  }

  localState.playerId   = 'p_' + Math.random().toString(36).slice(2,8);
  localState.playerName = name;
  localState.roomCode   = room;
  localState.isHost     = false;

  const updates = {};
  updates[`rooms/${room}/players/${localState.playerId}`] = { name, icon, phase: 1, score: 0, handCount: 0, phaseDone: false };
  updates[`rooms/${room}/playerOrder`] = [...(data.playerOrder || []), localState.playerId];
  await update(ref(db), updates);

  saveSession();
  enterWaiting();
};

function enterWaiting() {
  showScreen('waiting');
  document.getElementById('display-room-code').textContent = localState.roomCode;
  subscribeRoom();
}

function setLobbyError(msg) {
  document.getElementById('lobby-error').textContent = msg;
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:5}, ()=>chars[Math.floor(Math.random()*chars.length)]).join('');
}

// ─────────────────────────────────────────────
//  REALTIME LISTENER
// ─────────────────────────────────────────────
let _unsub = null;
function subscribeRoom() {
  if (_unsub) _unsub();
  const roomRef = ref(db, `rooms/${localState.roomCode}`);
  _unsub = onValue(roomRef, snap => {
    if (!snap.exists()) return;
    const data = snap.val();
    localState.gameData = data;
    handleRoomUpdate(data);
  });
  // Start chat listener + show the chat widget for this room
  subscribeChat();
  showChatWidget();
}

function handleRoomUpdate(data) {
  // ── Global popup broadcast ──
  if (data.popup && data.popup.ts !== localState.lastPopupTs) {
    localState.lastPopupTs = data.popup.ts;
    showTippyPopup(data.popup.text, data.popup.img);
  }

  // ── Theme sync (host-controlled, reflected to all players) ──
  if (data.theme && window.applyThemeFromFirebase) {
    window.applyThemeFromFirebase(data.theme);
  }

  if (data.status === 'waiting') {
    updateWaitingUI(data);
  } else if (data.status === 'playing') {
    if (!document.getElementById('screen-game').classList.contains('active')) {
      showScreen('game');
    }
    // Sync hand from Firebase only when the set of cards actually changes,
    // so local sort/drag order is preserved when other players take actions.
    const myData = data.players?.[localState.playerId];
    if (myData?.hand) {
      const newHand    = firebaseToArray(myData.hand);
      const currIdKey  = localState.hand.map(c => c.id).sort().join(',');
      const newIdKey   = newHand.map(c => c.id).sort().join(',');
      if (currIdKey !== newIdKey) {
        if (localState.hand.length === 0) {
          localState.hand = newHand;
        } else {
          // Preserve local order; keep existing cards in place, append new ones
          const newIdSet = new Set(newHand.map(c => c.id));
          const kept  = localState.hand.filter(c => newIdSet.has(c.id));
          const added = newHand.filter(c => !localState.hand.some(h => h.id === c.id));
          localState.hand = [...kept, ...added];
        }
      }
    }
    renderBoard(data, localState);
  } else if (data.status === 'round_end') {
    showRoundEndScreen(data, localState);
  } else if (data.status === 'ended') {
    showEndScreen(data);
  }
}

function updateWaitingUI(data) {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  firebaseToArray(data.playerOrder || []).forEach(pid => {
    const p = data.players[pid];
    if (!p) return;
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (pid === data.host ? ' host' : '');
    chip.textContent = (p.icon || '🎮') + ' ' + p.name + (pid === data.host ? ' 👑' : '');
    list.appendChild(chip);
  });

  const btnStart = document.getElementById('btn-start');
  const count = Object.keys(data.players || {}).length;
  if (localState.isHost && count >= 2) {
    btnStart.style.display = '';
    document.getElementById('waiting-msg').textContent = '';
  } else if (localState.isHost) {
    btnStart.style.display = 'none';
    document.getElementById('waiting-msg').textContent = 'Need at least 2 players to start';
  } else {
    btnStart.style.display = 'none';
    document.getElementById('waiting-msg').textContent = 'Waiting for host to start…';
  }
}

// ─────────────────────────────────────────────
//  START GAME
// ─────────────────────────────────────────────
window.startGame = async function() {
  if (!localState.isHost) return;
  const data = localState.gameData;
  const order = firebaseToArray(data.playerOrder);
  const deck = buildDeck();

  const playerUpdates = {};
  let deckPos = 0;
  for (const pid of order) {
    const hand = deck.slice(deckPos, deckPos + 10);
    deckPos += 10;
    playerUpdates[`rooms/${localState.roomCode}/players/${pid}/hand`]      = hand;
    playerUpdates[`rooms/${localState.roomCode}/players/${pid}/handCount`] = 10;
  }

  const drawPile   = deck.slice(deckPos);
  const topDiscard = drawPile.pop();

  await update(ref(db), {
    ...playerUpdates,
    [`rooms/${localState.roomCode}/status`]:      'playing',
    [`rooms/${localState.roomCode}/drawPile`]:    drawPile,
    [`rooms/${localState.roomCode}/discardPile`]: [topDiscard],
    [`rooms/${localState.roomCode}/currentTurn`]: order[0],
    [`rooms/${localState.roomCode}/turnPhase`]:   'draw',
    [`rooms/${localState.roomCode}/melds`]:        {},
    [`rooms/${localState.roomCode}/handNum`]:      1,
    [`rooms/${localState.roomCode}/theme`]:        window.getSettings?.()?.theme || 'standard',
  });
  postSystemChatMessage('🐾 Round 1 begins — good luck!');
};

// ─────────────────────────────────────────────
//  DRAW CARD
// ─────────────────────────────────────────────
window.drawCard = async function(source) {
  const data = localState.gameData;
  if (!data || data.status !== 'playing') return;
  if (data.currentTurn !== localState.playerId) { showMessage('Not your turn!'); return; }
  if (data.turnPhase !== 'draw') { showMessage('You already drew a card'); return; }

  let draw, updates = {};
  if (source === 'draw') {
    let pile = firebaseToArray(data.drawPile || []);
    if (!pile.length) {
      const discardPile = firebaseToArray(data.discardPile || []);
      const top = discardPile.pop();
      pile = shuffle(discardPile);
      updates[`rooms/${localState.roomCode}/discardPile`] = [top];
    }
    draw = pile.pop();
    updates[`rooms/${localState.roomCode}/drawPile`] = pile;
  } else {
    const discardPile = firebaseToArray(data.discardPile || []);
    if (!discardPile.length) { showMessage('Discard pile is empty'); return; }
    const topCard = discardPile[discardPile.length - 1];
    if (topCard?.type === 'skip') { showMessage("You can't pick up a Skip card! 🚫"); return; }
    draw = discardPile.pop();
    updates[`rooms/${localState.roomCode}/discardPile`] = discardPile;
  }

  const newHand = [...localState.hand, draw];
  localState.hand = newHand;
  localState.selectedCards = [];
  // Re-apply persistent sort (local only — Firebase just stores the card data, not order)
  applySortMode();
  updates[`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]      = localState.hand;
  updates[`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`] = localState.hand.length;
  updates[`rooms/${localState.roomCode}/turnPhase`] = 'play';

  await update(ref(db), updates);
  renderHand(localState);
  updateActionButtons();
};

// ─────────────────────────────────────────────
//  LAY DOWN PHASE
// ─────────────────────────────────────────────
window.layDownPhase = async function() {
  const data = localState.gameData;
  if (!data || data.currentTurn !== localState.playerId) return;
  if (data.turnPhase !== 'play') { showMessage('Draw a card first'); return; }

  const myPlayer = data.players[localState.playerId];
  if (myPlayer.phaseDone) { showMessage('Phase already laid down!'); return; }

  const phaseId  = myPlayer.phase;
  const selected = localState.selectedCards;
  const phaseObj = PHASES[phaseId - 1];

  const selectedCardObjs = selected.map(id => localState.hand.find(c => c.id === id)).filter(Boolean);

  // ── Guard: require the exact number of cards for the phase ──
  // Without this, selecting MORE cards than the phase needs could let
  // validatePhase find a valid subset, but then ALL selected cards would
  // be removed from the hand below — silently discarding the extras and
  // potentially leaving the player with 0 cards (broken turn state).
  const phaseTotal = phaseObj.parts.reduce((sum, p) => sum + p.count, 0);
  if (selectedCardObjs.length !== phaseTotal) {
    showMessage(`Select exactly ${phaseTotal} card${phaseTotal === 1 ? '' : 's'} for Phase ${phaseId}: ${phaseObj.desc}`);
    return;
  }

  const result = validatePhase(selectedCardObjs, phaseId);

  if (!result) {
    showMessage(`That doesn't complete Phase ${phaseId}: ${phaseObj.desc}`);
    return;
  }

  // ── Build usedIds from the cards actually placed in melds (result),
  //     not from selectedCardObjs. Defense in depth: even if a future
  //     change loosens the exact-count guard, we'll never remove a card
  //     that wasn't actually melded. ──
  const usedIds = new Set(result.flat().map(c => c.id));
  const newHand = localState.hand.filter(c => !usedIds.has(c.id));

  // ── Final safety net: never let layDown empty the hand. The player
  //     must keep at least 1 card to discard and end their turn. ──
  if (newHand.length === 0) {
    showMessage('Keep at least 1 card — you must discard to end your turn!');
    return;
  }

  localState.hand = newHand;
  localState.selectedCards = [];

  // Resolve wild declarations (shows modal if ambiguous) and sort runs
  const resolvedResult = await declareWildsIfNeeded(result, phaseObj);

  const melds = data.melds || {};
  melds[localState.playerId] = resolvedResult.map((group, i) => ({
    ownerId:   localState.playerId,
    partIndex: i,
    partType:  phaseObj.parts[i].type,
    partCount: phaseObj.parts[i].count,
    cards:     group,
  }));

  await update(ref(db), {
    [`rooms/${localState.roomCode}/melds`]:                                         melds,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]:            newHand,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`]:       newHand.length,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/phaseDone`]:       true,
  });
  renderHand(localState);
  updateActionButtons();
  showMessage(`Phase ${phaseId} laid down! ✓`);
  const myName = localState.gameData?.players?.[localState.playerId]?.name || 'Someone';
  const pm = nextPhaseMoment();
  await broadcastPopup(`${myName} — ${pm.text}`, pm.img);
  postSystemChatMessage(`🎯 ${myName} laid down Phase ${phaseId}!`);
};

// ─────────────────────────────────────────────
//  HIT (add to meld)  — fixed Firebase array bug
// ─────────────────────────────────────────────
window.hitMeld = async function(ownerId, groupIndex) {
  const data = localState.gameData;
  if (!data || data.status !== 'playing') return;
  if (data.currentTurn !== localState.playerId) { showMessage('Not your turn!'); return; }
  if (data.turnPhase !== 'play') { showMessage('Draw a card first'); return; }

  const myPlayer = data.players[localState.playerId];
  if (!myPlayer || !myPlayer.phaseDone) { showMessage('Lay down your phase first'); return; }

  const selected = localState.selectedCards;
  if (selected.length !== 1) { showMessage('Select exactly 1 card from your hand first'); return; }

  const card = localState.hand.find(c => c.id === selected[0]);
  if (!card) return;

  // Must keep at least 1 card to discard — can't play last card to a meld
  if (localState.hand.length <= 1) {
    showMessage('Keep 1 card — you must discard to end your turn!');
    return;
  }

  // Deep clone melds and normalize any Firebase object-encoded arrays
  const meldsRaw  = JSON.parse(JSON.stringify(data.melds || {}));
  const groups    = firebaseToArray(meldsRaw[ownerId]);
  if (!groups || !groups[groupIndex]) { showMessage('Meld not found'); return; }

  const group     = groups[groupIndex];
  group.cards     = firebaseToArray(group.cards);

  if (!canHit(card, group.cards, { type: group.partType })) {
    showMessage("That card doesn't fit there");
    return;
  }

  // Wild hitting a run: declare which end it extends
  let cardToAdd = card;
  if (card.type === 'wild' && group.partType === 'run') {
    const allVals = group.cards.map(c => c.declaredValue ?? c.number).sort((a,b) => a-b);
    const runMin = allVals[0], runMax = allVals[allVals.length - 1];
    const canLow  = runMin - 1 >= 1;
    const canHigh = runMax + 1 <= 12;
    let declaredValue;
    if (canLow && canHigh) {
      declaredValue = await showWildChoiceModal([runMin - 1, runMax + 1]);
    } else if (canLow) {
      declaredValue = runMin - 1;
    } else {
      declaredValue = runMax + 1;
    }
    cardToAdd = { ...card, declaredValue };
  }

  group.cards.push(cardToAdd);

  // Re-sort run so the new card lands in the right position
  if (group.partType === 'run') {
    group.cards.sort((a, b) => (a.declaredValue ?? a.number) - (b.declaredValue ?? b.number));
  }
  groups[groupIndex] = group;
  meldsRaw[ownerId]  = groups;

  const newHand = localState.hand.filter(c => c.id !== card.id);
  localState.hand = newHand;
  localState.selectedCards = [];

  await update(ref(db), {
    [`rooms/${localState.roomCode}/melds`]:                                        meldsRaw,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]:           newHand,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`]:      newHand.length,
  });
  renderHand(localState);
  updateActionButtons();
  showMessage('Card added! ✓');
};

// ─────────────────────────────────────────────
//  DISCARD
// ─────────────────────────────────────────────
window.discardSelected = async function() {
  const data = localState.gameData;
  if (!data || data.currentTurn !== localState.playerId) { showMessage('Not your turn!'); return; }
  if (data.turnPhase !== 'play') { showMessage('Draw a card first'); return; }

  const selected = localState.selectedCards;
  if (selected.length !== 1) { showMessage('Select exactly 1 card to discard'); return; }

  const card = localState.hand.find(c => c.id === selected[0]);
  if (!card) return;

  const order = firebaseToArray(data.playerOrder);
  const myIdx = order.indexOf(localState.playerId);
  let nextIdx = (myIdx + 1) % order.length;

  if (card.type === 'skip') {
    // Capture skipped player BEFORE we advance the index again
    const skippedIdx    = (myIdx + 1) % order.length;
    const skippedName   = data.players?.[order[skippedIdx]]?.name || 'Someone';
    nextIdx = (nextIdx + 1) % order.length;
    const myName = localState.gameData?.players?.[localState.playerId]?.name || 'Someone';
    const sm = nextSkipMoment();
    await broadcastPopup(`${myName}: ${sm.text}`, sm.img);
    postSystemChatMessage(`⊘ ${myName} skipped ${skippedName}`);
  }

  const nextPlayer   = order[nextIdx];
  const newHand      = localState.hand.filter(c => c.id !== card.id);
  const discardPile  = [...firebaseToArray(data.discardPile || []), card];
  localState.hand = newHand;
  localState.selectedCards = [];

  const updates = {
    [`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]:       newHand,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`]:  newHand.length,
    [`rooms/${localState.roomCode}/discardPile`]:                               discardPile,
    [`rooms/${localState.roomCode}/currentTurn`]:                               nextPlayer,
    [`rooms/${localState.roomCode}/turnPhase`]:                                 'draw',
  };

  if (newHand.length === 0) {
    await handleGoOut(data, updates);
    return;
  }

  await update(ref(db), updates);
  renderHand(localState);
  updateActionButtons();
};

// ─────────────────────────────────────────────
//  GO OUT
// ─────────────────────────────────────────────
async function handleGoOut(data, baseUpdates) {
  const updates = { ...baseUpdates };
  const order   = firebaseToArray(data.playerOrder);

  // Calculate score penalties and track who completed their phase
  const scoreDeltas    = {};
  const completedPhase = {};
  const prevPhase      = {};

  for (const pid of order) {
    const p = data.players[pid];
    prevPhase[pid] = p.phase || 1;
    completedPhase[pid] = !!p.phaseDone;

    if (pid === localState.playerId) {
      scoreDeltas[pid] = 0;
    } else {
      const theirHand = firebaseToArray(p.hand || []);
      const pts = theirHand.reduce((sum, c) => sum + cardPoints(c), 0);
      scoreDeltas[pid] = pts;
      updates[`rooms/${localState.roomCode}/players/${pid}/score`] = (p.score || 0) + pts;
    }
  }

  // Advance phases for players who completed theirs
  let someoneWon = false;
  for (const pid of order) {
    const p = data.players[pid];
    if (p.phaseDone) {
      const nextPhase = (p.phase || 1) + 1;
      if (nextPhase > 10) someoneWon = true;
      updates[`rooms/${localState.roomCode}/players/${pid}/phase`] = Math.min(nextPhase, 11);
    }
    updates[`rooms/${localState.roomCode}/players/${pid}/phaseDone`] = false;
  }

  if (someoneWon) {
    updates[`rooms/${localState.roomCode}/status`] = 'ended';
    await update(ref(db), updates);
    return;
  }

  // Show round-end screen instead of immediately dealing
  updates[`rooms/${localState.roomCode}/status`]       = 'round_end';
  updates[`rooms/${localState.roomCode}/roundSummary`] = {
    goOutPlayer: localState.playerId,
    scoreDeltas,
    completedPhase,
    prevPhase,
    handNum: data.handNum || 1,
  };
  updates[`rooms/${localState.roomCode}/melds`] = {};

  await update(ref(db), updates);

  // Broadcast a "went out" popup
  const myName = data.players?.[localState.playerId]?.name || 'Someone';
  const gm = nextGoOutMoment();
  await broadcastPopup(`${myName} ${gm.text}`, gm.img);
  postSystemChatMessage(`🏆 ${myName} went out!`);
}

// ─────────────────────────────────────────────
//  START NEXT ROUND  (host only)
// ─────────────────────────────────────────────
window.startNextRound = async function() {
  if (!localState.isHost) return;
  const data  = localState.gameData;
  const order = firebaseToArray(data.playerOrder);
  const deck  = buildDeck();

  const updates = {};
  let pos = 0;
  for (const pid of order) {
    const hand = deck.slice(pos, pos + 10);
    pos += 10;
    updates[`rooms/${localState.roomCode}/players/${pid}/hand`]      = hand;
    updates[`rooms/${localState.roomCode}/players/${pid}/handCount`] = 10;
  }
  const drawPile   = deck.slice(pos);
  const topDiscard = drawPile.pop();

  const newHandNum = (data.handNum || 1) + 1;
  const startIdx   = (newHandNum - 1) % order.length;   // rotate who goes first

  await update(ref(db), {
    ...updates,
    [`rooms/${localState.roomCode}/status`]:       'playing',
    [`rooms/${localState.roomCode}/drawPile`]:     drawPile,
    [`rooms/${localState.roomCode}/discardPile`]:  [topDiscard],
    [`rooms/${localState.roomCode}/currentTurn`]:  order[startIdx],
    [`rooms/${localState.roomCode}/turnPhase`]:    'draw',
    [`rooms/${localState.roomCode}/melds`]:        {},
    [`rooms/${localState.roomCode}/handNum`]:      newHandNum,
    [`rooms/${localState.roomCode}/roundSummary`]: null,
  });
  postSystemChatMessage(`🐾 Round ${newHandNum} begins!`);
};

// ─────────────────────────────────────────────
//  SORT HAND — persistent mode
//  Clicking the same button again toggles it OFF.
//  Drag-to-reorder (in ui.js) also clears the mode.
// ─────────────────────────────────────────────

// Internal sort executors (no side-effects, just mutate localState.hand)
function _execSortByNumber() {
  const typeOrder = { number: 0, wild: 1, skip: 2 };
  localState.hand.sort((a, b) => {
    const ta = typeOrder[a.type] ?? 3, tb = typeOrder[b.type] ?? 3;
    if (ta !== tb) return ta - tb;
    return a.number - b.number;
  });
}
function _execSortByColor() {
  const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4, skip: 5 };
  localState.hand.sort((a, b) => {
    const ca = colorOrder[a.color] ?? 6, cb = colorOrder[b.color] ?? 6;
    if (ca !== cb) return ca - cb;
    return a.number - b.number;
  });
}
function _execSortWildsFirst() {
  const typeOrder = { wild: 0, number: 1, skip: 2 };
  localState.hand.sort((a, b) => {
    const ta = typeOrder[a.type] ?? 3, tb = typeOrder[b.type] ?? 3;
    if (ta !== tb) return ta - tb;
    return a.number - b.number;
  });
}

/** Re-apply the active sort mode — called after drawing a card */
export function applySortMode() {
  if (localState.sortMode === 'number') _execSortByNumber();
  else if (localState.sortMode === 'color')  _execSortByColor();
  else if (localState.sortMode === 'wilds')  _execSortWildsFirst();
}

// Public sort buttons — toggle mode on/off, then re-sort and re-render
window.sortHandByNumber = function() {
  localState.sortMode = localState.sortMode === 'number' ? null : 'number';
  applySortMode();
  renderHand(localState);
};
window.sortHandByColor = function() {
  localState.sortMode = localState.sortMode === 'color' ? null : 'color';
  applySortMode();
  renderHand(localState);
};
window.sortHandWildsFirst = function() {
  localState.sortMode = localState.sortMode === 'wilds' ? null : 'wilds';
  applySortMode();
  renderHand(localState);
};

// ─────────────────────────────────────────────
//  HOST HELPERS — exposed for settings.js
// ─────────────────────────────────────────────
window.getIsHost = function() { return localState.isHost; };
window.getInGame = function() {
  return !!(localState.roomCode && localState.gameData?.status === 'playing');
};
/** Host writes theme to Firebase; all players receive it via handleRoomUpdate */
window.setRoomTheme = async function(theme) {
  if (!localState.roomCode || !localState.isHost) return;
  try {
    await update(ref(db), { [`rooms/${localState.roomCode}/theme`]: theme });
  } catch(e) { /* non-critical */ }
};

// Check for a saved session on page load and show rejoin prompt if valid
checkSavedSession();

// ─────────────────────────────────────────────
//  TOGGLE CARD SELECTION
// ─────────────────────────────────────────────
window.toggleSelect = function(card, el) {
  const data = localState.gameData;
  if (!data || data.currentTurn !== localState.playerId) return;
  if (data.turnPhase !== 'play') return;

  const idx = localState.selectedCards.indexOf(card.id);
  if (idx === -1) {
    localState.selectedCards.push(card.id);
    el.classList.add('selected');
  } else {
    localState.selectedCards.splice(idx, 1);
    el.classList.remove('selected');
  }
  updateActionButtons();
};

// ─────────────────────────────────────────────
//  ACTION BUTTON STATE
// ─────────────────────────────────────────────
export function updateActionButtons() {
  const data = localState.gameData;
  const isMyTurn    = data?.currentTurn === localState.playerId;
  const isPlayPhase = data?.turnPhase === 'play';
  const sel         = localState.selectedCards;

  document.getElementById('btn-discard').disabled = !(isMyTurn && isPlayPhase && sel.length === 1);

  const myPlayer  = data?.players?.[localState.playerId];
  const phaseDone = myPlayer?.phaseDone;
  document.getElementById('btn-lay').disabled = !(isMyTurn && isPlayPhase && !phaseDone && sel.length >= 2);
}

// ─────────────────────────────────────────────
//  END SCREEN
// ─────────────────────────────────────────────
const WIN_TIPPY_IMGS = [
  'images/tippy/tippy-happy.jpeg',
  'images/tippy/tippy-standup.jpeg',
  'images/tippy/tippy-carseat.jpeg',
  'images/tippy/tippy-park.jpeg',
  'images/tippy/tippy-lick.jpeg',
  'images/tippy/tippy-upsidedown.jpeg',
];

function showEndScreen(data) {
  showScreen('end');

  // Pick a random hype Tippy photo
  const img = WIN_TIPPY_IMGS[Math.floor(Math.random() * WIN_TIPPY_IMGS.length)];
  document.getElementById('end-tippy-img').src = img;

  const players = Object.entries(data.players || {})
    .sort((a, b) => {
      const pa = a[1], pb = b[1];
      if (pb.phase !== pa.phase) return pb.phase - pa.phase;
      return pa.score - pb.score;
    });

  const winner = players[0];
  document.getElementById('end-title').textContent =
    `${winner[1].icon || ''} ${winner[1].name} Wins!`;

  const rankMedals = ['🥇','🥈','🥉'];
  const scoresEl = document.getElementById('end-scores');
  scoresEl.innerHTML = '';
  players.forEach(([pid, p], i) => {
    const row = document.createElement('div');
    row.className = `score-row rank-${i + 1}`;
    row.style.animationDelay = `${1.2 + i * 0.18}s`;
    const medal = rankMedals[i] ?? `${i + 1}.`;
    const isMe  = pid === localState.playerId;
    row.innerHTML = `
      <span class="${isMe ? 'score-row-me' : ''}">
        <span class="score-rank">${medal}</span>${p.icon || ''} ${p.name}${isMe ? ' 👈' : ''}
      </span>
      <span>Phase&nbsp;${Math.min(p.phase, 10)} &middot; ${p.score}&nbsp;pts</span>`;
    scoresEl.appendChild(row);
  });

  launchConfetti();
}

function launchConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#ffd700','#ff6b6b','#4ecdc4','#45b7d1','#96e6a1','#ffd93d','#ff6fb7','#a29bfe','#fd79a8'];
  const shapes = [2, 4, 50]; // border-radius values: square, slightly rounded, circle
  for (let i = 0; i < 150; i++) {
    const el  = document.createElement('div');
    el.className = 'confetti-piece';
    const size = 6 + Math.random() * 10;
    const br   = shapes[Math.floor(Math.random() * shapes.length)];
    el.style.cssText = `
      left:${Math.random() * 100}%;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      animation-delay:${Math.random() * 3}s;
      animation-duration:${3.5 + Math.random() * 2.5}s;
      width:${size}px;
      height:${size * (0.6 + Math.random() * 1.2)}px;
      border-radius:${br}%;
      opacity:${0.7 + Math.random() * 0.3};
    `;
    container.appendChild(el);
  }
}

window.backToLobby = async function() {
  const roomCode = localState.roomCode;
  const isHost   = localState.isHost;

  // Clear saved session — explicit leave means no rejoin needed
  clearSession();
  document.getElementById('rejoin-section').style.display = 'none';

  // Reset local state first
  localState.hand = [];
  localState.selectedCards = [];
  localState.gameData = null;
  localState.roomCode = null;
  localState.isHost = false;
  if (_unsub) { _unsub(); _unsub = null; }
  unsubscribeChat();
  hideChatWidget();

  // Host deletes the room so the code can be reused
  if (isHost && roomCode) {
    try { await remove(ref(db, `rooms/${roomCode}`)); } catch(e) { /* non-critical */ }
  }

  showScreen('lobby');
};

// ─────────────────────────────────────────────
//  ROOM CHAT — push messages, render, unread badge, notifications
// ─────────────────────────────────────────────
let _chatUnsub        = null;
let _chatLastSeen     = 0;
let _chatOpen         = false;
let _chatMessages     = [];
let _chatNotifiedKeys = new Set();   // message keys we've already considered for notifications
let _chatInitialLoaded = false;       // first onValue fire is history — don't notify
let _audioCtx         = null;          // lazy-init Web Audio context

function _escapeChatHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function _formatTsTooltip(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  let rel;
  if (diff < 45 * 1000)              rel = 'just now';
  else if (diff < 90 * 1000)         rel = '1 min ago';
  else if (diff < 60 * 60 * 1000)    rel = `${Math.round(diff / 60000)} min ago`;
  else if (diff < 24 * 60 * 60 * 1000) rel = `${Math.round(diff / 3600000)} hr ago`;
  else if (diff < 2 * 24 * 60 * 60 * 1000) rel = 'yesterday';
  else                               rel = `${Math.round(diff / 86400000)} days ago`;
  let abs = '';
  try {
    const d = new Date(ts);
    abs = d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
  } catch (e) { abs = ''; }
  return abs ? `${rel} · ${abs}` : rel;
}

// Post a system message to the room chat. Stored with `system: true` so the
// renderer styles it differently and the notification path skips sound/popup.
// The triggering player's playerId is included so the message doesn't bump
// their own tab badge.
async function postSystemChatMessage(text) {
  if (!localState.roomCode) return;
  try {
    const chatRef = ref(db, `rooms/${localState.roomCode}/chat`);
    await push(chatRef, {
      system:   true,
      text:     String(text).slice(0, 200),
      playerId: localState.playerId || '',
      ts:       Date.now(),
    });
  } catch (e) { /* non-critical */ }
}

function _playChatDing() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    // Some browsers create the context suspended until user interaction
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    // Two-note ding (A5 → E6)
    [880, 1318].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  } catch (e) { /* audio unsupported or blocked — silent fail */ }
}

let _chatToastTimer = null;
function _showChatToast(msg) {
  const toast = document.getElementById('chat-toast');
  if (!toast) return;
  const senderIcon = _escapeChatHtml(msg.icon || '🐾');
  const senderName = _escapeChatHtml(msg.name || 'Anon');
  const preview    = _escapeChatHtml((msg.text || '').slice(0, 100));
  toast.innerHTML = `<span class="chat-toast-head">${senderIcon} ${senderName}</span>`
                  + `<span class="chat-toast-text">${preview}</span>`;
  toast.classList.add('show');
  if (_chatToastTimer) clearTimeout(_chatToastTimer);
  _chatToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4200);
}

// ── Browser-tab unread badge ──
// Reflects new chat activity (including system events) in document.title
// while the tab is hidden, so the user notices when they're in another tab.
let _tabUnreadCount = 0;
const _baseTitle = (typeof document !== 'undefined' && document.title) || 'Tippy 10';

function _renderTabTitle() {
  if (typeof document === 'undefined') return;
  if (_tabUnreadCount > 0) {
    const label = _tabUnreadCount > 9 ? '9+' : String(_tabUnreadCount);
    document.title = `(${label}) ${_baseTitle}`;
  } else {
    document.title = _baseTitle;
  }
}

function _bumpTabUnread() {
  // Only accumulate while the tab is hidden — if the user is here, they'll see
  // the in-app badge instead.
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  _tabUnreadCount++;
  _renderTabTitle();
}

function _resetTabUnread() {
  if (_tabUnreadCount === 0) return;
  _tabUnreadCount = 0;
  _renderTabTitle();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _resetTabUnread();
  });
}

function _maybeNotifyForMessage(msg) {
  if (!msg) return;
  if (msg.playerId && msg.playerId === localState.playerId) return; // my own action

  // Tab-title badge — fires for both regular and system messages when tab is hidden
  _bumpTabUnread();

  // Sound + popup are only for regular user messages (system events already have their
  // own celebration popups) and only when the chat is closed.
  if (msg.system) return;
  if (_chatOpen) return;
  const settings = window.getSettings?.();
  if (settings && settings.chatnotify === false) return;
  _playChatDing();
  _showChatToast(msg);
}

function subscribeChat() {
  if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
  if (!localState.roomCode) return;
  // Start "last seen" at "now" so existing history doesn't count as unread on join.
  _chatLastSeen      = Date.now();
  _chatMessages      = [];
  _chatNotifiedKeys  = new Set();
  _chatInitialLoaded = false;
  const chatRef = ref(db, `rooms/${localState.roomCode}/chat`);
  _chatUnsub = onValue(chatRef, snap => {
    const raw = snap.val() || {};
    _chatMessages = Object.entries(raw)
      .map(([key, msg]) => ({ key, ...(msg || {}) }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));

    // Detect newly-arrived messages (vs. the initial history snapshot)
    const newlyArrived = [];
    for (const m of _chatMessages) {
      if (!_chatNotifiedKeys.has(m.key)) {
        _chatNotifiedKeys.add(m.key);
        if (_chatInitialLoaded) newlyArrived.push(m);
      }
    }
    _chatInitialLoaded = true;

    renderChat();

    // Only notify for the newest one to avoid spamming if multiple
    // arrive in the same listener tick
    if (newlyArrived.length) {
      _maybeNotifyForMessage(newlyArrived[newlyArrived.length - 1]);
    }
  });
}

function unsubscribeChat() {
  if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
  _chatMessages      = [];
  _chatNotifiedKeys  = new Set();
  _chatInitialLoaded = false;
  _chatOpen          = false;
  const listEl = document.getElementById('chat-messages');
  if (listEl) listEl.innerHTML = '';
  document.querySelectorAll('.chat-unread-badge').forEach(b => { b.style.display = 'none'; });
  const toast = document.getElementById('chat-toast');
  if (toast) toast.classList.remove('show');
  if (_chatToastTimer) { clearTimeout(_chatToastTimer); _chatToastTimer = null; }
  _resetTabUnread();
}

function renderChat() {
  const listEl = document.getElementById('chat-messages');
  if (!listEl) return;
  const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 50;

  listEl.innerHTML = '';
  if (_chatMessages.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'chat-empty-hint';
    hint.textContent = 'No messages yet — say hi! 🐾';
    listEl.appendChild(hint);
  } else {
    // Helper: look up a player's display name from gameData (falls back to "Player")
    const playerName = (pid) =>
      localState.gameData?.players?.[pid]?.name || (pid === localState.playerId ? 'You' : 'Player');

    for (const m of _chatMessages) {
      // ── System messages render differently — centered, italic, no head/react ──
      if (m.system) {
        const row = document.createElement('div');
        row.className = 'chat-msg-system';
        const tsTitle = m.ts ? _formatTsTooltip(m.ts) : '';
        if (tsTitle) row.title = tsTitle;
        row.innerHTML = `<span class="chat-system-text">${_escapeChatHtml(m.text || '')}</span>`;
        listEl.appendChild(row);
        continue;
      }

      const isMe = m.playerId === localState.playerId;
      const row = document.createElement('div');
      row.className = 'chat-msg' + (isMe ? ' chat-msg-me' : '');
      row.dataset.msgId = m.key;
      if (m.ts) row.title = _formatTsTooltip(m.ts);

      // ── Reactions: aggregate playerIds per emoji, with a name tooltip ──
      let reactionsHtml = '';
      if (m.reactions && typeof m.reactions === 'object') {
        const chips = [];
        for (const [emoji, players] of Object.entries(m.reactions)) {
          if (!players || typeof players !== 'object') continue;
          const playerIds = Object.keys(players).filter(pid => players[pid]);
          if (playerIds.length === 0) continue;
          const mine = playerIds.includes(localState.playerId);
          const safeEmoji = _escapeChatHtml(emoji);
          // Tooltip: list every player who reacted with this emoji
          const names = playerIds.map(playerName).join(', ');
          const tooltip = _escapeChatHtml(`${names} reacted with ${emoji}`);
          chips.push(
            `<button type="button" class="chat-reaction${mine ? ' chat-reaction-mine' : ''}"`
            + ` title="${tooltip}"`
            + ` onclick="chatReactClick('${m.key}', '${encodeURIComponent(emoji)}')">`
            + `<span class="chat-reaction-emoji">${safeEmoji}</span>`
            + `<span class="chat-reaction-count">${playerIds.length}</span>`
            + `</button>`
          );
        }
        if (chips.length) reactionsHtml = `<div class="chat-reactions">${chips.join('')}</div>`;
      }

      row.innerHTML =
        `<span class="chat-msg-head">${_escapeChatHtml(m.icon || '🐾')} ${_escapeChatHtml(m.name || 'Anon')}</span>`
        + `<span class="chat-msg-text">${_escapeChatHtml(m.text || '')}</span>`
        + reactionsHtml
        + `<button type="button" class="chat-react-trigger" title="Add reaction"`
        + ` onclick="chatShowReactPicker('${m.key}', event)">＋</button>`;
      listEl.appendChild(row);
    }
  }

  if (nearBottom || _chatOpen) listEl.scrollTop = listEl.scrollHeight;
  // If the picker was open over a message that got re-rendered, re-anchor it
  if (_reactionTargetMsgId) _repositionReactionPicker();

  // Update unread badge(s) — there are two: one on the floating FAB
  // and one on the inline action-bar button. Both use class .chat-unread-badge.
  const badges = document.querySelectorAll('.chat-unread-badge');
  if (!badges.length) return;

  if (_chatOpen) {
    _chatLastSeen = Date.now();
    badges.forEach(b => { b.style.display = 'none'; });
    return;
  }

  const unread = _chatMessages.filter(m =>
    (m.ts || 0) > _chatLastSeen && m.playerId !== localState.playerId
  ).length;

  if (unread > 0) {
    const label = unread > 9 ? '9+' : String(unread);
    badges.forEach(b => {
      b.textContent = label;
      b.style.display = '';
      // Re-trigger pulse animation
      b.classList.remove('chat-pulse');
      void b.offsetWidth;
      b.classList.add('chat-pulse');
    });
  } else {
    badges.forEach(b => { b.style.display = 'none'; });
  }
}

function showChatWidget() {
  const root = document.getElementById('chat-root');
  if (root) root.style.display = '';
  // Always start minimized
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.remove('open');
  _chatOpen = false;
}

function hideChatWidget() {
  const root = document.getElementById('chat-root');
  if (root) root.style.display = 'none';
  const panel = document.getElementById('chat-panel');
  if (panel) panel.classList.remove('open');
  _chatOpen = false;
}

window.toggleChat = function() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  _chatOpen = !panel.classList.contains('open');
  panel.classList.toggle('open', _chatOpen);
  if (_chatOpen) {
    _chatLastSeen = Date.now();
    document.querySelectorAll('.chat-unread-badge').forEach(b => { b.style.display = 'none'; });
    _resetTabUnread();
    // Dismiss any visible notification toast — the user is now looking at chat
    const toast = document.getElementById('chat-toast');
    if (toast) toast.classList.remove('show');
    if (_chatToastTimer) { clearTimeout(_chatToastTimer); _chatToastTimer = null; }
    const listEl = document.getElementById('chat-messages');
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
    // Focus the input shortly after opening
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    }, 60);
  }
};

window.sendChatFromForm = function(ev) {
  if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
  window.sendChat();
  return false;
};

window.handleChatKeydown = function(ev) {
  // Enter sends; Shift+Enter is a no-op here since it's a single-line input
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    window.sendChat();
  }
};

window.sendChat = async function() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const raw = (input.value || '').trim();
  if (!raw) return;
  if (!localState.roomCode || !localState.playerId) return;
  const text = raw.slice(0, 200);
  input.value = '';
  try {
    const chatRef = ref(db, `rooms/${localState.roomCode}/chat`);
    await push(chatRef, {
      playerId: localState.playerId,
      name:     localState.playerName || 'Anon',
      icon:     localState.playerIcon || '🐾',
      text,
      ts:       Date.now(),
    });
  } catch (e) {
    // Restore text so the user can retry
    if (input && !input.value) input.value = text;
  }
};

// ── Reactions ──
let _reactionTargetMsgId = null;

function _repositionReactionPicker() {
  const picker = document.getElementById('chat-react-picker');
  const panel  = document.getElementById('chat-panel');
  if (!picker || !panel || !_reactionTargetMsgId) return;
  const msgEl = panel.querySelector(`.chat-msg[data-msg-id="${_reactionTargetMsgId}"]`);
  if (!msgEl) { _hideReactionPicker(); return; }
  const panelRect = panel.getBoundingClientRect();
  const msgRect   = msgEl.getBoundingClientRect();
  // Show the picker right ABOVE the message's react trigger (top-right of the message).
  const desiredTop  = msgRect.top - panelRect.top - 38;
  const desiredLeft = msgRect.right - panelRect.left - 230;
  picker.style.top  = Math.max(6, desiredTop) + 'px';
  picker.style.left = Math.max(8, Math.min(desiredLeft, panel.clientWidth - 230)) + 'px';
}

function _showReactionPicker(msgId) {
  _reactionTargetMsgId = msgId;
  const picker = document.getElementById('chat-react-picker');
  if (!picker) return;
  picker.classList.add('open');
  _repositionReactionPicker();
}

function _hideReactionPicker() {
  _reactionTargetMsgId = null;
  const picker = document.getElementById('chat-react-picker');
  if (picker) picker.classList.remove('open');
}

async function _toggleReaction(msgId, emoji) {
  if (!localState.roomCode || !localState.playerId || !msgId || !emoji) return;
  const msg = _chatMessages.find(m => m.key === msgId);
  const myAlready = !!(msg && msg.reactions && msg.reactions[emoji] && msg.reactions[emoji][localState.playerId]);
  const path = `rooms/${localState.roomCode}/chat/${msgId}/reactions/${emoji}/${localState.playerId}`;
  try {
    if (myAlready) {
      await remove(ref(db, path));
    } else {
      await set(ref(db, path), true);
    }
  } catch (e) { /* non-critical */ }
}

window.chatShowReactPicker = function(msgId, ev) {
  if (ev) ev.stopPropagation();
  if (_reactionTargetMsgId === msgId) {
    _hideReactionPicker();
  } else {
    _showReactionPicker(msgId);
  }
};

window.chatPickerSelect = function(emoji) {
  const target = _reactionTargetMsgId;
  _hideReactionPicker();
  if (target) _toggleReaction(target, emoji);
};

// Toggle an existing reaction chip (click to add yours / remove yours).
// The emoji is URI-encoded in the chip's onclick attribute to keep it safe
// inside a single-quoted JS string literal in the rendered HTML.
window.chatReactClick = function(msgId, encodedEmoji) {
  const emoji = decodeURIComponent(encodedEmoji);
  _toggleReaction(msgId, emoji);
};

// Close the picker on any click outside it (or outside a react trigger).
document.addEventListener('click', (ev) => {
  const picker = document.getElementById('chat-react-picker');
  if (!picker || !picker.classList.contains('open')) return;
  if (picker.contains(ev.target)) return;
  if (ev.target.closest && ev.target.closest('.chat-react-trigger')) return;
  _hideReactionPicker();
});
