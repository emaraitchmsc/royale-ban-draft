// ============================================
// Royale Draft — Client Application
// ============================================

const socket = io();

// ── Audio Engine ──
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
  if (!audioCtx) {
    try { audioCtx = new AudioCtx(); } catch (e) { return; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  const now = audioCtx.currentTime;
  
  if (type === 'hover') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'turn') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(659.25, now + 0.15); 
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } else if (type === 'pick') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.15);
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'ban') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

// ── State ──
let state = {
  roomCode: null,
  playerNumber: null,
  playerName: null,
  cards: [],
  currentDraft: null,
  activeFilter: 'all',
  activeRarity: null,
  searchQuery: '',
  selectedCardId: null,
  opponentHoverId: null,
  timerInterval: null
};

// ── DOM Cache ──
const $ = (id) => document.getElementById(id);
const screens = {
  lobby: $('screen-lobby'),
  waiting: $('screen-waiting'),
  naming: $('screen-naming'),
  draft: $('screen-draft'),
  finished: $('screen-finished'),
};

// ── Screen Management ──
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ── Load Cards ──
async function loadCards() {
  const res = await fetch('/api/cards');
  state.cards = await res.json();
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  if (roomCode) {
    $('input-code').value = roomCode;
    joinRoom();
  }
});

// ── LOBBY ──
$('btn-create').addEventListener('click', () => {
  socket.emit('create-room', (response) => {
    if (response.success) {
      state.roomCode = response.code;
      state.playerNumber = response.playerNumber;
      state.playerName = 'Player 1';
      
      const url = new URL(window.location.href);
      url.searchParams.set('room', response.code);
      window.history.replaceState(null, '', url.href);
      $('share-link').value = url.href;

      showScreen('waiting');
    }
  });
});

$('btn-copy-link').addEventListener('click', () => {
  navigator.clipboard.writeText($('share-link').value).then(() => {
    showCopiedFeedback();
  });
});

$('btn-join').addEventListener('click', () => joinRoom());
$('input-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});

function joinRoom() {
  const code = $('input-code').value.trim();
  if (!code) return;
  socket.emit('join-room', { code }, (response) => {
    if (response.success) {
      state.roomCode = response.code;
      state.playerNumber = response.playerNumber;
      state.playerName = `Player ${response.playerNumber}`;
      // Draft will auto-start — phase-change event will handle screen transition
    } else {
      showToast(response.error, 'error');
    }
  });
}

// ── NAMING ──
$('btn-name').addEventListener('click', () => submitName());
$('input-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitName();
});

function submitName() {
  const name = $('input-name').value.trim();
  if (!name) return;
  state.playerName = name;
  socket.emit('set-name', { code: state.roomCode, name }, (response) => {
    if (!response.success) {
      showToast(response.error, 'error');
    }
  });
}

// ── Socket Events ──
socket.on('phase-change', ({ phase }) => {
  if (phase === 'drafting') {
    loadCards().then(() => {
      showScreen('draft');
      if (state.currentDraft) updateDraftUI(state.currentDraft);
    });
  }
});

socket.on('room-update', (draftState) => {
  const isNewTurn = state.currentDraft?.currentStep !== draftState.currentStep;
  state.currentDraft = draftState;
  $('header-room-code').textContent = draftState.code;
  updateDraftUI(draftState);
  
  if (isNewTurn && draftState.currentTurn && draftState.currentTurn.player === state.playerNumber) {
    playSound('turn');
    showTurnOverlay(draftState.currentTurn.action);
  }
});

socket.on('draft-update', (data) => {
  const isNewTurn = state.currentDraft?.currentStep !== data.currentStep;
  state.currentDraft = data;
  state.selectedCardId = null; // reset selection
  updateDraftUI(data);

  // Add to action log
  if (data.lastAction) {
    playSound(data.lastAction.action === 'ban' ? 'ban' : 'pick');
    addToLog(data.lastAction);
    showToast(
      `${data.lastAction.playerName} ${data.lastAction.action === 'ban' ? 'banned' : 'picked'} ${data.lastAction.card.name}`,
      data.lastAction.action
    );
  }
  
  if (isNewTurn && data.currentTurn && data.currentTurn.player === state.playerNumber) {
    playSound('turn');
    showTurnOverlay(data.currentTurn.action);
  }
});

