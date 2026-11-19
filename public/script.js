const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  try {
    if (typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }
    if (typeof tg.requestFullscreen === 'function') {
      tg.requestFullscreen();
    }
  } catch (e) {}
}


function syncViewportLayout() {
  const vh = (tg && tg.viewportHeight && tg.viewportHeight > 220)
    ? tg.viewportHeight
    : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${vh}px`);
  document.body.classList.toggle('compact-modal', vh < 660);
  document.body.classList.toggle('ultra-compact-modal', vh < 540);
}
if (tg && typeof tg.onEvent === 'function') {
  tg.onEvent('viewportChanged', syncViewportLayout);
  tg.onEvent('fullscreenChanged', syncViewportLayout);
}
window.addEventListener('resize', syncViewportLayout);
window.addEventListener('orientationchange', () => setTimeout(syncViewportLayout, 150));
syncViewportLayout();

function toggleFullscreen() {
  try {
    if (tg && typeof tg.requestFullscreen === 'function') {
      if (tg.isFullscreen && typeof tg.exitFullscreen === 'function') {
        tg.exitFullscreen();
      } else {
        tg.requestFullscreen();
      }
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  } catch (e) {}
}

// ==========================================
// BILINGUAL LOCALIZATION (RU / UZ)
// ==========================================
const I18N = {
  ru: {
    subtitle: "Реалистичный 3D симулятор для Telegram-групп",
    joinBtn: "Войти",
    shareTg: "📢 Пригласить группу Telegram (/startgame)",
    playersTitle: "Игроки за столом",
    addBot: "🤖 + AI Бот",
    clearBots: "✕ Убрать ботов",
    startGame: "🔥 НАЧАТЬ ИГРУ",
    drawHint: "ВЗЯТЬ",
    catchBtn: "ПОЙМАТЬ! (+2)",
    chooseColor: "Выберите цвет",
    winnerTitle: "ПОБЕДИТЕЛЬ!",
    playAgain: "🔄 Сыграть ещё раз",
    toLobby: "В лобби",
    yourTurn: "⚡ ВАШ ХОД!",
    waitingTurn: "Ходит: ",
    colors: {
      red: "Красный",
      yellow: "Желтый",
      green: "Зеленый",
      blue: "Синий",
      wild: "Любой"
    }
  },
  uz: {
    subtitle: "Telegram guruhlar uchun 3D UNO o'yini",
    joinBtn: "Kirish",
    shareTg: "📢 Telegram guruhga ulashish (/startgame)",
    playersTitle: "Stoldagi o'yinchilar",
    addBot: "🤖 + AI Bot qo'shish",
    clearBots: "✕ Botlarni o'chirish",
    startGame: "🔥 O'YINNI BOSHLASH",
    drawHint: "OLISH",
    catchBtn: "USHLASH! (+2)",
    chooseColor: "Rangni tanlang",
    winnerTitle: "G'OLIB!",
    playAgain: "🔄 Yana o'ynash",
    toLobby: "Lobbiga qaytish",
    yourTurn: "⚡ SIZNING NAVBATINGIZ!",
    waitingTurn: "Navbat: ",
    colors: {
      red: "Qizil",
      yellow: "Sariq",
      green: "Yashil",
      blue: "Ko'k",
      wild: "Ixtiyoriy"
    }
  }
};

let currentLang = (tg?.initDataUnsafe?.user?.language_code === 'uz') ? 'uz' : 'ru';
let soundEnabled = true;

// ==========================================
// WEB AUDIO SYNTHESIZER (No external MP3 needed)
// ==========================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playTone(freq, type = 'sine', duration = 0.12, gainVal = 0.15) {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function sfxCardThrow() {
  playTone(320, 'triangle', 0.09, 0.2);
  setTimeout(() => playTone(520, 'sine', 0.08, 0.15), 40);
}

function sfxUnoShout() {
  playTone(587.33, 'sawtooth', 0.14, 0.2);
  setTimeout(() => playTone(880, 'sawtooth', 0.25, 0.25), 120);
}

function sfxWin() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
    setTimeout(() => playTone(f, 'triangle', 0.22, 0.22), idx * 110);
  });
}

function haptic(type = 'light') {
  try {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(type);
    }
  } catch (e) {}
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-toggle').innerText = soundEnabled ? '🔊' : '🔇';
}

function setLanguage(lang) {
  currentLang = lang;
  document.getElementById('lang-ru').classList.toggle('active', lang === 'ru');
  document.getElementById('lang-uz').classList.toggle('active', lang === 'uz');
  const t = I18N[lang];

  document.getElementById('txt-subtitle').innerText = t.subtitle;
  document.getElementById('txt-join-btn').innerText = t.joinBtn;
  document.getElementById('txt-share-tg').innerText = t.shareTg;
  document.getElementById('txt-players-title').innerText = t.playersTitle;
  document.getElementById('txt-add-bot').innerText = t.addBot;
  document.getElementById('txt-clear-bots').innerText = t.clearBots;
  document.getElementById('txt-start-game').innerText = t.startGame;
  document.getElementById('txt-draw-hint').innerText = t.drawHint;
  document.getElementById('txt-choose-color').innerText = t.chooseColor;
  document.getElementById('txt-winner-title').innerText = t.winnerTitle;
  document.getElementById('txt-play-again').innerText = t.playAgain;
  document.getElementById('txt-to-lobby').innerText = t.toLobby;

  if (latestState) renderGameState(latestState);
}

// ==========================================
// USER & ROOM INITIALIZATION
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room') || tg?.initDataUnsafe?.start_param || ('uno_' + Math.floor(1000 + Math.random() * 9000));

const tgUser = tg?.initDataUnsafe?.user;
const currentUser = {
  id: tgUser?.id || ('u_' + Math.floor(10000 + Math.random() * 90000)),
  name: tgUser?.first_name || ('Игрок ' + Math.floor(10 + Math.random() * 89)),
  avatar: tgUser?.photo_url ? `<img src="${tgUser.photo_url}" class="tg-avatar">` : '😎'
};

document.getElementById('room-input').value = roomId;
document.getElementById('room-badge').innerText = `#${roomId}`;

const socket = io();
let latestState = null;
let pendingWildCardId = null;
let lastRenderedTopCardId = null;

function joinCurrentRoom() {
  document.getElementById('room-badge').innerText = `#${roomId}`;
  socket.emit('join_room', { roomId, user: currentUser });
}

function changeRoom() {
  const val = document.getElementById('room-input').value.trim();
  if (!val) return;
  roomId = val;
  joinCurrentRoom();
}

function newRandomRoom() {
  haptic('light');
  roomId = 'uno_' + Math.floor(1000 + Math.random() * 9000);
  document.getElementById('room-input').value = roomId;
  joinCurrentRoom();
}

function shareToTelegramGroup() {
  const shareUrl = latestState?.miniAppUrl
    ? `${latestState.miniAppUrl}?startapp=${encodeURIComponent(roomId)}`
    : `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
  const text = currentLang === 'uz'
    ? `🎴 3D UNO o'yiniga qo'shiling! Xona: #${roomId}`
    : `🎴 Заходите за 3D-стол UNO! Комната: #${roomId}`;
  const tgShareLink = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(tgShareLink);
  } else {
    window.open(tgShareLink, '_blank');
  }
}

