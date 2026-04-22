/**
 * FWG – Memory Card Game
 * script.js
 *
 * Fitur:
 * - 3 mode grid: 4×4 (8 pasang), 4×5 (10 pasang), 5×6 (15 pasang)
 * - Flip animation CSS 3D
 * - Sistem combo: pasangan berturut-turut = multiplier naik
 * - Timer countdown per mode
 * - Skor: 100 × combo per pasangan + bonus waktu sisa
 * - Animasi salah: kartu shake lalu balik lagi
 * - LocalStorage highscore per mode
 * - Statistik sesi
 * - Progress bar
 * - Responsive card size
 */

// ─── Emoji Pool ────────────────────────────────────────────────────────────────
// 15 pasang emoji (cukup untuk mode 5×6)
const EMOJI_POOL = [
  '🐉','🦊','🐸','🦋','🐬',
  '🌸','🍄','⚡','🔥','🌊',
  '🎸','🚀','💎','👾','🎃'
];

// ─── Mode Config ───────────────────────────────────────────────────────────────
// cols × rows = total kartu, pairs = total pasangan
const MODES = {
  '4x4': { cols: 4, rows: 4, pairs: 8,  timeLimit: 60,  label: '4×4' },
  '4x5': { cols: 4, rows: 5, pairs: 10, timeLimit: 90,  label: '4×5' },
  '5x6': { cols: 5, rows: 6, pairs: 15, timeLimit: 150, label: '5×6' },
};

// ─── State ─────────────────────────────────────────────────────────────────────
let currentMode   = '4x4';
let cards         = [];       // array data kartu { id, emoji, el, flipped, matched }
let flippedCards  = [];       // kartu yang sedang terbuka (max 2)
let isLocked      = false;    // kunci input saat animasi cek berlangsung
let score         = 0;
let moves         = 0;        // jumlah giliran (setiap 2 klik = 1 langkah)
let combo         = 0;        // combo streak saat ini
let maxCombo      = 0;        // combo tertinggi sesi ini
let matchedPairs  = 0;
let timerInterval = null;
let timeLeft      = 0;
let gameActive    = false;

// ─── Session Stats ─────────────────────────────────────────────────────────────
let sessPlayed = 0;
let sessPairs  = 0;
let sessMoves  = 0;
let sessCombo  = 0;

// ─── LocalStorage ──────────────────────────────────────────────────────────────
function hsKey(mode) { return `fwg_memory_hs_${mode}`; }
function getHighscore(mode) { return parseInt(localStorage.getItem(hsKey(mode)) || '0', 10); }
function saveHighscore(mode, val) { localStorage.setItem(hsKey(mode), String(val)); }

// ─── Init ──────────────────────────────────────────────────────────────────────
function initGame() {
  // Reset state
  cards        = [];
  flippedCards = [];
  isLocked     = false;
  score        = 0;
  moves        = 0;
  combo        = 0;
  maxCombo     = 0;
  matchedPairs = 0;
  gameActive   = true;

  clearTimer();

  const mode = MODES[currentMode];
  timeLeft   = mode.timeLimit;

  // Buat kartu
  buildCards(mode);
  updateHUD();
  updateProgress();
  buildComboBars();
  updateComboBars();
  updateHighscoreDisplay();

  // Mulai timer
  startTimer();
}

// ─── Build Cards ───────────────────────────────────────────────────────────────
function buildCards(mode) {
  const board = document.getElementById('cardBoard');
  board.innerHTML = '';

  // Set grid columns
  board.style.gridTemplateColumns = `repeat(${mode.cols}, 1fr)`;

  // Pilih emoji secara acak sebanyak mode.pairs
  const emojis = shuffle([...EMOJI_POOL]).slice(0, mode.pairs);

  // Duplikasi tiap emoji (jadi pasangan), lalu acak lagi
  const pairs = shuffle([...emojis, ...emojis]);

  // Hitung ukuran kartu berdasarkan lebar wrapper
  const wrapper   = document.querySelector('.board-wrapper');
  const wrapW     = wrapper.clientWidth - 32; // padding 16px kiri+kanan
  const gap       = 10;
  const cardW     = Math.floor((wrapW - gap * (mode.cols - 1)) / mode.cols);

  pairs.forEach((emoji, i) => {
    const cardData = {
      id:      i,
      emoji:   emoji,
      el:      null,
      flipped: false,
      matched: false,
    };

    // Buat elemen kartu
    const card = document.createElement('div');
    card.className   = 'card';
    card.style.width = cardW + 'px';
    card.dataset.id  = i;

    card.innerHTML = `
      <div class="card-inner">
        <div class="card-back">❓</div>
        <div class="card-front">${emoji}</div>
      </div>
    `;

    card.addEventListener('click', () => onCardClick(cardData));
    board.appendChild(card);

    cardData.el = card;
    cards.push(cardData);
  });
}

