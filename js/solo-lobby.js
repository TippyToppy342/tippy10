// ═══════════════════════════════════════════
//  solo-lobby.js — Lobby form for solo mode
//  Non-module so window.* functions work with inline onclick.
// ═══════════════════════════════════════════

const DIFFS = [
  { key: 'sleepy', name: 'Sleepy Tippy', label: 'Easy',   icon: '😴', blurb: 'Plays clean and steady.' },
  { key: 'sneaky', name: 'Sneaky Tippy', label: 'Medium', icon: '🦊', blurb: 'Slips cards away when you\'re not looking.' },
  { key: 'hungry', name: 'Hungry Tippy', label: 'Hard',   icon: '🦴', blurb: 'Out for blood. Reads the table, never gifts you a card.' },
];

let _soloCount = 1;
let _soloDifficulties = ['sneaky']; // default difficulty per opponent (medium)
let _soloSkipRule = 'next';         // 'next' | 'pick'

window.setSoloSkipRule = function(rule) {
  _soloSkipRule = rule;
  document.querySelectorAll('#solo-setup .skip-rule-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.rule === rule);
  });
};

window.showSoloSetup = function() {
  document.getElementById('solo-setup').style.display = '';
  document.getElementById('btn-show-solo').style.display = 'none';
  renderSoloDifficultyList();
};

window.hideSoloSetup = function() {
  document.getElementById('solo-setup').style.display = 'none';
  document.getElementById('btn-show-solo').style.display = '';
  setSoloError('');
};

window.setSoloCount = function(n) {
  _soloCount = n;
  // Resize the difficulties array, defaulting new slots to 'sneaky' (Medium)
  while (_soloDifficulties.length < n) _soloDifficulties.push('sneaky');
  _soloDifficulties.length = n;
  // Update button states
  document.querySelectorAll('.solo-count-btn').forEach(b => {
    b.classList.toggle('selected', Number(b.dataset.count) === n);
  });
  renderSoloDifficultyList();
};

function renderSoloDifficultyList() {
  const host = document.getElementById('solo-difficulty-list');
  if (!host) return;
  host.innerHTML = '';
  for (let i = 0; i < _soloCount; i++) {
    const card = document.createElement('div');
    card.className = 'solo-opp-row';
    const label = _soloCount === 1 ? 'Opponent' : `Opponent ${i + 1}`;
    let optionsHtml = '';
    for (const d of DIFFS) {
      const selected = _soloDifficulties[i] === d.key;
      optionsHtml += `
        <button type="button"
                class="solo-diff-btn${selected ? ' selected' : ''}"
                data-idx="${i}" data-key="${d.key}"
                onclick="setSoloDifficulty(${i}, '${d.key}')"
                title="${d.blurb}">
          <span class="solo-diff-icon">${d.icon}</span>
          <span class="solo-diff-label">${d.label}</span>
        </button>`;
    }
    card.innerHTML = `
      <div class="solo-opp-label">${label}</div>
      <div class="solo-diff-row">${optionsHtml}</div>
    `;
    host.appendChild(card);
  }
}

window.setSoloDifficulty = function(idx, key) {
  _soloDifficulties[idx] = key;
  renderSoloDifficultyList();
};

function setSoloError(msg) {
  const el = document.getElementById('solo-error');
  if (el) el.textContent = msg || '';
}

window.startSoloGameFromForm = function() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) { setSoloError('Enter your name above'); return; }
  if (typeof window.startSoloGame !== 'function') {
    setSoloError('Solo mode not loaded — refresh the page');
    return;
  }
  const icon = window.localStatePlayerIcon || null; // not always available; fall back below
  const cfg = _soloDifficulties.slice(0, _soloCount).map(key => ({ difficulty: key }));
  const selectedIcon = document.querySelector('.icon-option.selected')?.dataset?.icon || '🦁';
  window.startSoloGame(name, selectedIcon, cfg, { skipRule: _soloSkipRule });
};

window.dismissSoloResume = function() {
  try { localStorage.removeItem('tippy10_solo_save'); } catch (e) {}
  const el = document.getElementById('solo-resume-section');
  if (el) el.style.display = 'none';
};

// On page load: show the resume-solo prompt if a saved solo game exists
function maybeShowSoloResume() {
  try {
    const raw = localStorage.getItem('tippy10_solo_save');
    if (!raw) return;
    const el = document.getElementById('solo-resume-section');
    if (el) el.style.display = '';
  } catch (e) {}
}
document.addEventListener('DOMContentLoaded', maybeShowSoloResume);
// Also run immediately if DOM already loaded
maybeShowSoloResume();