socket.on('hover-update', ({ player, cardId }) => {
  if (player !== state.playerNumber) {
    state.opponentHoverId = cardId;
    if (state.currentDraft) renderCardPool(state.currentDraft);
  }
});

socket.on('draft-finished', (data) => {
  renderFinishedScreen(data);
  showScreen('finished');
});

socket.on('player-disconnected', ({ player, playerName }) => {
  if (state.currentDraft && state.currentDraft.state !== 'finished') {
    $('disconnect-overlay').classList.remove('hidden');
    setTimeout(() => {
      $('disconnect-overlay').classList.add('hidden');
    }, 8000);
  }
});

// ── Draft UI ──
function updateDraftUI(draft) {
  if (!draft) return;

  // Player names
  $('name-p1').textContent = draft.players[0]?.name || 'Player 1';
  $('name-p2').textContent = draft.players[1]?.name || 'Player 2';

  // Deck counts
  const p1Picks = draft.pickedCards[1]?.length || 0;
  const p2Picks = draft.pickedCards[2]?.length || 0;
  $('deck-count-p1').textContent = `${p1Picks} / 8 cards`;
  $('deck-count-p2').textContent = `${p2Picks} / 8 cards`;

  // Phase label
  const phaseLabel = $('phase-label');
  phaseLabel.textContent = draft.phaseLabel;
  phaseLabel.className = 'draft-phase-label';
  if (draft.currentTurn) {
    phaseLabel.classList.add(draft.currentTurn.action === 'ban' ? 'ban-phase' : 'pick-phase');
  }

  // Turn info
  const turnInfo = $('turn-info');
  if (draft.currentTurn) {
    const playerClass = `p${draft.currentTurn.player}`;
    const playerName = draft.players[draft.currentTurn.player - 1]?.name || `Player ${draft.currentTurn.player}`;
    const action = draft.currentTurn.action === 'ban' ? '🚫 Ban' : '✅ Pick';
    turnInfo.innerHTML = `<span class="highlight ${playerClass}">${playerName}</span> — ${action} a card`;
  } else {
    turnInfo.textContent = 'Draft Complete!';
  }

  // Step counter & progress
  $('step-display').textContent = `${draft.currentStep} / ${draft.totalSteps}`;
  const progress = (draft.currentStep / draft.totalSteps) * 100;
  $('draft-progress-bar').style.width = `${progress}%`;

  // Active turn glow on player headers
  $('header-p1').classList.remove('active-turn-glow', 'p1');
  $('header-p2').classList.remove('active-turn-glow', 'p2');
  if (draft.currentTurn) {
    const headerEl = $(`header-p${draft.currentTurn.player}`);
    headerEl.classList.add('active-turn-glow', `p${draft.currentTurn.player}`);
  }

  // Timer logic
  clearInterval(state.timerInterval);
  const timerEl = $('draft-timer');
  if (draft.currentTurn && draft.turnEndTime) {
    timerEl.classList.remove('hidden');
    updateTimerDisplay(draft.turnEndTime);
    state.timerInterval = setInterval(() => updateTimerDisplay(draft.turnEndTime), 1000);
  } else {
    timerEl.classList.add('hidden');
  }

  // Action banner & Lock In
  updateActionBanner(draft);

  // Render deck slots
  renderDeckSlots(draft);

  // Render ban slots
  renderBanSlots(draft);

  // Render card pool
  renderCardPool(draft);
}

function updateTimerDisplay(endTime) {
  const timerEl = $('draft-timer');
  const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
  timerEl.textContent = remaining;
  if (remaining <= 5) {
    timerEl.classList.add('danger');
  } else {
    timerEl.classList.remove('danger');
  }
}