// ─── Shuffle (Fisher-Yates) ────────────────────────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Card Click ────────────────────────────────────────────────────────────────
function onCardClick(cardData) {
  if (!gameActive)         return;
  if (isLocked)            return;
  if (cardData.flipped)    return;
  if (cardData.matched)    return;
  if (flippedCards.length >= 2) return;

  // Balik kartu
  flipCard(cardData, true);
  flippedCards.push(cardData);

  // Kalau sudah 2 kartu terbuka, cek pasangan
  if (flippedCards.length === 2) {
    moves++;
    sessMoves++;
    updateHUD();
    isLocked = true;

    const [a, b] = flippedCards;

    if (a.emoji === b.emoji) {
      // ✅ Cocok!
      onMatch(a, b);
    } else {
      // ❌ Tidak cocok
      onMismatch(a, b);
    }
  }
}

// ─── Match ─────────────────────────────────────────────────────────────────────
function onMatch(a, b) {
  combo++;
  if (combo > maxCombo) maxCombo = combo;
  if (combo > sessCombo) sessCombo = combo;

  matchedPairs++;
  sessPairs++;

  // Poin: 100 × combo multiplier
  const gained = 100 * combo;
  score += gained;

  // Tandai matched
  setTimeout(() => {
    a.matched = true;
    b.matched = true;
    a.el.classList.add('matched');
    b.el.classList.add('matched');

    flippedCards = [];
    isLocked     = false;

    updateHUD();
    updateProgress();
    updateComboBars();
    popComboDisplay();

    // Animasi skor naik
    animateScoreEl();

    // Cek apakah semua pasangan selesai
    const mode = MODES[currentMode];
    if (matchedPairs === mode.pairs) {
      setTimeout(() => endGame(true), 500);
    }
  }, 300);
}

// ─── Mismatch ──────────────────────────────────────────────────────────────────
function onMismatch(a, b) {
  // Reset combo
  combo = 0;
  updateComboBars();
  updateHUD();

  // Animasi shake, lalu balik kembali
  setTimeout(() => {
    a.el.classList.add('wrong');
    b.el.classList.add('wrong');

    setTimeout(() => {
      flipCard(a, false);
      flipCard(b, false);
      a.el.classList.remove('wrong');
      b.el.classList.remove('wrong');
      flippedCards = [];
      isLocked     = false;
    }, 400);
  }, 400);
}

// ─── Flip Card ─────────────────────────────────────────────────────────────────
function flipCard(cardData, open) {
  cardData.flipped = open;
  if (open) {
    cardData.el.classList.add('flipped');
  } else {
    cardData.el.classList.remove('flipped');
  }
}

// ─── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  clearTimer();
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateTimerDisplay();
      endGame(false); // Waktu habis → kalah
    }
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  el.textContent = timeLeft + 's';
  // Warna merah kalau sisa waktu < 15 detik
  if (timeLeft <= 15) {
    el.style.color     = '#ff3333';
    el.style.textShadow = '0 0 8px #ff3333';
  } else {
    el.style.color     = '';
    el.style.textShadow = '';
  }
}

// ─── End Game ──────────────────────────────────────────────────────────────────
function endGame(won) {
  clearTimer();
  gameActive = false;

  if (won) {
    sessPlayed++;

    // Bonus waktu sisa: 10 poin per detik
    const timeBonus = timeLeft * 10;
    score += timeBonus;

    const hs    = getHighscore(currentMode);
    const isNew = score > hs;
    if (isNew) saveHighscore(currentMode, score);

    document.getElementById('goScore').textContent     = score;
    document.getElementById('goMoves').textContent     = moves;
    document.getElementById('goTime').textContent      = (MODES[currentMode].timeLimit - timeLeft) + 's';
    document.getElementById('goHighscore').textContent = isNew ? score : hs;
    document.getElementById('goNew').hidden            = !isNew;

    updateHighscoreDisplay();
    updateSessionStats();
    updateHUD();

    setTimeout(() => showOverlay('overlayWin'), 500);
  } else {
    // Waktu habis: langsung restart dengan flash
    sessPlayed++;
    updateSessionStats();
    // Flash board merah lalu restart
    const board = document.getElementById('cardBoard');
    board.style.opacity = '0.3';
    setTimeout(() => {
      board.style.opacity = '';
      initGame();
    }, 800);
  }
}

