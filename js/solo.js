// ═══════════════════════════════════════════
//  solo.js — Single-player mode (no Firebase)
// ═══════════════════════════════════════════
//
// Owns the local game state and orchestrates AI turns. Plugs into the existing
// rendering pipeline by populating localState.gameData with the same shape
// Firebase uses, so renderBoard / renderHand / etc. just work.
//
// The window.* action functions in game.js (drawCard, layDownPhase, hitMeld,
// discardSelected, startNextRound, backToLobby) branch on localState.isSolo
// and delegate here instead of writing to Firebase.

import { localState, updateActionButtons } from './game.js';
import { buildDeck, shuffle, cardPoints, validatePhase, canHit, firebaseToArray, PHASES, sortGroupForDisplay } from './cards.js';
import { renderBoard, renderHand, showMessage, showScreen, showTippyPopup, showRoundEndScreen } from './ui.js';
import { playAiTurn, TIPPY_DIFFICULTIES } from './ai.js';

const SOLO_SAVE_KEY = 'tippy10_solo_save';

// ── Chat in solo mode (local-only) ──
let _soloChat = [];
function pushSoloChat(text, opts = {}) {
  _soloChat.push({
    key:    'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    system: !!opts.system,
    playerId: opts.playerId || '',
    name:   opts.name || '',
    icon:   opts.icon || '',
    text,
    ts:     Date.now(),
  });
  // Hand off to game.js's chat renderer
  if (typeof window.soloRenderLocalChat === 'function') {
    window.soloRenderLocalChat(_soloChat);
  }
}
export function getSoloChat() { return _soloChat; }

function tippyNarrate(text) {
  pushSoloChat(text, { system: true });
}

// ── Helpers ──
function newPlayerId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 7);
}

function nextTurnIdx(currentIdx, order, skip = false) {
  let nextIdx = (currentIdx + 1) % order.length;
  if (skip) nextIdx = (nextIdx + 1) % order.length;
  return nextIdx;
}

// ─────────────────────────────────────────────
//  START GAME — called from the lobby Play-vs-Tippy form
// ─────────────────────────────────────────────
// aiConfig: [{ difficulty: 'sleepy'|'tippy'|'gameface' }, ...]
window.startSoloGame = function(humanName, humanIcon, aiConfig) {
  const order = [];
  const players = {};
  const humanId = newPlayerId('p_h');
  order.push(humanId);
  players[humanId] = {
    name: humanName || 'You',
    icon: humanIcon || '🦁',
    phase: 1, score: 0, handCount: 0, phaseDone: false,
    isHuman: true,
  };

  aiConfig.forEach((cfg, i) => {
    const aiId = newPlayerId('p_ai');
    order.push(aiId);
    // Fall back to Medium (Sneaky Tippy) for any unrecognised difficulty
    const meta = TIPPY_DIFFICULTIES[cfg.difficulty] || TIPPY_DIFFICULTIES.sneaky;
    const suffix = aiConfig.length > 1 ? ` ${i + 1}` : '';
    players[aiId] = {
      name: meta.name + suffix,
      icon: meta.icon,
      phase: 1, score: 0, handCount: 0, phaseDone: false,
      isHuman: false,
      difficulty: cfg.difficulty,
    };
  });

  const deck = buildDeck();
  let pos = 0;
  for (const pid of order) {
    players[pid].hand = deck.slice(pos, pos + 10);
    players[pid].handCount = 10;
    pos += 10;
  }
  const drawPile  = deck.slice(pos);
  const topDiscard = drawPile.pop();

  const gameData = {
    status:      'playing',
    host:        humanId,
    players,
    playerOrder: order,
    drawPile,
    discardPile: [topDiscard],
    currentTurn: humanId,
    turnPhase:   'draw',
    melds:       {},
    handNum:     1,
    theme:       window.getSettings?.()?.theme || 'standard',
  };

  localState.isSolo     = true;
  localState.playerId   = humanId;
  localState.playerName = players[humanId].name;
  localState.playerIcon = players[humanId].icon;
  localState.roomCode   = null;
  localState.isHost     = true;
  localState.hand       = [...players[humanId].hand];
  localState.selectedCards = [];
  localState.gameData   = gameData;

  _soloChat = [];
  tippyNarrate(`🐾 Round 1 begins — good luck against ${aiConfig.length === 1 ? 'Tippy' : 'the pack'}!`);

  showScreen('game');
  renderBoard(gameData, localState);
  if (typeof window.soloShowChatWidget === 'function') window.soloShowChatWidget();
  soloSave();
};