function addBot() {
  haptic('light');
  socket.emit('add_bot');
}

function removeBots() {
  haptic('light');
  socket.emit('remove_bots');
}

function startGame() {
  haptic('medium');
  socket.emit('start_game');
}

function playAgain() {
  document.getElementById('winner-modal').classList.add('hidden');
  socket.emit('start_game');
}

function backToLobby() {
  document.getElementById('winner-modal').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('lobby-screen').classList.add('active');
}

// ==========================================
// CARD HTML GENERATOR (SVG SYMBOLS & 3D LOOK)
// ==========================================
function formatCardSymbol(value) {
  switch (value) {
    case 'skip': return '🚫';
    case 'reverse': return '🔄';
    case 'draw2': return '+2';
    case 'wild': return '🌈';
    case 'wild4': return '+4';
    default: return value;
  }
}

function createCardElement(card, isPlayable = false) {
  const el = document.createElement('div');
  el.className = `uno-card color-${card.color} ${isPlayable ? 'playable' : 'not-playable'}`;
  const sym = formatCardSymbol(card.value);

  el.innerHTML = `
    <div class="uno-card-inner">
      <span class="card-corner top-left">${sym}</span>
      <div class="card-center-oval">
        <span class="card-main-symbol">${sym}</span>
      </div>
      <span class="card-corner bottom-right">${sym}</span>
    </div>
  `;
  return el;
}

