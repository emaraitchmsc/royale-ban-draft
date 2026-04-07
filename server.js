const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const CARDS = require('./cards');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Serve card data to the client
app.get('/api/cards', (req, res) => {
  res.json(CARDS);
});

// ============ DRAFT SEQUENCE ============
// Phase 1: Initial bans (2 each)
// Phase 2: Pick-Ban rounds until 8 cards each
// Format: P1 ban, P2 ban, P1 ban, P2 ban,
//         P1 pick, P2 pick, P1 ban, P2 ban,
//         P2 pick, P1 pick, P2 ban, P1 ban,
//         P1 pick, P2 pick, P1 ban, P2 ban,
//         P2 pick, P1 pick, P2 ban, P1 ban,
//         P1 pick, P2 pick,
//         P2 pick, P1 pick,
//         P1 pick, P2 pick,
//         P2 pick, P1 pick
const DRAFT_SEQUENCE = [
  // Phase 1: Initial bans
  { action: 'ban', player: 1 },
  { action: 'ban', player: 2 },
  { action: 'ban', player: 1 },
  { action: 'ban', player: 2 },

  // Round 1: picks then bans
  { action: 'pick', player: 1 },
  { action: 'pick', player: 2 },
  { action: 'ban', player: 1 },
  { action: 'ban', player: 2 },

  // Round 2: reversed picks then bans
  { action: 'pick', player: 2 },
  { action: 'pick', player: 1 },
  { action: 'ban', player: 2 },
  { action: 'ban', player: 1 },

  // Round 3: picks then bans
  { action: 'pick', player: 1 },
  { action: 'pick', player: 2 },
  { action: 'ban', player: 1 },
  { action: 'ban', player: 2 },

  // Round 4: reversed picks then bans
  { action: 'pick', player: 2 },
  { action: 'pick', player: 1 },
  { action: 'ban', player: 2 },
  { action: 'ban', player: 1 },

  // Remaining picks (no more bans)
  { action: 'pick', player: 1 },
  { action: 'pick', player: 2 },
  { action: 'pick', player: 2 },
  { action: 'pick', player: 1 },
  { action: 'pick', player: 1 },
  { action: 'pick', player: 2 },
  { action: 'pick', player: 2 },
  { action: 'pick', player: 1 },
];

// ============ ROOM MANAGEMENT ============
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(hostSocketId) {
  let code;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = {
    code,
    players: [{ socketId: hostSocketId, name: null, deck: [], bans: [] }],
    currentStep: 0,
    bannedCards: [],
    pickedCards: { 1: [], 2: [] },
    state: 'waiting', // waiting, naming, drafting, finished
    createdAt: Date.now(),
    turnEndTime: null, // For the 30-second timer
    hoveredCardId: null, // P1 or P2 current hover
  };
  rooms.set(code, room);
  return room;
}

function getPlayerNumber(room, socketId) {
  const idx = room.players.findIndex(p => p.socketId === socketId);
  return idx === -1 ? null : idx + 1;
}

function getCurrentTurn(room) {
  if (room.currentStep >= DRAFT_SEQUENCE.length) return null;
  return DRAFT_SEQUENCE[room.currentStep];
}

function getPhaseLabel(room) {
  if (room.currentStep >= DRAFT_SEQUENCE.length) return 'Draft Complete';
  const step = DRAFT_SEQUENCE[room.currentStep];
  const p1Picks = room.pickedCards[1].length;
  const p2Picks = room.pickedCards[2].length;
  if (room.currentStep < 4) return 'Initial Ban Phase';
  if (p1Picks >= 8 && p2Picks >= 8) return 'Draft Complete';
  return step.action === 'ban' ? 'Ban Phase' : 'Pick Phase';
}

function getDraftState(room) {
  const turn = getCurrentTurn(room);
  return {
    code: room.code,
    state: room.state,
    players: room.players.map(p => ({
      name: p.name,
      deckCount: p.deck.length,
    })),
    currentStep: room.currentStep,
    currentTurn: turn,
    phaseLabel: getPhaseLabel(room),
    bannedCards: room.bannedCards,
    pickedCards: room.pickedCards,
    totalSteps: DRAFT_SEQUENCE.length,
    turnEndTime: room.turnEndTime,
    hoveredCardId: room.hoveredCardId,
  };
}

// Timer logic: Advance state on timeout
function processTimeouts() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.state === 'drafting' && room.turnEndTime && now >= room.turnEndTime) {
      // Turn timed out
      const turn = getCurrentTurn(room);
      if (!turn) continue;

      // Auto pick/ban a random available card
      const allPickedIds = [...room.pickedCards[1], ...room.pickedCards[2]].map(c => c.id);
      const allBannedIds = room.bannedCards.map(c => c.id);
      const availableCards = CARDS.filter(c => !allPickedIds.includes(c.id) && !allBannedIds.includes(c.id));
      
      if (availableCards.length === 0) continue;
      
      // Prefer random common/rare to not screw up the draft too much with random legends?
      // Actually truly random is fine as a penalty.
      const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
      
      executeDraftAction(room, turn.player, randomCard.id, true);
    }
  }
}
setInterval(processTimeouts, 1000);

