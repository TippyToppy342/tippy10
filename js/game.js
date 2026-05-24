// ═══════════════════════════════════════════
//  game.js  — Firebase-backed game state
// ═══════════════════════════════════════════

import { db } from './firebase-config.js';
import { ref, set, get, update, onValue, push } from
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { buildDeck, shuffle, cardPoints, validatePhase, PHASES } from './cards.js';
import { renderBoard, renderHand, showMessage, showScreen } from './ui.js';

// ── Local state ──
export let localState = {
  playerId: null,
  playerName: null,
  roomCode: null,
  isHost: false,
  hand: [],
  selectedCards: [],
  gameData: null,
};

// ─────────────────────────────────────────────
//  LOBBY
// ─────────────────────────────────────────────
window.createRoom = async function() {
  const name = document.getElementById('input-name').value.trim();
  const room = document.getElementById('input-room').value.trim().toUpperCase() || randomCode();
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
      [localState.playerId]: { name, phase: 1, score: 0, handCount: 0, phaseDone: false }
    },
    playerOrder: [localState.playerId],
  });

  enterWaiting();
};

window.joinRoom = async function() {
  const name = document.getElementById('input-name').value.trim();
  const room = document.getElementById('input-room').value.trim().toUpperCase();
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
  updates[`rooms/${room}/players/${localState.playerId}`] = { name, phase: 1, score: 0, handCount: 0, phaseDone: false };
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
  if (data.status === 'waiting') {
    updateWaitingUI(data);
  } else if (data.status === 'playing') {
    if (document.getElementById('screen-game').style.display === 'none' ||
        !document.getElementById('screen-game').classList.contains('active')) {
      showScreen('game');
    }
    // Sync hand from Firebase
    const myData = data.players?.[localState.playerId];
    if (myData?.hand) localState.hand = myData.hand;
    renderBoard(data, localState);
  } else if (data.status === 'ended') {
    showEndScreen(data);
  }
}

