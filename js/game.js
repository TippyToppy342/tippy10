// ═══════════════════════════════════════════
//  game.js  — Firebase-backed game state
// ═══════════════════════════════════════════

import { db } from './firebase-config.js';
import { ref, set, get, update, onValue } from
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
};

// ── Popup images for celebrations ──
const POPUP_IMGS = [
  'images/tippy/tippy-happy.jpeg',
  'images/tippy/tippy-alert.jpeg',
  'images/tippy/tippy-carseat.jpeg',
  'images/tippy/tippy-park.jpeg',
  'images/tippy/tippy-lick.jpeg',
];
let _popupImgIdx = 0;
function nextPopupImg() { return POPUP_IMGS[_popupImgIdx++ % POPUP_IMGS.length]; }

async function broadcastPopup(text, img) {
  if (!localState.roomCode) return;
  try {
    await update(ref(db), {
      [`rooms/${localState.roomCode}/popup`]: { text, img: img || nextPopupImg(), ts: Date.now() }
    });
  } catch(e) { /* non-critical */ }
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
//  LOBBY
// ─────────────────────────────────────────────
window.createRoom = async function() {
  const name = document.getElementById('input-name').value.trim();
  const room = document.getElementById('input-room').value.trim().toUpperCase() || randomCode();
  const icon = localState.playerIcon || '🦁';
  if (!name) { setLobbyError('Enter your name'); return; }

  localState.playerId   = 'p_' + Math.random().toString(36).slice(2,8);
  localState.playerName = name;
  localState.roomCode   = room;
  localState.isHost     = true;

  const roomRef = ref(db, `rooms/${room}`);
  const snap = await get(roomRef);
  if (snap.exists()) { setLobbyError('Room already exists — pick another code'); return; }

  await set(roomRef, {
    host: localState.playerId,
    status: 'waiting',
    players: {
      [localState.playerId]: { name, icon, phase: 1, score: 0, handCount: 0, phaseDone: false }
    },
    playerOrder: [localState.playerId],
  });

  enterWaiting();
};

window.joinRoom = async function() {
  const name = document.getElementById('input-name').value.trim();
  const room = document.getElementById('input-room').value.trim().toUpperCase();
  const icon = localState.playerIcon || '🦁';
  if (!name) { setLobbyError('Enter your name'); return; }
  if (!room) { setLobbyError('Enter a room code'); return; }

  const roomRef = ref(db, `rooms/${room}`);
  const snap = await get(roomRef);
  if (!snap.exists()) { setLobbyError('Room not found'); return; }
  const data = snap.val();
  if (data.status !== 'waiting') { setLobbyError('Game already started'); return; }
  const count = Object.keys(data.players || {}).length;
  if (count >= 6) { setLobbyError('Room is full (max 6)'); return; }

  localState.playerId   = 'p_' + Math.random().toString(36).slice(2,8);
  localState.playerName = name;
  localState.roomCode   = room;
  localState.isHost     = false;

  const updates = {};
  updates[`rooms/${room}/players/${localState.playerId}`] = { name, icon, phase: 1, score: 0, handCount: 0, phaseDone: false };
  updates[`rooms/${room}/playerOrder`] = [...(data.playerOrder || []), localState.playerId];
  await update(ref(db), updates);

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
}

function handleRoomUpdate(data) {
  // ── Global popup broadcast ──
  if (data.popup && data.popup.ts !== localState.lastPopupTs) {
    localState.lastPopupTs = data.popup.ts;
    showTippyPopup(data.popup.text, data.popup.img);
  }

  if (data.status === 'waiting') {
    updateWaitingUI(data);
  } else if (data.status === 'playing') {
    if (!document.getElementById('screen-game').classList.contains('active')) {
      showScreen('game');
    }
    // Sync hand from Firebase, normalizing in case Firebase converted array → object
    const myData = data.players?.[localState.playerId];
    if (myData?.hand) localState.hand = firebaseToArray(myData.hand);
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
  });
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
  updates[`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]      = newHand;
  updates[`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`] = newHand.length;
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
  const result = validatePhase(selectedCardObjs, phaseId);

  if (!result) {
    showMessage(`That doesn't complete Phase ${phaseId}: ${phaseObj.desc}`);
    return;
  }

  const usedIds = new Set(selectedCardObjs.map(c => c.id));
  const newHand = localState.hand.filter(c => !usedIds.has(c.id));
  localState.hand = newHand;
  localState.selectedCards = [];

  // Sort run groups so wilds land in the correct gap positions
  const sortedResult = result.map((group, i) =>
    phaseObj.parts[i].type === 'run' ? sortRunWithWilds(group) : group
  );

  const melds = data.melds || {};
  melds[localState.playerId] = sortedResult.map((group, i) => ({
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
  await broadcastPopup(`🐾 ${myName} laid down Phase ${phaseId}!`, nextPopupImg());
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

  group.cards.push(card);
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
    nextIdx = (nextIdx + 1) % order.length;
    const skippedPlayer = data.players?.[order[nextIdx - 1 < 0 ? order.length - 1 : nextIdx - 1]];
    const myName = localState.gameData?.players?.[localState.playerId]?.name || 'Someone';
    await broadcastPopup(`⊘ ${myName} played a Skip! 🏆`, 'images/tippy/tippy-cone.jpeg');
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
  await broadcastPopup(`🏆 ${myName} went out!`, 'images/tippy/tippy-happy.jpeg');
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

  await update(ref(db), {
    ...updates,
    [`rooms/${localState.roomCode}/status`]:       'playing',
    [`rooms/${localState.roomCode}/drawPile`]:     drawPile,
    [`rooms/${localState.roomCode}/discardPile`]:  [topDiscard],
    [`rooms/${localState.roomCode}/currentTurn`]:  order[0],
    [`rooms/${localState.roomCode}/turnPhase`]:    'draw',
    [`rooms/${localState.roomCode}/melds`]:        {},
    [`rooms/${localState.roomCode}/handNum`]:      (data.handNum || 1) + 1,
    [`rooms/${localState.roomCode}/roundSummary`]: null,
  });
};

// ─────────────────────────────────────────────
//  SORT HAND
// ─────────────────────────────────────────────
window.sortHandByNumber = function() {
  const typeOrder = { number: 0, wild: 1, skip: 2 };
  localState.hand.sort((a, b) => {
    const ta = typeOrder[a.type] ?? 3, tb = typeOrder[b.type] ?? 3;
    if (ta !== tb) return ta - tb;
    return a.number - b.number;
  });
  renderHand(localState);
};

window.sortHandByColor = function() {
  const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4, skip: 5 };
  localState.hand.sort((a, b) => {
    const ca = colorOrder[a.color] ?? 6, cb = colorOrder[b.color] ?? 6;
    if (ca !== cb) return ca - cb;
    return a.number - b.number;
  });
  renderHand(localState);
};

window.sortHandWildsFirst = function() {
  // Put wilds first, skips last, numbers in middle grouped by value
  const typeOrder = { wild: 0, number: 1, skip: 2 };
  localState.hand.sort((a, b) => {
    const ta = typeOrder[a.type] ?? 3, tb = typeOrder[b.type] ?? 3;
    if (ta !== tb) return ta - tb;
    return a.number - b.number;
  });
  renderHand(localState);
};

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
function showEndScreen(data) {
  showScreen('end');
  const players = Object.entries(data.players || {})
    .sort((a, b) => {
      const pa = a[1], pb = b[1];
      if (pb.phase !== pa.phase) return pb.phase - pa.phase;
      return pa.score - pb.score;
    });

  const winner = players[0];
  document.getElementById('end-title').textContent =
    `${winner[1].icon || ''} ${winner[1].name} Wins! 🎉`;

  const scoresEl = document.getElementById('end-scores');
  scoresEl.innerHTML = '';
  players.forEach(([pid, p], i) => {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `<span>${i+1}. ${p.icon || ''} ${p.name}</span><span>Phase ${Math.min(p.phase,10)} · ${p.score} pts</span>`;
    scoresEl.appendChild(row);
  });
}

window.backToLobby = function() {
  localState.hand = [];
  localState.selectedCards = [];
  localState.gameData = null;
  if (_unsub) _unsub();
  showScreen('lobby');
};