// ─────────────────────────────────────────────
//  HUMAN ACTIONS — called from game.js when isSolo
// ─────────────────────────────────────────────
export async function soloDraw(source) {
  const data = localState.gameData;
  if (!data || data.status !== 'playing') return;
  if (data.currentTurn !== localState.playerId) { showMessage('Not your turn!'); return; }
  if (data.turnPhase !== 'draw') { showMessage('You already drew a card'); return; }

  const drawn = drawFromPile(data, source);
  if (!drawn) return;

  data.players[localState.playerId].hand.push(drawn);
  localState.hand = data.players[localState.playerId].hand;
  data.players[localState.playerId].handCount = localState.hand.length;
  data.turnPhase = 'play';
  localState.selectedCards = [];
  if (typeof window.applySortMode === 'function') window.applySortMode();
  // Animate the just-drawn card lowering into the hand
  if (typeof window.flagJustDrawnCard === 'function') window.flagJustDrawnCard(drawn.id);
  renderBoard(data, localState);
  renderHand(localState);
  updateActionButtons();
  soloSave();
}

export async function soloLayDownPhase() {
  const data = localState.gameData;
  if (!data || data.currentTurn !== localState.playerId) return;
  if (data.turnPhase !== 'play') { showMessage('Draw a card first'); return; }
  const me = data.players[localState.playerId];
  if (me.phaseDone) { showMessage('Phase already laid down!'); return; }

  const phaseId  = me.phase;
  const phaseObj = PHASES[phaseId - 1];
  const selected = localState.selectedCards;
  const selectedCardObjs = selected.map(id => localState.hand.find(c => c.id === id)).filter(Boolean);

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
  const usedIds = new Set(result.flat().map(c => c.id));
  const newHand = localState.hand.filter(c => !usedIds.has(c.id));
  if (newHand.length === 0) { showMessage('Keep at least 1 card — you must discard to end your turn!'); return; }

  // Resolve wilds in runs interactively (same modal used in multiplayer)
  const resolved = (typeof window.declareWildsSolo === 'function')
    ? await window.declareWildsSolo(result, phaseObj)
    : result;

  data.melds = data.melds || {};
  data.melds[localState.playerId] = resolved.map((group, i) => ({
    ownerId:   localState.playerId,
    partIndex: i,
    partType:  phaseObj.parts[i].type,
    partCount: phaseObj.parts[i].count,
    cards:     group,
  }));
  data.players[localState.playerId].hand = newHand;
  data.players[localState.playerId].handCount = newHand.length;
  data.players[localState.playerId].phaseDone = true;
  localState.hand = newHand;
  localState.selectedCards = [];

  renderBoard(data, localState);
  renderHand(localState);
  updateActionButtons();
  showMessage(`Phase ${phaseId} laid down! ✓`);
  // Popup + chat narration
  const myName = me.name;
  showTippyPopup(`${myName} — Phase down! Tippy is hyped!`, 'images/tippy/tippy-happy.jpeg');
  tippyNarrate(`🎯 ${myName} laid down Phase ${phaseId}!`);
  soloSave();
}

export async function soloHitMeld(ownerId, groupIndex) {
  const data = localState.gameData;
  if (!data || data.status !== 'playing') return;
  if (data.currentTurn !== localState.playerId) { showMessage('Not your turn!'); return; }
  if (data.turnPhase !== 'play') { showMessage('Draw a card first'); return; }

  const me = data.players[localState.playerId];
  if (!me.phaseDone) { showMessage('Lay down your phase first'); return; }

  const sel = localState.selectedCards;
  if (sel.length !== 1) { showMessage('Select exactly 1 card from your hand first'); return; }
  if (localState.hand.length <= 1) { showMessage('Keep 1 card — you must discard to end your turn!'); return; }

  const card = localState.hand.find(c => c.id === sel[0]);
  if (!card) return;
  const group = data.melds?.[ownerId]?.[groupIndex];
  if (!group) { showMessage('Meld not found'); return; }
  if (!canHit(card, group.cards || [], { type: group.partType })) {
    showMessage("That card doesn't fit there");
    return;
  }

  let cardToAdd = card;
  if (card.type === 'wild' && group.partType === 'run') {
    const vals = group.cards.map(c => c.declaredValue ?? c.number).sort((a, b) => a - b);
    const lo = vals[0], hi = vals[vals.length - 1];
    const canLow = lo > 1, canHigh = hi < 12;
    let dv;
    if (canLow && canHigh && typeof window.showWildChoiceModalSolo === 'function') {
      dv = await window.showWildChoiceModalSolo([lo - 1, hi + 1]);
    } else if (canLow) dv = lo - 1;
    else dv = hi + 1;
    cardToAdd = { ...card, declaredValue: dv };
  }

  group.cards.push(cardToAdd);
  group.cards = sortGroupForDisplay(group.cards, group.partType);
  const newHand = localState.hand.filter(c => c.id !== card.id);
  data.players[localState.playerId].hand = newHand;
  data.players[localState.playerId].handCount = newHand.length;
  localState.hand = newHand;
  localState.selectedCards = [];

  renderBoard(data, localState);
  renderHand(localState);
  updateActionButtons();
  showMessage('Card added! ✓');
  soloSave();
}

