// ═══════════════════════════════════════════
//  ui.js  — DOM rendering helpers
// ═══════════════════════════════════════════

import { renderCard, PHASES } from './cards.js';
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
}

// Show lobby on load
showScreen('lobby');

// ── Message toast ──
let _msgTimer = null;
export function showMessage(text, duration = 2500) {
  const el = document.getElementById('game-message');
  el.textContent = text;
  el.classList.add('show');
  if (_msgTimer) clearTimeout(_msgTimer);
  _msgTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Render full board ──
export function renderBoard(data, localState) {
  const myId  = localState.playerId;
  const order = data.playerOrder || [];

  // HUD
  document.getElementById('hud-room').textContent = localState.roomCode;
  const myPlayer = data.players?.[myId];
  const phaseNum  = Math.min(myPlayer?.phase || 1, 10);
  document.getElementById('hud-phase').textContent = phaseNum;
  document.getElementById('my-phase-num').textContent = phaseNum;
  document.getElementById('my-phase-desc').textContent = PHASES[phaseNum-1]?.desc || '';
  document.getElementById('my-name-display').textContent = myPlayer?.name || '';

  // Turn indicator
  const ind = document.getElementById('turn-indicator');
  const currentName = data.players?.[data.currentTurn]?.name || '?';
  if (data.currentTurn === myId) {
    ind.textContent = data.turnPhase === 'draw' ? '⬆ Your turn — Draw a card' : '⬆ Your turn — Play or Discard';
    ind.classList.add('my-turn');
  } else {
    ind.textContent = `${currentName}'s turn`;
    ind.classList.remove('my-turn');
  }

  // Opponents
  renderOpponents(data, myId);

  // Discard top
  const discardPile = data.discardPile || [];
  const topCard = discardPile[discardPile.length - 1];
  const discardEl = document.getElementById('discard-top');
  discardEl.innerHTML = '';
  if (topCard) {
    const cEl = renderCard(topCard);
    discardEl.appendChild(cEl);
  }

  // Melds
  renderMelds(data, myId);

  // My hand
  renderHand(localState);
  updateActionButtons();
}

// ── Opponents ──
function renderOpponents(data, myId) {
  const area  = document.getElementById('opponents-area');
  const order = data.playerOrder || [];
  area.innerHTML = '';

  for (const pid of order) {
    if (pid === myId) continue;
    const p = data.players[pid];
    const panel = document.createElement('div');
    panel.className = 'opponent-panel' + (data.currentTurn === pid ? ' active-turn' : '');

    const phaseNum = Math.min(p.phase || 1, 10);
    panel.innerHTML = `
      <div class="opp-name">${p.name} ${data.currentTurn === pid ? '▶' : ''}</div>
      <div class="opp-info">Phase ${phaseNum} · ${p.score || 0} pts ${p.phaseDone ? '✓' : ''}</div>
      <div class="opp-cards"></div>
    `;
    const cardsEl = panel.querySelector('.opp-cards');
    const count = p.handCount || 0;
    for (let i = 0; i < Math.min(count, 20); i++) {
      const back = document.createElement('div');
      back.className = 'opp-card-back';
      cardsEl.appendChild(back);
    }
    area.appendChild(panel);
  }
}

// ── Melds ──
function renderMelds(data, myId) {
  const area  = document.getElementById('meld-area');
  area.innerHTML = '';
  const melds = data.melds || {};

  for (const [ownerId, groups] of Object.entries(melds)) {
    const ownerName = data.players?.[ownerId]?.name || ownerId;
    groups.forEach((group, gi) => {
      const div = document.createElement('div');
      div.className = 'meld-group';
      div.innerHTML = `<div class="meld-group-label">${ownerName} — ${group.partType}</div>`;

      group.cards.forEach(card => {
        const cEl = renderCard(card, {
          onClick: () => window.hitMeld(ownerId, gi)
        });
        cEl.title = 'Click to hit this meld';
        div.appendChild(cEl);
      });

      area.appendChild(div);
    });
  }
}

// ── My Hand ──
export function renderHand(localState) {
  const zone = document.getElementById('my-hand');
  zone.innerHTML = '';
  const data = localState.gameData;
  const isMyTurn   = data?.currentTurn === localState.playerId;
  const isPlayPhase = data?.turnPhase === 'play';

  localState.hand.forEach(card => {
    const isSelected = localState.selectedCards.includes(card.id);
    const cEl = renderCard(card, {
      onClick: (c, el) => {
        if (isMyTurn && isPlayPhase) window.toggleSelect(c, el);
      }
    });
    if (isSelected) cEl.classList.add('selected');
    zone.appendChild(cEl);
  });
}