function showTurnOverlay(action) {
  const overlay = $('turn-overlay');
  const textEl = $('turn-overlay-text');
  
  // Need to force reflow to restart animation
  overlay.classList.remove('hidden');
  overlay.className = `turn-overlay ${action}-turn`;
  textEl.style.animation = 'none';
  textEl.offsetHeight; // trigger reflow
  textEl.style.animation = null;
  
  textEl.textContent = action === 'ban' ? 'BAN A CARD' : 'PICK A CARD';
  
  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 2000);
}

function updateActionBanner(draft) {
  const banner = $('action-banner');
  
  if (!draft.currentTurn) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const isYourTurn = draft.currentTurn.player === state.playerNumber;

  if (isYourTurn) {
    const action = draft.currentTurn.action;
    banner.className = `action-banner your-turn ${action === 'ban' ? 'ban-action' : ''}`;
    banner.textContent = action === 'ban'
      ? '🚫 Your turn — Double tap to Ban!'
      : '✅ Your turn — Double tap to Pick!';
  } else {
    const opponentName = draft.players[(draft.currentTurn.player) - 1]?.name || 'Opponent';
    banner.className = 'action-banner waiting-turn';
    banner.textContent = `Waiting for ${opponentName}...`;
  }
}

function renderDeckSlots(draft) {
  const elixirSvg = `<svg viewBox="0 0 24 24" style="width:12px;height:12px;margin-right:2px"><path fill="#f0abfc" d="M12 2c0 0-7 9.8-7 14a7 7 0 1 0 14 0c0-4.2-7-14-7-14z"/></svg>`;
  for (let p = 1; p <= 2; p++) {
    const container = $(`deck-p${p}`);
    const picks = draft.pickedCards[p] || [];
    let html = '';
    for (let i = 0; i < 8; i++) {
      if (picks[i]) {
        const card = picks[i];
        const rarityClass = card.rarity.toLowerCase();
        html += `
          <div class="deck-slot filled rarity-${rarityClass}" ${card.imageUrl ? `style="background-image: url('${card.imageUrl}')"` : ''}>
            <span class="elixir-drop deck-elixir">${elixirSvg}${card.elixir}</span>
          </div>`;
      } else {
        html += `<div class="deck-slot empty"></div>`;
      }
    }
    container.innerHTML = html;
  }
}

function renderBanSlots(draft) {
  // Count bans per player from the draft sequence
  // Initial: 2 bans each, then up to 3 more each = 5 per player max
  const p1Bans = draft.bannedCards.filter(c => c.bannedBy === 1);
  const p2Bans = draft.bannedCards.filter(c => c.bannedBy === 2);
  const maxBans = 5;

  for (let p = 1; p <= 2; p++) {
    const container = $(`bans-p${p}`);
    const bans = p === 1 ? p1Bans : p2Bans;
    let html = '';
    for (let i = 0; i < maxBans; i++) {
      if (bans[i]) {
        const card = bans[i];
        html += `
          <div class="ban-slot filled" ${card.imageUrl ? `style="background-image: url('${card.imageUrl}')"` : ''}>
            <div class="ban-overlay">✕</div>
          </div>`;
      } else {
        html += `<div class="ban-slot empty"></div>`;
      }
    }
    container.innerHTML = html;
  }
}