export async function soloDiscard() {
  const data = localState.gameData;
  if (!data || data.currentTurn !== localState.playerId) { showMessage('Not your turn!'); return; }
  if (data.turnPhase !== 'play') { showMessage('Draw a card first'); return; }

  const sel = localState.selectedCards;
  if (sel.length !== 1) { showMessage('Select exactly 1 card to discard'); return; }
  const card = localState.hand.find(c => c.id === sel[0]);
  if (!card) return;

  const order = data.playerOrder;
  const myIdx = order.indexOf(localState.playerId);
  let skip = card.type === 'skip';
  const skippedName = skip ? data.players[order[(myIdx + 1) % order.length]]?.name : null;

  const newHand = localState.hand.filter(c => c.id !== card.id);
  data.players[localState.playerId].hand = newHand;
  data.players[localState.playerId].handCount = newHand.length;
  localState.hand = newHand;
  localState.selectedCards = [];
  data.discardPile = [...(data.discardPile || []), card];

  if (skip) {
    showTippyPopup(`${data.players[localState.playerId].name}: ⊘ Skip card! Cone of shame incoming!`, 'images/tippy/tippy-cone.jpeg');
    tippyNarrate(`⊘ ${data.players[localState.playerId].name} skipped ${skippedName}`);
  }

  // Going out?
  if (newHand.length === 0) {
    await handleSoloGoOut(localState.playerId);
    return;
  }

  data.currentTurn = order[nextTurnIdx(myIdx, order, skip)];
  data.turnPhase   = 'draw';
  renderBoard(data, localState);
  renderHand(localState);
  updateActionButtons();
  soloSave();

  // If it's now an AI's turn, run AI turns until it's the human's again
  runAiTurnsUntilHuman();
}

// ─────────────────────────────────────────────
//  ROUND END / GAME END
// ─────────────────────────────────────────────
async function handleSoloGoOut(goOutPid) {
  const data    = localState.gameData;
  const order   = data.playerOrder;
  const scoreDeltas = {};
  const completedPhase = {};
  const prevPhase = {};
  for (const pid of order) {
    const p = data.players[pid];
    prevPhase[pid] = p.phase || 1;
    completedPhase[pid] = !!p.phaseDone;
    if (pid === goOutPid) {
      scoreDeltas[pid] = 0;
    } else {
      const pts = (p.hand || []).reduce((s, c) => s + cardPoints(c), 0);
      scoreDeltas[pid] = pts;
      p.score = (p.score || 0) + pts;
    }
  }
  let someoneWon = false;
  for (const pid of order) {
    const p = data.players[pid];
    if (p.phaseDone) {
      const nextPhase = (p.phase || 1) + 1;
      if (nextPhase > 10) someoneWon = true;
      p.phase = Math.min(nextPhase, 11);
    }
    p.phaseDone = false;
  }

  // Popup + chat
  const goOutName = data.players[goOutPid]?.name || 'Someone';
  showTippyPopup(`${goOutName} went out! Tippy celebrates!`, 'images/tippy/tippy-happy.jpeg');
  tippyNarrate(`🏆 ${goOutName} went out!`);

  if (someoneWon) {
    data.status = 'ended';
    renderBoard(data, localState);
    // Use existing end screen — set roomCode-less localState fine
    if (typeof window.soloShowEndScreen === 'function') window.soloShowEndScreen(data);
    soloClearSave();
    return;
  }

  data.status = 'round_end';
  data.roundSummary = {
    goOutPlayer: goOutPid,
    scoreDeltas,
    completedPhase,
    prevPhase,
    handNum: data.handNum || 1,
  };
  data.melds = {};
  showRoundEndScreen(data, localState);
  soloSave();
}

