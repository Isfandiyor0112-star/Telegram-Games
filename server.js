const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Keep-Alive endpoint for UptimeRobot / Cron-job.org
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', activeRooms: Object.keys(rooms).length }));

// Optional Telegram Bot Polling / Webhook support (if BOT_TOKEN is set in Environment Variables)
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://telegram-games-uno.onrender.com';
const MINI_APP_URL = (process.env.MINI_APP_URL || '').replace(/\/+$/, '');

if (BOT_TOKEN) {
  let offset = 0;
  setInterval(async () => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=1`);
      const data = await res.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const msg = update.message;
          if (msg && msg.text && (msg.text.startsWith('/startgame') || msg.text.startsWith('/uno') || msg.text.startsWith('/start'))) {
            const chatId = msg.chat.id;
            const roomCode = `uno_${Math.floor(1000 + Math.random() * 9000)}`;
            const playUrl = MINI_APP_URL ? `${MINI_APP_URL}?startapp=${roomCode}` : `${APP_URL}?room=${roomCode}`;
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `🎴 *3D UNO — Новый стол #${roomCode}!*\nЗаходите и начинайте игру! / Yangi stolga qo'shiling!`,
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [[
                    { text: "🎮 Присоединиться к игре / O'yinga kirish", url: playUrl }
                  ]]
                }
              })
            });
          }
        }
      }
    } catch (e) {
      // Ignore polling network hiccups
    }
  }, 2500);
}

// ==========================================
// UNO GAME ENGINE
// ==========================================
const COLORS = ['red', 'yellow', 'green', 'blue'];
const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