// ─── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score').textContent    = score;
  document.getElementById('highscore').textContent = getHighscore(currentMode);
  document.getElementById('moves').textContent    = moves;
  document.getElementById('combo').textContent    = '×' + (combo + 1);
  document.getElementById('comboVal').textContent = '×' + (combo + 1);
}

function updateProgress() {
  const mode    = MODES[currentMode];
  const pct     = (matchedPairs / mode.pairs) * 100;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent =
    matchedPairs + ' / ' + mode.pairs + ' pasangan';
}

function updateHighscoreDisplay() {
  const hs = getHighscore(currentMode);
  document.getElementById('statHighscore').textContent    = hs;
  document.getElementById('statHighscoreMode').textContent = 'Mode ' + MODES[currentMode].label;
}

function updateSessionStats() {
  document.getElementById('statPlayed').textContent = sessPlayed;
  document.getElementById('statPairs').textContent  = sessPairs;
  document.getElementById('statMoves').textContent  = sessMoves;
  document.getElementById('statCombo').textContent  = sessCombo;
}

// ─── Combo Bars ────────────────────────────────────────────────────────────────
const MAX_COMBO_BARS = 8;

function buildComboBars() {
  const container = document.getElementById('comboBars');
  container.innerHTML = '';
  for (let i = 0; i < MAX_COMBO_BARS; i++) {
    const bar     = document.createElement('div');
    bar.className = 'combo-bar';
    bar.dataset.idx = i;
    container.appendChild(bar);
  }
}

function updateComboBars() {
  document.querySelectorAll('.combo-bar').forEach(bar => {
    bar.classList.toggle('active', parseInt(bar.dataset.idx, 10) < combo);
  });
  // Update combo di HUD
  document.getElementById('combo').textContent    = '×' + (combo + 1);
  document.getElementById('comboVal').textContent = '×' + (combo + 1);
}

function popComboDisplay() {
  const el = document.getElementById('comboVal');
  el.classList.remove('pop');
  // Force reflow agar animasi restart
  void el.offsetWidth;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 300);
}

// ─── Score Animate ─────────────────────────────────────────────────────────────
function animateScoreEl() {
  const el = document.getElementById('score');
  el.classList.remove('score-pop');
  void el.offsetWidth;
  el.classList.add('score-pop');
  setTimeout(() => el.classList.remove('score-pop'), 250);
}

// ─── Overlays ──────────────────────────────────────────────────────────────────
function showOverlay(id) {
  hideAllOverlays();
  const el = document.getElementById(id);
  if (el) { el.hidden = false; el.style.pointerEvents = 'auto'; }
}

function hideAllOverlays() {
  ['overlayStart', 'overlayWin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.hidden = true; el.style.pointerEvents = 'none'; }
  });
}

// ─── Mode Buttons ──────────────────────────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    hideAllOverlays();
    initGame();
  });
});

// ─── Restart Button ────────────────────────────────────────────────────────────
document.getElementById('btnRestartTop').addEventListener('click', () => {
  hideAllOverlays();
  initGame();
});

// ─── Overlay Buttons ───────────────────────────────────────────────────────────
document.getElementById('btnStart').addEventListener('click', () => {
  hideAllOverlays();
  initGame();
});
document.getElementById('btnPlayAgain').addEventListener('click', () => {
  hideAllOverlays();
  initGame();
});

// ─── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') {
    hideAllOverlays();
    initGame();
  }
});

// ─── Resize: rebuild kartu jika layar berubah ukuran ──────────────────────────
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (gameActive) return; // Jangan rebuild saat game berlangsung
    // Rebuild board agar ukuran kartu menyesuaikan
    const board = document.getElementById('cardBoard');
    if (board.children.length > 0) initGame();
  }, 200);
});

// ─── Init Awal ─────────────────────────────────────────────────────────────────
(function init() {
  buildComboBars();
  updateHighscoreDisplay();
  updateSessionStats();

  // Tampilkan overlay start
  // Board tetap kosong sampai tombol Start ditekan
  showOverlay('overlayStart');
})();