export async function soloStartNextRound() {
  const data = localState.gameData;
  if (!data) return;
  const order = data.playerOrder;
  const deck  = buildDeck();
  let pos = 0;
  for (const pid of order) {
    data.players[pid].hand = deck.slice(pos, pos + 10);
    data.players[pid].handCount = 10;
    pos += 10;
  }
  const drawPile  = deck.slice(pos);
  const topDiscard = drawPile.pop();
  const newHandNum = (data.handNum || 1) + 1;
  const startIdx   = (newHandNum - 1) % order.length;

  data.status       = 'playing';
  data.drawPile     = drawPile;
  data.discardPile  = [topDiscard];
  data.currentTurn  = order[startIdx];
  data.turnPhase    = 'draw';
  data.melds        = {};
  data.handNum      = newHandNum;
  data.roundSummary = null;
  localState.hand = data.players[localState.playerId].hand;
  localState.selectedCards = [];

  tippyNarrate(`🐾 Round ${newHandNum} begins!`);
  showScreen('game');
  renderBoard(data, localState);
  renderHand(localState);
  updateActionButtons();
  soloSave();

  // If first turn this round is an AI's, run AI turns
  runAiTurnsUntilHuman();
}

// ─────────────────────────────────────────────
//  AI TURN ORCHESTRATION
// ─────────────────────────────────────────────
let _aiRunning = false;
async function runAiTurnsUntilHuman() {
  if (_aiRunning) return;
  _aiRunning = true;
  try {
    while (true) {
      const data = localState.gameData;
      if (!data || data.status !== 'playing') break;
      if (data.currentTurn === localState.playerId) break;
      const ai = data.players[data.currentTurn];
      if (!ai || ai.isHuman) break;
      ai.id = data.currentTurn; // make sure the AI knows its own ID for adapter calls
      await playAiTurn(ai, makeAiSoloAdapter());
      // If round/game ended during AI turn, stop
      const after = localState.gameData;
      if (!after || after.status !== 'playing') break;
    }
  } finally {
    _aiRunning = false;
  }
}

function makeAiSoloAdapter() {
  // Wraps localState.gameData to provide the API ai.js expects.
  return {
    topDiscard() {
      const dp = localState.gameData?.discardPile || [];
      return dp[dp.length - 1] || null;
    },
    get melds()       { return localState.gameData?.melds       || {}; },
    get players()     { return localState.gameData?.players     || {}; },
    get playerOrder() { return localState.gameData?.playerOrder || []; },
    get currentTurn() { return localState.gameData?.currentTurn; },
    tippyChat(ai, text) {
      // Personality line — posts as a real chat message from the AI (not a system event)
      pushSoloChat(text, {
        system: false,
        playerId: ai.id || _findAiId(ai, localState.gameData),
        name: ai.name,
        icon: ai.icon,
      });
    },
    draw(ai, source) {
      const data = localState.gameData;
      const drawn = drawFromPile(data, source);
      if (!drawn) return null;
      ai.hand.push(drawn);
      ai.handCount = ai.hand.length;
      data.turnPhase = 'play';
      renderBoard(data, localState);
      return drawn;
    },
    layDown(ai, resolvedGroups) {
      const data = localState.gameData;
      const phaseObj = PHASES[ai.phase - 1];
      // Remove laid-down cards from hand
      const usedIds = new Set(resolvedGroups.flat().map(c => c.id));
      ai.hand = ai.hand.filter(c => !usedIds.has(c.id));
      ai.handCount = ai.hand.length;
      ai.phaseDone = true;
      data.melds = data.melds || {};
      data.melds[ai.id || _findAiId(ai, data)] = resolvedGroups.map((g, i) => ({
        ownerId:   ai.id || _findAiId(ai, data),
        partIndex: i,
        partType:  phaseObj.parts[i].type,
        partCount: phaseObj.parts[i].count,
        // Sort cards for display so the meld reads cleanly (numbers ascending,
        // wilds last for sets/colors; numeric order for runs)
        cards:     sortGroupForDisplay(g, phaseObj.parts[i].type),
      }));
      showTippyPopup(`${ai.name} — Phase down! 🐾`, 'images/tippy/tippy-happy.jpeg');
      tippyNarrate(`🎯 ${ai.name} laid down Phase ${ai.phase}!`);
      renderBoard(data, localState);
    },
    hit(ai, ownerId, groupIndex, card) {
      const data = localState.gameData;
      const group = data.melds[ownerId][groupIndex];
      group.cards.push(card);
      group.cards = sortGroupForDisplay(group.cards, group.partType);
      ai.hand = ai.hand.filter(c => c.id !== card.id);
      ai.handCount = ai.hand.length;
      renderBoard(data, localState);
    },
    discard(ai, card) {
      const data = localState.gameData;
      const aiId = ai.id || _findAiId(ai, data);
      ai.hand = ai.hand.filter(c => c.id !== card.id);
      ai.handCount = ai.hand.length;
      data.discardPile = [...(data.discardPile || []), card];
      const order = data.playerOrder;
      const idx   = order.indexOf(aiId);
      const skip  = card.type === 'skip';
      if (skip) {
        const skippedName = data.players[order[(idx + 1) % order.length]]?.name;
        showTippyPopup(`${ai.name}: ⊘ Skip!`, 'images/tippy/tippy-cone.jpeg');
        tippyNarrate(`⊘ ${ai.name} skipped ${skippedName}`);
      }
      if (ai.hand.length === 0) {
        // AI went out — round ends
        renderBoard(data, localState);
        handleSoloGoOut(aiId);
        return;
      }
      data.currentTurn = order[nextTurnIdx(idx, order, skip)];
      data.turnPhase   = 'draw';
      renderBoard(data, localState);
      if (data.currentTurn === localState.playerId) {
        renderHand(localState);
        updateActionButtons();
      }
      soloSave();
    },
  };
}