function createDeck() {
  const deck = [];
  let idCounter = 1;
  for (const color of COLORS) {
    deck.push({ id: `c_${idCounter++}`, color, value: '0' });
    for (let i = 1; i <= 9; i++) {
      deck.push({ id: `c_${idCounter++}`, color, value: String(i) });
      deck.push({ id: `c_${idCounter++}`, color, value: String(i) });
    }
    for (const action of ['skip', 'reverse', 'draw2']) {
      deck.push({ id: `c_${idCounter++}`, color, value: action });
      deck.push({ id: `c_${idCounter++}`, color, value: action });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `c_${idCounter++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `c_${idCounter++}`, color: 'wild', value: 'wild4' });
  }
  return shuffle(deck);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const rooms = {};

function getOrCreateRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      id: roomId,
      players: [], // { id, socketId, name, avatar, isBot, hand: [], saidUno: false }
      started: false,
      deck: [],
      discardPile: [],
      currentColor: 'red',
      currentValue: '0',
      turnIndex: 0,
      direction: 1, // 1 clockwise, -1 counter-clockwise
      winner: null,
      lastActionText: '',
      botTimer: null
    };
  }
  return rooms[roomId];
}

function drawFromDeck(room, count = 1) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      if (room.discardPile.length <= 1) {
        room.deck = createDeck();
      } else {
        const top = room.discardPile.pop();
        room.deck = shuffle(room.discardPile.map(c => ({
          id: c.id,
          color: (c.value === 'wild' || c.value === 'wild4') ? 'wild' : c.color,
          value: c.value
        })));
        room.discardPile = [top];
      }
    }
    drawn.push(room.deck.pop());
  }
  return drawn;
}

function canPlayCard(card, room) {
  if (!card) return false;
  if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild4') return true;
  if (card.color === room.currentColor) return true;
  if (card.value === room.currentValue) return true;
  return false;
}

function getNextPlayerIndex(room, steps = 1) {
  const len = room.players.length;
  if (len === 0) return 0;
  return (((room.turnIndex + room.direction * steps) % len) + len) % len;
}

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const publicPlayers = room.players.map((p, idx) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    isBot: p.isBot,
    cardCount: p.hand.length,
    saidUno: p.saidUno,
    isTurn: room.started && room.turnIndex === idx
  }));

  const topCard = room.discardPile[room.discardPile.length - 1] || null;

  room.players.forEach(p => {
    if (!p.isBot && p.socketId) {
      io.to(p.socketId).emit('game_state', {
        roomId: room.id,
        started: room.started,
        players: publicPlayers,
        myHand: p.hand,
        myId: p.id,
        mySaidUno: p.saidUno,
        miniAppUrl: MINI_APP_URL,
        topCard,
        discardPile: room.discardPile.slice(-7),
        currentColor: room.currentColor,
        currentValue: room.currentValue,
        turnPlayerId: room.players[room.turnIndex]?.id || null,
        direction: room.direction,
        deckCount: room.deck.length,
        winner: room.winner,
        lastActionText: room.lastActionText
      });
    }
  });
}

function scheduleBotTurnIfNeeded(roomId) {
  const room = rooms[roomId];
  if (!room || !room.started || room.winner) return;

  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }

  const currentPlayer = room.players[room.turnIndex];
  if (currentPlayer && currentPlayer.isBot) {
    room.botTimer = setTimeout(() => {
      executeBotTurn(roomId);
    }, 1400);
  }
}

function executeBotTurn(roomId) {
  const room = rooms[roomId];
  if (!room || !room.started || room.winner) return;

  const bot = room.players[room.turnIndex];
  if (!bot || !bot.isBot) return;

  const playable = bot.hand.filter(c => canPlayCard(c, room));
  if (playable.length > 0) {
    // Prefer normal color cards before wilds
    const nonWild = playable.filter(c => c.color !== 'wild');
    const cardToPlay = nonWild.length > 0 ? nonWild[0] : playable[0];

    let chosenColor = cardToPlay.color;
    if (chosenColor === 'wild') {
      const colorCounts = { red: 0, yellow: 0, green: 0, blue: 0 };
      bot.hand.forEach(c => {
        if (COLORS.includes(c.color)) colorCounts[c.color]++;
      });
      chosenColor = Object.keys(colorCounts).sort((a, b) => colorCounts[b] - colorCounts[a])[0] || 'red';
    }

    if (bot.hand.length === 2 && Math.random() < 0.75) {
      bot.saidUno = true;
      io.to(roomId).emit('uno_shout', { playerId: bot.id, playerName: bot.name });
    }

    playCardInternal(room, bot, cardToPlay.id, chosenColor);
  } else {
    room.players.forEach(p => { p.unoVulnerable = false; });
    const drawn = drawFromDeck(room, 1)[0];
    bot.hand.push(drawn);
    bot.saidUno = false;
    room.lastActionText = `🤖 ${bot.name} взял(а) карту`;

    if (canPlayCard(drawn, room)) {
      let chosenColor = drawn.color;
      if (chosenColor === 'wild') chosenColor = COLORS[Math.floor(Math.random() * 4)];
      playCardInternal(room, bot, drawn.id, chosenColor);
      return;
    } else {
      room.turnIndex = getNextPlayerIndex(room, 1);
      broadcastRoomState(roomId);
      scheduleBotTurnIfNeeded(roomId);
    }
  }
}

function playCardInternal(room, player, cardId, chosenColor) {
  const cardIndex = player.hand.findIndex(c => c.id === cardId);
  if (cardIndex === -1) return false;

  const card = player.hand[cardIndex];
  if (!canPlayCard(card, room)) return false;

  // Close catch window for everyone as soon as the next move is played
  room.players.forEach(p => { p.unoVulnerable = false; });

  player.hand.splice(cardIndex, 1);
  if (player.hand.length === 1) {
    if (!player.saidUno) {
      player.unoVulnerable = true;
      player.unoGraceUntil = Date.now() + 1500; // 1.5s grace period before catch opens
    }
  } else {
    player.saidUno = false;
    player.unoVulnerable = false;
  }

  let rawAngle = Math.floor(Math.random() * 56) - 28;
  if (Math.abs(rawAngle) < 6) rawAngle = rawAngle < 0 ? -9 : 9;
  const playedCard = {
    ...card,
    angle: rawAngle,
    offsetX: Math.floor(Math.random() * 24) - 12,
    offsetY: Math.floor(Math.random() * 20) - 10
  };
  room.discardPile.push(playedCard);

  if (card.color === 'wild') {
    room.currentColor = COLORS.includes(chosenColor) ? chosenColor : 'red';
  } else {
    room.currentColor = card.color;
  }
  room.currentValue = card.value;

  io.to(room.id).emit('card_played_anim', {
    playerId: player.id,
    playerName: player.name,
    card: playedCard,
    chosenColor: room.currentColor
  });

  // Check Winner
  if (player.hand.length === 0) {
    room.winner = {
      id: player.id,
      name: player.name,
      avatar: player.avatar
    };
    room.started = false;
    room.lastActionText = `🏆 ${player.name} ПОБЕДИЛ(А)!`;
    broadcastRoomState(room.id);
    io.to(room.id).emit('game_over', { winner: room.winner });
    return true;
  }

  let step = 1;
  const totalPlayers = room.players.length;

  if (card.value === 'reverse') {
    if (totalPlayers === 2) {
      step = 2;
      room.lastActionText = `🔄 ${player.name} сыграл(а) Разворот (Пропуск хода!)`;
    } else {
      room.direction *= -1;
      room.lastActionText = `🔄 ${player.name} изменил(а) направление!`;
    }
  } else if (card.value === 'skip') {
    step = 2;
    const skippedPlayer = room.players[getNextPlayerIndex(room, 1)];
    room.lastActionText = `🚫 ${player.name} заблокировал(а) ${skippedPlayer ? skippedPlayer.name : ''}!`;
  } else if (card.value === 'draw2') {
    const victimIdx = getNextPlayerIndex(room, 1);
    const victim = room.players[victimIdx];
    if (victim) {
      victim.hand.push(...drawFromDeck(room, 2));
      victim.saidUno = false;
      room.lastActionText = `💥 ${player.name} кинул(а) +2 на ${victim.name}!`;
    }
    step = 2;
  } else if (card.value === 'wild4') {
    const victimIdx = getNextPlayerIndex(room, 1);
    const victim = room.players[victimIdx];
    if (victim) {
      victim.hand.push(...drawFromDeck(room, 4));
      victim.saidUno = false;
      room.lastActionText = `🔥 ${player.name} кинул(а) +4 на ${victim.name}!`;
    }
    step = 2;
  } else {
    room.lastActionText = `🎴 ${player.name} сходил(а)`;
  }

  room.turnIndex = getNextPlayerIndex(room, step);
  broadcastRoomState(room.id);
  scheduleBotTurnIfNeeded(room.id);
  return true;
}

// ==========================================
// SOCKET.IO HANDLERS
// ==========================================
io.on('connection', (socket) => {
  let currentRoomId = null;
  let currentUserId = null;

  socket.on('join_room', ({ roomId, user }) => {
    const cleanRoomId = (roomId || `uno_${Math.floor(1000 + Math.random() * 9000)}`).trim();
    if (currentRoomId && currentRoomId !== cleanRoomId) {
      socket.leave(currentRoomId);
      const prevRoom = rooms[currentRoomId];
      if (prevRoom && !prevRoom.started) {
        prevRoom.players = prevRoom.players.filter(p => p.socketId !== socket.id);
        broadcastRoomState(currentRoomId);
      }
    }
    currentRoomId = cleanRoomId;
    currentUserId = String(user.id);

    socket.join(cleanRoomId);
    const room = getOrCreateRoom(cleanRoomId);

    let existing = room.players.find(p => String(p.id) === String(user.id));
    if (existing) {
      existing.socketId = socket.id;
      existing.name = user.name || existing.name;
    } else {
      if (!room.started && room.players.length < 8) {
        room.players.push({
          id: String(user.id),
          socketId: socket.id,
          name: user.name || 'Игрок',
          avatar: user.avatar || '😎',
          isBot: false,
          hand: [],
          saidUno: false
        });
      } else if (room.started) {
        // Mid-game join as player with 7 cards if fewer than 6 players
        if (room.players.length < 6) {
          room.players.push({
            id: String(user.id),
            socketId: socket.id,
            name: user.name || 'Игрок',
            avatar: user.avatar || '😎',
            isBot: false,
            hand: drawFromDeck(room, 7),
            saidUno: false
          });
        }
      }
    }

    broadcastRoomState(cleanRoomId);
  });

  socket.on('add_bot', () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room || room.started || room.players.length >= 6) return;

    const botNames = ['AI Sardor 🤖', 'AI Jasur 🤖', 'AI Malika 🤖', 'AI Timur 🤖', 'AI Alina 🤖'];
    const usedNames = room.players.map(p => p.name);
    const availableName = botNames.find(n => !usedNames.includes(n)) || `UNO Bot #${room.players.length}`;

    room.players.push({
      id: `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      socketId: null,
      name: availableName,
      avatar: '🤖',
      isBot: true,
      hand: [],
      saidUno: false
    });

    broadcastRoomState(currentRoomId);
  });

  socket.on('remove_bots', () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room || room.started) return;
    room.players = room.players.filter(p => !p.isBot);
    broadcastRoomState(currentRoomId);
  });

  socket.on('start_game', () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    // Auto add a bot if only 1 player is in the room so they can play immediately
    if (room.players.length === 1) {
      room.players.push({
        id: `bot_${Date.now()}`,
        socketId: null,
        name: 'AI Bot 🤖',
        avatar: '🤖',
        isBot: true,
        hand: [],
        saidUno: false
      });
    }

    room.deck = createDeck();
    room.discardPile = [];
    room.winner = null;
    room.direction = 1;
    room.turnIndex = 0;
    room.started = true;

    room.players.forEach(p => {
      p.hand = drawFromDeck(room, 7);
      p.saidUno = false;
      p.unoVulnerable = false;
      p.unoGraceUntil = 0;
    });

    // Pick initial non-wild card
    let firstCard = drawFromDeck(room, 1)[0];
    while (firstCard.color === 'wild' || ['skip', 'reverse', 'draw2'].includes(firstCard.value)) {
      room.deck.unshift(firstCard);
      room.deck = shuffle(room.deck);
      firstCard = drawFromDeck(room, 1)[0];
    }

    firstCard.angle = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.floor(Math.random() * 11));
    firstCard.offsetX = Math.floor(Math.random() * 10) - 5;
    firstCard.offsetY = Math.floor(Math.random() * 10) - 5;
    room.discardPile.push(firstCard);
    room.currentColor = firstCard.color;
    room.currentValue = firstCard.value;
    room.lastActionText = '🔥 Игра началась! / O\'yin boshlandi!';

    broadcastRoomState(currentRoomId);
    scheduleBotTurnIfNeeded(currentRoomId);
  });

  socket.on('play_card', ({ cardId, chosenColor }) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room || !room.started) return;

    const currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer || String(currentPlayer.id) !== String(currentUserId)) return;

    playCardInternal(room, currentPlayer, cardId, chosenColor);
  });

  socket.on('draw_card', () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room || !room.started) return;

    const currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer || String(currentPlayer.id) !== String(currentUserId)) return;

    // Close catch window for everyone when next player draws
    room.players.forEach(p => { p.unoVulnerable = false; });

    const drawn = drawFromDeck(room, 1)[0];
    currentPlayer.hand.push(drawn);
    currentPlayer.saidUno = false;
    currentPlayer.unoVulnerable = false;
    room.lastActionText = `📥 ${currentPlayer.name} взял(а) карту`;

    // If drawn card cannot be played immediately, pass turn
    if (!canPlayCard(drawn, room)) {
      room.turnIndex = getNextPlayerIndex(room, 1);
    }

    broadcastRoomState(currentRoomId);
    scheduleBotTurnIfNeeded(currentRoomId);
  });

  socket.on('say_uno', () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room || !room.started) return;

    const player = room.players.find(p => String(p.id) === String(currentUserId));
    if (!player) return;

    if (player.hand.length <= 2 && player.hand.length > 0 && !player.saidUno) {
      player.saidUno = true;
      player.unoVulnerable = false;
      room.lastActionText = `🚨 ${player.name} крикнул(а) УНО!`;
      io.to(currentRoomId).emit('uno_shout', { playerId: player.id, playerName: player.name });
      broadcastRoomState(currentRoomId);
    }
  });

  socket.on('catch_uno', (payload = {}) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room || !room.started) return;

    const catcher = room.players.find(p => String(p.id) === String(currentUserId));
    if (!catcher) return;

    const targetId = payload && payload.targetPlayerId ? String(payload.targetPlayerId) : null;
    const now = Date.now();
    let caughtSomeone = false;

    room.players.forEach(p => {
      const matchesTarget = targetId ? String(p.id) === targetId : true;
      if (
        matchesTarget &&
        p.id !== catcher.id &&
        p.hand.length === 1 &&
        !p.saidUno &&
        p.unoVulnerable &&
        now >= (p.unoGraceUntil || 0)
      ) {
        p.hand.push(...drawFromDeck(room, 2));
        p.saidUno = false;
        p.unoVulnerable = false;
        caughtSomeone = true;
        room.lastActionText = `⚡ ${catcher.name} поймал(а) ${p.name} без УНО! (+2 карты)`;
        io.to(currentRoomId).emit('uno_caught', { catcherName: catcher.name, victimName: p.name });
      }
    });

    if (caughtSomeone) {
      broadcastRoomState(currentRoomId);
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    if (!room.started) {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      broadcastRoomState(currentRoomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 3D UNO Telegram Mini App Server listening on port ${PORT}`);
});