function canPlayClient(card, state) {
  if (!state || String(state.turnPlayerId) !== String(currentUser.id)) return false;
  if (card.color === 'wild' || card.value === 'wild' || card.value === 'wild4') return true;
  if (card.color === state.currentColor) return true;
  if (card.value === state.currentValue) return true;
  return false;
}

// ==========================================
// RENDER GAME STATE
// ==========================================
function renderGameState(state) {
  latestState = state;
  const t = I18N[currentLang];

  // Update Lobby Players
  document.getElementById('players-count-badge').innerText = `${state.players.length}/6`;
  const lobbyList = document.getElementById('lobby-players-list');
  lobbyList.innerHTML = '';
  state.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'lobby-player-chip';
    chip.innerHTML = `<span>${p.avatar || '😎'}</span><span>${p.name}</span>`;
    lobbyList.appendChild(chip);
  });

  // Switch Screen
  if (state.started) {
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
  }

  // Action Toast
  if (state.lastActionText) {
    document.getElementById('action-toast').innerText = state.lastActionText;
  }

  // Deck counter
  document.getElementById('deck-count').innerText = state.deckCount;

  // Direction Ring
  const dirRing = document.getElementById('direction-ring');
  dirRing.classList.toggle('ccw', state.direction === -1);

  // Active Color Halo & Chip
  const colorMapHex = {
    red: '#ea1d24',
    yellow: '#ffca05',
    green: '#3ebd50',
    blue: '#0072bc'
  };
  const activeHex = colorMapHex[state.currentColor] || '#ea1d24';
  document.getElementById('active-color-dot').style.background = activeHex;
  document.getElementById('active-color-name').innerText = t.colors[state.currentColor] || state.currentColor;
  document.getElementById('color-halo').style.boxShadow = `0 0 45px ${activeHex}, inset 0 0 25px ${activeHex}`;
  document.getElementById('color-halo').style.borderColor = activeHex;

  // Turn Indicator
  const isMyTurn = String(state.turnPlayerId) === String(currentUser.id);
  const turnEl = document.getElementById('turn-indicator');
  if (isMyTurn) {
    turnEl.innerText = t.yourTurn;
    turnEl.classList.add('my-turn');
  } else {
    const activePlayer = state.players.find(p => String(p.id) === String(state.turnPlayerId));
    turnEl.innerText = `${t.waitingTurn}${activePlayer ? activePlayer.name : '...'}`;
    turnEl.classList.remove('my-turn');
  }

  // Render Opponents (Click avatar to stealth-catch if they forgot UNO!)
  const oppContainer = document.getElementById('opponents-container');
  oppContainer.innerHTML = '';

  state.players.forEach(p => {
    if (String(p.id) === String(currentUser.id)) return;

    const seat = document.createElement('div');
    seat.className = `opponent-seat ${p.isTurn ? 'active-turn' : ''}`;
    seat.title = currentLang === 'uz' ? "UNO aytmagan bo'lsa bosing" : "Нажмите, если забыл сказать UNO";
    seat.innerHTML = `
      ${p.saidUno ? '<div class="opp-uno-badge">UNO!</div>' : ''}
      <div class="opp-name">${p.avatar} ${p.name}</div>
      <div class="opp-cards-mini">
        <div class="mini-card-icon"></div>
        <span class="opp-count-num">×${p.cardCount}</span>
      </div>
    `;
    seat.onclick = () => onOpponentAvatarClick(p);
    oppContainer.appendChild(seat);
  });

  // UNO button: one-time activation when 1-2 cards, locked once pressed or when >2 cards
  const myHand = state.myHand || [];
  const unoBtn = document.getElementById('say-uno-btn');
  const canPressUno = myHand.length <= 2 && myHand.length > 0 && !state.mySaidUno;
  unoBtn.disabled = !canPressUno;
  unoBtn.classList.toggle('pulse-alert', canPressUno);
  unoBtn.classList.toggle('uno-confirmed', Boolean(state.mySaidUno));
  unoBtn.innerText = state.mySaidUno ? '✓ UNO' : 'UNO!';

  // Render Realistic Stacked Discard Pile (last 7 thrown cards with random angles)
  const discardZone = document.getElementById('discard-pile');
  const pile = (state.discardPile && state.discardPile.length > 0)
    ? state.discardPile
    : (state.topCard ? [state.topCard] : []);
  const newestCard = pile[pile.length - 1] || null;
  const isNewThrow = Boolean(newestCard && newestCard.id !== lastRenderedTopCardId);
  if (newestCard) {
    lastRenderedTopCardId = newestCard.id;
  }

  discardZone.innerHTML = '';
  pile.forEach((card, index) => {
    const isTop = index === pile.length - 1;
    const cardEl = createCardElement(card, false);
    cardEl.classList.remove('not-playable');
    cardEl.classList.add('discard-card-item');
    if (isTop && isNewThrow) {
      cardEl.classList.add('card-just-thrown');
    } else if (!isTop) {
      cardEl.classList.add('discard-under-card');
    }
    const angle = typeof card.angle === 'number' ? card.angle : 0;
    const ox = typeof card.offsetX === 'number' ? card.offsetX : 0;
    const oy = typeof card.offsetY === 'number' ? card.offsetY : 0;
    cardEl.style.setProperty('--tx', `${ox}px`);
    cardEl.style.setProperty('--ty', `${oy}px`);
    cardEl.style.setProperty('--rot', `${angle}deg`);
    cardEl.style.transform = `translate(${ox}px, ${oy}px) rotate(${angle}deg)`;
    cardEl.style.zIndex = index + 1;
    discardZone.appendChild(cardEl);
  });

  // Render Player POV Fan Hand
  const handContainer = document.getElementById('my-hand');
  handContainer.innerHTML = '';
  const total = myHand.length;
  const mid = (total - 1) / 2;

  myHand.forEach((card, idx) => {
    const playable = canPlayClient(card, state);
    const cardEl = createCardElement(card, playable);

    const offsetFromCenter = idx - mid;
    const rotateDeg = offsetFromCenter * Math.min(6, 36 / Math.max(1, total));
    const translateY = Math.abs(offsetFromCenter) * 3.5;
    cardEl.style.transform = `rotate(${rotateDeg}deg) translateY(${translateY}px)`;
    cardEl.style.zIndex = idx + 1;

    cardEl.onclick = () => onHandCardClick(card, playable);
    handContainer.appendChild(cardEl);
  });
}