// Attach the player ID to the AI object on lookup so the adapter can reuse it.
function _findAiId(ai, data) {
  for (const [pid, p] of Object.entries(data.players)) {
    if (p === ai) { ai.id = pid; return pid; }
  }
  return null;
}

// ─────────────────────────────────────────────
//  Draw-pile helper (shared by human and AI)
// ─────────────────────────────────────────────
function drawFromPile(data, source) {
  if (source === 'discard') {
    const dp = data.discardPile || [];
    if (!dp.length) return null;
    const top = dp[dp.length - 1];
    if (top?.type === 'skip') return null; // not allowed
    data.discardPile = dp.slice(0, -1);
    return top;
  }
  // From draw pile (reshuffle discard if empty)
  let pile = data.drawPile || [];
  if (!pile.length) {
    const dp = data.discardPile || [];
    if (dp.length <= 1) return null;
    const top = dp[dp.length - 1];
    pile = shuffle(dp.slice(0, -1));
    data.discardPile = [top];
  }
  const card = pile[pile.length - 1];
  data.drawPile = pile.slice(0, -1);
  return card;
}

// ─────────────────────────────────────────────
//  SAVE / RESUME
// ─────────────────────────────────────────────
function soloSave() {
  try {
    const data = localState.gameData;
    if (!data || !localState.isSolo) return;
    localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify({
      gameData: data,
      playerId: localState.playerId,
      playerName: localState.playerName,
      playerIcon: localState.playerIcon,
      chat: _soloChat.slice(-40),
      ts: Date.now(),
    }));
  } catch (e) { /* localStorage unavailable */ }
}
function soloClearSave() {
  try { localStorage.removeItem(SOLO_SAVE_KEY); } catch (e) {}
}
export function hasSoloSave() {
  try { return !!localStorage.getItem(SOLO_SAVE_KEY); } catch (e) { return false; }
}
window.resumeSoloGame = function() {
  try {
    const raw = localStorage.getItem(SOLO_SAVE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved.gameData) return;
    localState.isSolo     = true;
    localState.playerId   = saved.playerId;
    localState.playerName = saved.playerName;
    localState.playerIcon = saved.playerIcon;
    localState.roomCode   = null;
    localState.isHost     = true;
    localState.gameData   = saved.gameData;
    localState.hand       = saved.gameData.players[saved.playerId]?.hand || [];
    localState.selectedCards = [];
    _soloChat = saved.chat || [];
    const status = saved.gameData.status;
    if (status === 'round_end') {
      showRoundEndScreen(saved.gameData, localState);
    } else {
      showScreen('game');
      renderBoard(saved.gameData, localState);
    }
    if (typeof window.soloShowChatWidget === 'function') window.soloShowChatWidget();
    if (status === 'playing' && saved.gameData.currentTurn !== saved.playerId) {
      runAiTurnsUntilHuman();
    }
  } catch (e) { /* corrupt save */ soloClearSave(); }
};

// Public: end solo game and return to lobby
window.endSoloGame = function() {
  localState.isSolo = false;
  localState.gameData = null;
  localState.hand = [];
  localState.selectedCards = [];
  _soloChat = [];
  soloClearSave();
  if (typeof window.soloHideChatWidget === 'function') window.soloHideChatWidget();
  showScreen('lobby');
};

// Expose action handlers for game.js to delegate to
window.soloDraw          = soloDraw;
window.soloLayDownPhase  = soloLayDownPhase;
window.soloHitMeld       = soloHitMeld;
window.soloDiscard       = soloDiscard;
window.soloStartNextRound = soloStartNextRound;
window.soloHasSave       = hasSoloSave;