function renderCardPool(draft) {
  const pool = $('card-pool');
  const bannedIds = new Set(draft.bannedCards.map(c => c.id));
  const pickedIds = new Set([
    ...(draft.pickedCards[1] || []).map(c => c.id),
    ...(draft.pickedCards[2] || []).map(c => c.id),
  ]);

  const isYourTurn = draft.currentTurn && draft.currentTurn.player === state.playerNumber;
  const isFinished = !draft.currentTurn;

  // Filter cards
  let filtered = state.cards;
  if (state.activeFilter !== 'all') {
    filtered = filtered.filter(c => c.type === state.activeFilter);
  }
  if (state.activeRarity) {
    filtered = filtered.filter(c => c.rarity === state.activeRarity);
  }
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q));
  }

  // Sort by elixir cost
  filtered.sort((a, b) => a.elixir - b.elixir);

  // Group by category
  const groups = {
    'Troop': [], 'Spell': [], 'Building': []
  };
  for (const card of filtered) {
    if (groups[card.type]) groups[card.type].push(card);
  }

  let html = '';
  const elixirSvg = `<svg viewBox="0 0 24 24"><path fill="#f0abfc" d="M12 2c0 0-7 9.8-7 14a7 7 0 1 0 14 0c0-4.2-7-14-7-14z"/></svg>`;

  // Your-turn edge glow on draft screen
  const draftScreen = $('screen-draft');
  draftScreen.classList.remove('your-turn-active', 'ban-turn-active');
  if (isYourTurn && draft.currentTurn) {
    draftScreen.classList.add('your-turn-active');
    if (draft.currentTurn.action === 'ban') draftScreen.classList.add('ban-turn-active');
  }

  for (const [type, cards] of Object.entries(groups)) {
    if (cards.length === 0) continue;
    
    cards.sort((a, b) => {
      const aStatus = bannedIds.has(a.id) ? 2 : pickedIds.has(a.id) ? 1 : 0;
      const bStatus = bannedIds.has(b.id) ? 2 : pickedIds.has(b.id) ? 1 : 0;
      return aStatus - bStatus;
    });

    html += `
      <div class="category-column">
        <div class="category-header ${type.toLowerCase()}">${type}s <span class="count">(${cards.length})</span></div>
        <div class="category-grid">`;
    
    for (const card of cards) {
      const isBanned = bannedIds.has(card.id);
      const isPicked = pickedIds.has(card.id);
      const rarityClass = card.rarity.toLowerCase();
      let classes = `card-item rarity-${rarityClass}`;

      if (isBanned) classes += ' banned-card';
      else if (isPicked) classes += ' picked-card';
      else if (!isYourTurn || isFinished) classes += ' not-your-turn';
      
      let cardOverlay = '';
      if (state.selectedCardId === card.id) {
        classes += ` hovered-p${state.playerNumber}`;
        if (draft.currentTurn) {
          const isBan = draft.currentTurn.action === 'ban';
          const icon = isBan ? '🚫' : '✅';
          const text = isBan ? 'BAN' : 'PICK';
          cardOverlay = `<div class="action-overlay ${draft.currentTurn.action}">
            <span class="overlay-icon">${icon}</span>
            <span class="overlay-text">${text}</span>
            <span class="overlay-hint">tap again to confirm</span>
          </div>`;
        }
      } else if (state.opponentHoverId === card.id) {
        const oppPNum = state.playerNumber === 1 ? 2 : 1;
        classes += ` hovered-p${oppPNum}`;
      }

      html += `
        <div class="${classes}" data-card-id="${card.id}" ${(!isBanned && !isPicked && isYourTurn) ? `onclick="selectCard(${card.id})"` : ''}
             ${card.imageUrl ? `style="background-image: url('${card.imageUrl}');"` : ''}>
          <div class="elixir-pill">${elixirSvg}${card.elixir}</div>
          ${cardOverlay}
          <div class="card-info">
            <span class="card-name">${card.name}</span>
          </div>
        </div>`;
    }
    html += `</div></div>`;
  }

  pool.innerHTML = html;
}

// ── Card Selection ──
function selectCard(cardId) {
  const draft = state.currentDraft;
  if (!draft || !draft.currentTurn) return;
  if (draft.currentTurn.player !== state.playerNumber) return;

  if (state.selectedCardId !== cardId) {
    playSound('hover');
    state.selectedCardId = cardId;
    renderCardPool(draft);
    socket.emit('hover-card', { code: state.roomCode, cardId });
  } else {
    // Second tap! Lock it in.
    socket.emit('draft-action', { code: state.roomCode, cardId }, (response) => {
      if (!response.success) {
        showToast(response.error, 'error');
      }
    });
  }
}