function executeDraftAction(room, pNum, cardId, isTimeout = false) {
  const turn = getCurrentTurn(room);
  if (!turn) return false;

  const card = CARDS.find(c => c.id === cardId);
  if (!card) return false;

  if (turn.action === 'ban') {
    room.bannedCards.push({ ...card, bannedBy: pNum });
    room.players[pNum - 1].bans.push(card);
  } else {
    room.pickedCards[pNum].push(card);
    room.players[pNum - 1].deck.push(card);
  }

  room.currentStep++;
  room.hoveredCardId = null; // reset hover

  if (room.currentStep >= DRAFT_SEQUENCE.length) {
    room.state = 'finished';
    room.turnEndTime = null;
  } else {
    // Start 30 second timer for next turn
    room.turnEndTime = Date.now() + 30000;
  }

  // Broadcast update with the action info
  io.to(room.code).emit('draft-update', {
    ...getDraftState(room),
    lastAction: {
      player: pNum,
      playerName: room.players[pNum - 1].name,
      action: turn.action,
      card: card,
      isTimeout
    },
  });

  if (room.state === 'finished') {
    io.to(room.code).emit('draft-finished', {
      players: room.players.map(p => ({
        name: p.name,
        deck: p.deck,
        bans: p.bans,
        deckLink: generateDeckLink(p.deck),
      })),
      bannedCards: room.bannedCards,
    });
  }
  return true;
}

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', (callback) => {
    const room = createRoom(socket.id);
    socket.join(room.code);
    callback({ success: true, code: room.code, playerNumber: 1 });
    console.log(`Room ${room.code} created by ${socket.id}`);
  });

  socket.on('join-room', ({ code }, callback) => {
    const roomCode = code.toUpperCase().trim();
    const room = rooms.get(roomCode);
    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }

    // Check if player is reconnecting
    const existingIdx = room.players.findIndex(p => p.socketId === socket.id);
    if (existingIdx !== -1) {
      socket.join(roomCode);
      return callback({ success: true, code: roomCode, playerNumber: existingIdx + 1 });
    }

    if (room.players.length >= 2) {
      return callback({ success: false, error: 'Room is full' });
    }

    room.players.push({ socketId: socket.id, name: null, deck: [], bans: [] });
    socket.join(roomCode);

    // Auto-assign names and start immediately
    room.players[0].name = 'Player 1';
    room.players[1].name = 'Player 2';
    room.state = 'drafting';
    room.turnEndTime = Date.now() + 30000;

    callback({ success: true, code: roomCode, playerNumber: 2 });
    io.to(roomCode).emit('room-update', getDraftState(room));
    io.to(roomCode).emit('phase-change', { phase: 'drafting' });
    console.log(`${socket.id} joined room ${roomCode} — Draft auto-started!`);
  });

  socket.on('set-name', ({ code, name }, callback) => {
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: 'Room not found' });

    const pNum = getPlayerNumber(room, socket.id);
    if (!pNum) return callback({ success: false, error: 'Not in this room' });

    room.players[pNum - 1].name = name.trim().substring(0, 20);
    callback({ success: true });

    // Check if both players have names
    if (room.players.length === 2 && room.players[0].name && room.players[1].name) {
      if (room.state !== 'drafting') {
        room.state = 'drafting';
        room.turnEndTime = Date.now() + 30000; // start the 30s timer
      }
      io.to(code).emit('room-update', getDraftState(room));
      io.to(code).emit('phase-change', { phase: 'drafting' });
    } else {
      io.to(code).emit('room-update', getDraftState(room));
    }
  });

  socket.on('draft-action', ({ code, cardId }, callback) => {
    const room = rooms.get(code);
    if (!room) return callback({ success: false, error: 'Room not found' });
    if (room.state !== 'drafting') return callback({ success: false, error: 'Not in draft phase' });

    const pNum = getPlayerNumber(room, socket.id);
    if (!pNum) return callback({ success: false, error: 'Not in this room' });

    const turn = getCurrentTurn(room);
    if (!turn) return callback({ success: false, error: 'Draft is finished' });

    if (turn.player !== pNum) {
      return callback({ success: false, error: "Not your turn" });
    }

    // Check if card is already banned or picked
    const allPickedIds = [...room.pickedCards[1], ...room.pickedCards[2]].map(c => c.id);
    const allBannedIds = room.bannedCards.map(c => c.id);
    if (allPickedIds.includes(cardId) || allBannedIds.includes(cardId)) {
      return callback({ success: false, error: 'Card already taken' });
    }

    // Execute the action using our helper
    if (executeDraftAction(room, pNum, cardId)) {
      callback({ success: true });
    } else {
      callback({ success: false, error: 'Action failed' });
    }
  });

  socket.on('hover-card', ({ code, cardId }) => {
    const room = rooms.get(code);
    if (!room || room.state !== 'drafting') return;

    const pNum = getPlayerNumber(room, socket.id);
    const turn = getCurrentTurn(room);
    
    // Only the active player can hover
    if (!pNum || !turn || turn.player !== pNum) return;

    room.hoveredCardId = cardId;
    io.to(code).emit('hover-update', { player: pNum, cardId });
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    // Notify rooms this player was in
    for (const [code, room] of rooms) {
      const pNum = getPlayerNumber(room, socket.id);
      if (pNum) {
        io.to(code).emit('player-disconnected', { player: pNum, playerName: room.players[pNum - 1].name });
      }
    }
  });
});

function generateDeckLink(deck) {
  if (deck.length !== 8) return null;
  const ids = deck.map(c => c.id).join(';');
  return `https://link.clashroyale.com/deck/en?deck=${ids}`;
}

// Cleanup stale rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 2 * 60 * 60 * 1000) { // 2 hours
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  ⚔️  Royale Pick/Ban Builder running at http://localhost:${PORT}\n`);
});