function updateWaitingUI(data) {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  (data.playerOrder || []).forEach(pid => {
    const p = data.players[pid];
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (pid === data.host ? ' host' : '');
    chip.textContent = p.name + (pid === data.host ? ' 👑' : '');
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
  const order = data.playerOrder;
  const deck = buildDeck();

  // Deal 10 cards to each player
  const playerHands = {};
  const playerUpdates = {};
  let deckPos = 0;
  for (const pid of order) {
    playerHands[pid] = deck.slice(deckPos, deckPos + 10);
    deckPos += 10;
    playerUpdates[`rooms/${localState.roomCode}/players/${pid}/hand`] = playerHands[pid];
    playerUpdates[`rooms/${localState.roomCode}/players/${pid}/handCount`] = 10;
  }

  const drawPile  = deck.slice(deckPos);
  const topDiscard = drawPile.pop();

  await update(ref(db), {
    ...playerUpdates,
    [`rooms/${localState.roomCode}/status`]:      'playing',
    [`rooms/${localState.roomCode}/drawPile`]:    drawPile,
    [`rooms/${localState.roomCode}/discardPile`]: [topDiscard],
    [`rooms/${localState.roomCode}/currentTurn`]: order[0],
    [`rooms/${localState.roomCode}/turnPhase`]:   'draw',   // 'draw' | 'play'
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
    let pile = [...(data.drawPile || [])];
    if (!pile.length) {
      // Reshuffle discard (keep top)
      const discardPile = [...(data.discardPile || [])];
      const top = discardPile.pop();
      pile = shuffle(discardPile);
      updates[`rooms/${localState.roomCode}/discardPile`] = [top];
    }
    draw = pile.pop();
    updates[`rooms/${localState.roomCode}/drawPile`] = pile;
  } else {
    const discardPile = [...(data.discardPile || [])];
    if (!discardPile.length) { showMessage('Discard pile is empty'); return; }
    draw = discardPile.pop();
    updates[`rooms/${localState.roomCode}/discardPile`] = discardPile;
  }

  const newHand = [...localState.hand, draw];
  localState.hand = newHand;
  localState.selectedCards = [];
  updates[`rooms/${localState.roomCode}/players/${localState.playerId}/hand`] = newHand;
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

  const phaseId   = myPlayer.phase;
  const selected  = localState.selectedCards;
  const phaseObj  = PHASES[phaseId - 1];

  const selectedCardObjs = selected.map(id => localState.hand.find(c => c.id === id)).filter(Boolean);
  const result = validatePhase(selectedCardObjs, phaseId);

  if (!result) {
    showMessage(`That doesn't complete Phase ${phaseId}: ${phaseObj.desc}`);
    return;
  }

  // Remove selected from hand
  const usedIds = new Set(selectedCardObjs.map(c => c.id));
  const newHand = localState.hand.filter(c => !usedIds.has(c.id));
  localState.hand = newHand;
  localState.selectedCards = [];

  // Build meld entries
  const melds = data.melds || {};
  const meldKey = localState.playerId;
  melds[meldKey] = result.map((group, i) => ({
    ownerId: localState.playerId,
    partIndex: i,
    partType: phaseObj.parts[i].type,
    partCount: phaseObj.parts[i].count,
    cards: group,
  }));

  const updates = {
    [`rooms/${localState.roomCode}/melds`]: melds,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]: newHand,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`]: newHand.length,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/phaseDone`]: true,
  };
  await update(ref(db), updates);
  renderHand(localState);
  updateActionButtons();
  showMessage(`Phase ${phaseId} laid down! ✓`);
};

// ─────────────────────────────────────────────
//  HIT (add to meld)
// ─────────────────────────────────────────────
window.hitMeld = async function(ownerId, groupIndex) {
  const data = localState.gameData;
  if (!data || data.currentTurn !== localState.playerId) { showMessage('Not your turn!'); return; }
  if (data.turnPhase !== 'play') { showMessage('Draw a card first'); return; }
  const myPlayer = data.players[localState.playerId];
  if (!myPlayer.phaseDone) { showMessage('Lay down your phase first'); return; }

  const selected = localState.selectedCards;
  if (selected.length !== 1) { showMessage('Select exactly 1 card to hit'); return; }

  const card = localState.hand.find(c => c.id === selected[0]);
  if (!card) return;

  const melds = JSON.parse(JSON.stringify(data.melds || {}));
  const group = melds[ownerId]?.[groupIndex];
  if (!group) return;

  // Validate hit
  const { canHit } = await import('./cards.js');
  if (!canHit(card, group.cards, { type: group.partType })) {
    showMessage("That card doesn't fit there");
    return;
  }

  group.cards.push(card);
  const newHand = localState.hand.filter(c => c.id !== card.id);
  localState.hand = newHand;
  localState.selectedCards = [];

  await update(ref(db), {
    [`rooms/${localState.roomCode}/melds`]: melds,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]: newHand,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`]: newHand.length,
  });
  renderHand(localState);
  updateActionButtons();
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

  // Skip card — skip next player
  const order = data.playerOrder;
  const myIdx = order.indexOf(localState.playerId);
  let nextIdx = (myIdx + 1) % order.length;
  let skippedPlayer = null;

  if (card.type === 'skip') {
    skippedPlayer = order[nextIdx];
    nextIdx = (nextIdx + 1) % order.length;
  }

  const nextPlayer = order[nextIdx];
  const newHand = localState.hand.filter(c => c.id !== card.id);
  const discardPile = [...(data.discardPile || []), card];
  localState.hand = newHand;
  localState.selectedCards = [];

  const updates = {
    [`rooms/${localState.roomCode}/players/${localState.playerId}/hand`]: newHand,
    [`rooms/${localState.roomCode}/players/${localState.playerId}/handCount`]: newHand.length,
    [`rooms/${localState.roomCode}/discardPile`]: discardPile,
    [`rooms/${localState.roomCode}/currentTurn`]: nextPlayer,
    [`rooms/${localState.roomCode}/turnPhase`]:   'draw',
  };

  // Check if this player went out (empty hand)
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
  const order   = data.playerOrder;

  // Score remaining cards in everyone else's hands
  for (const pid of order) {
    if (pid === localState.playerId) continue;
    const theirHand = data.players[pid].hand || [];
    const pts = theirHand.reduce((sum, c) => sum + cardPoints(c), 0);
    const prevScore = data.players[pid].score || 0;
    updates[`rooms/${localState.roomCode}/players/${pid}/score`] = prevScore + pts;
  }

  // Advance phases for players who completed
  let someoneOn10Done = false;
  for (const pid of order) {
    const p = data.players[pid];
    if (p.phaseDone) {
      const nextPhase = (p.phase || 1) + 1;
      if (nextPhase > 10) someoneOn10Done = true;
      updates[`rooms/${localState.roomCode}/players/${pid}/phase`] = Math.min(nextPhase, 11);
    }
    // Reset for next hand
    updates[`rooms/${localState.roomCode}/players/${pid}/phaseDone`] = false;
  }

  // Check win condition
  if (someoneOn10Done) {
    updates[`rooms/${localState.roomCode}/status`] = 'ended';
    await update(ref(db), updates);
    return;
  }

  // Deal new hand
  const deck = buildDeck();
  let pos = 0;
  for (const pid of order) {
    const hand = deck.slice(pos, pos + 10);
    pos += 10;
    updates[`rooms/${localState.roomCode}/players/${pid}/hand`] = hand;
    updates[`rooms/${localState.roomCode}/players/${pid}/handCount`] = 10;
  }
  const drawPile   = deck.slice(pos);
  const topDiscard = drawPile.pop();
  updates[`rooms/${localState.roomCode}/drawPile`]    = drawPile;
  updates[`rooms/${localState.roomCode}/discardPile`] = [topDiscard];
  updates[`rooms/${localState.roomCode}/melds`]       = {};
  updates[`rooms/${localState.roomCode}/currentTurn`] = order[0];
  updates[`rooms/${localState.roomCode}/turnPhase`]   = 'draw';
  updates[`rooms/${localState.roomCode}/handNum`]     = (data.handNum || 1) + 1;

  await update(ref(db), updates);
}

// ─────────────────────────────────────────────
//  SORT HAND
// ─────────────────────────────────────────────
window.sortHand = function() {
  localState.hand.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.color !== b.color) return a.color.localeCompare(b.color);
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
  const isMyTurn = data?.currentTurn === localState.playerId;
  const isPlayPhase = data?.turnPhase === 'play';
  const sel = localState.selectedCards;

  document.getElementById('btn-discard').disabled = !(isMyTurn && isPlayPhase && sel.length === 1);

  const myPlayer = data?.players?.[localState.playerId];
  const phaseDone = myPlayer?.phaseDone;
  document.getElementById('btn-lay').disabled = !(isMyTurn && isPlayPhase && !phaseDone && sel.length >= 2);
}

// ─────────────────────────────────────────────
//  END SCREEN
// ─────────────────────────────────────────────
function showEndScreen(data) {
  showScreen('end');
  const players = Object.entries(data.players || {})
    .sort((a,b) => {
      const pa = a[1], pb = b[1];
      if (pb.phase !== pa.phase) return pb.phase - pa.phase;
      return pa.score - pb.score;
    });

  const winner = players[0];
  document.getElementById('end-title').textContent =
    `${winner[1].name} Wins! 🎉`;

  const scoresEl = document.getElementById('end-scores');
  scoresEl.innerHTML = '';
  players.forEach(([pid, p], i) => {
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `<span>${i+1}. ${p.name}</span><span>Phase ${Math.min(p.phase,10)} · ${p.score} pts</span>`;
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