// ── Filters ──
document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeFilter = btn.dataset.filter;
    if (state.currentDraft) renderCardPool(state.currentDraft);
  });
});

document.querySelectorAll('.filter-btn[data-rarity]').forEach(btn => {
  btn.addEventListener('click', () => {
    const wasActive = btn.classList.contains('active');
    document.querySelectorAll('.filter-btn[data-rarity]').forEach(b => b.classList.remove('active'));
    if (!wasActive) {
      btn.classList.add('active');
      state.activeRarity = btn.dataset.rarity;
    } else {
      state.activeRarity = null;
    }
    if (state.currentDraft) renderCardPool(state.currentDraft);
  });
});

$('card-search').addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  if (state.currentDraft) renderCardPool(state.currentDraft);
});

// ── Action Log ──
function addToLog(action) {
  const container = $('action-log-entries');
  const entry = document.createElement('div');
  entry.className = 'action-log-entry';
  entry.innerHTML = `
    <span class="action-type ${action.action}">${action.action}</span>
    ${action.playerName}: <strong>${action.card.name}</strong>
  `;
  container.insertBefore(entry, container.firstChild);

  // Keep only last 20 entries
  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
}

// ── Toast ──
let toastTimer = null;
function showToast(message, type = 'pick') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2500);
}

// ── Copied Feedback ──
function showCopiedFeedback() {
  const el = $('copied-feedback');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1500);
}

// ── Finished Screen ──
function renderFinishedScreen(data) {
  const decksContainer = $('finished-decks');
  let decksHtml = '';

  data.players.forEach((player, i) => {
    const pClass = i === 0 ? 'p1' : 'p2';
    const avgElixir = (player.deck.reduce((sum, c) => sum + c.elixir, 0) / player.deck.length).toFixed(1);

    decksHtml += `
      <div class="finished-player-deck ${pClass}">
        <div class="finished-player-name ${pClass}">${player.name}</div>
        <div class="finished-deck-list">
          ${player.deck.map(card => {
            const rarityClass = card.rarity.toLowerCase();
            return `<div class="finished-deck-card">
              <span class="rarity-dot ${rarityClass}"></span>
              <span style="flex:1">${card.name}</span>
              <span class="elixir-badge">${card.elixir}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="finished-elixir-avg">
          Avg Elixir: <span>${avgElixir}</span>
        </div>
        ${player.deckLink ? `
          <button class="btn btn-gold btn-small deck-link-btn" onclick="copyDeckLink('${player.deckLink}')">
            📋 Copy Deck Link
          </button>
        ` : ''}
      </div>`;
  });

  decksContainer.innerHTML = decksHtml;

  // Bans summary
  const bansContainer = $('finished-bans');
  const banChips = data.bannedCards.map(card => {
    const playerName = data.players[card.bannedBy - 1]?.name || `P${card.bannedBy}`;
    return `<div class="finished-ban-chip">
      🚫 ${card.name}
      <span class="ban-by">by ${playerName}</span>
    </div>`;
  }).join('');

  bansContainer.innerHTML = `
    <h3>🚫 Banned Cards (${data.bannedCards.length})</h3>
    <div class="finished-ban-list">${banChips}</div>
  `;
}

function copyDeckLink(link) {
  navigator.clipboard.writeText(link).then(() => {
    showCopiedFeedback();
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = link;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopiedFeedback();
  });
}

$('btn-new-session').addEventListener('click', () => {
  state = {
    roomCode: null,
    playerNumber: null,
    playerName: null,
    cards: [],
    currentDraft: null,
    activeFilter: 'all',
    activeRarity: null,
    searchQuery: '',
  };
  showScreen('lobby');
});

// ── Init ──
showScreen('lobby');