// ==========================================
// PLAYER INTERACTIONS
// ==========================================
function onHandCardClick(card, playable) {
  if (!playable) {
    haptic('error');
    return;
  }

  haptic('medium');
  if (card.color === 'wild') {
    pendingWildCardId = card.id;
    document.getElementById('color-modal').classList.remove('hidden');
  } else {
    sfxCardThrow();
    socket.emit('play_card', { cardId: card.id, chosenColor: card.color });
  }
}

function confirmWildColor(color) {
  document.getElementById('color-modal').classList.add('hidden');
  if (!pendingWildCardId) return;
  sfxCardThrow();
  haptic('medium');
  socket.emit('play_card', { cardId: pendingWildCardId, chosenColor: color });
  pendingWildCardId = null;
}

function onDrawDeckClick() {
  if (!latestState || String(latestState.turnPlayerId) !== String(currentUser.id)) {
    haptic('error');
    return;
  }
  haptic('light');
  sfxCardThrow();
  socket.emit('draw_card');
}

function onSayUnoClick() {
  const unoBtn = document.getElementById('say-uno-btn');
  if (unoBtn.disabled) return;
  unoBtn.disabled = true;
  haptic('heavy');
  sfxUnoShout();
  socket.emit('say_uno');
}

function onOpponentAvatarClick(player) {
  haptic('light');
  socket.emit('catch_uno', { targetPlayerId: player.id });
}

function showBigShout(text) {
  const el = document.getElementById('shout-overlay');
  el.innerText = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 950);
}

// ==========================================
// SOCKET LISTENERS
// ==========================================
socket.on('game_state', (state) => {
  renderGameState(state);
});

socket.on('card_played_anim', () => {
  sfxCardThrow();
});

socket.on('uno_shout', ({ playerName }) => {
  sfxUnoShout();
  showBigShout(`UNO! (${playerName})`);
});

socket.on('uno_caught', ({ victimName }) => {
  sfxUnoShout();
  showBigShout(`+2 ${victimName}!`);
});

socket.on('game_over', ({ winner }) => {
  sfxWin();
  haptic('heavy');
  document.getElementById('winner-name-display').innerText = `${winner.avatar || '🏆'} ${winner.name}`;
  document.getElementById('winner-modal').classList.remove('hidden');
});

setLanguage(currentLang);
joinCurrentRoom();
