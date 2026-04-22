/**
 * FWG – Snake Game
 * script.js (FIXED VERSION)
 *
 * Fix:
 * 1. Langsung game over → collision check tidak boleh cek seluruh body,
 *    hanya cek dari index 1 ke atas (bukan kepala itu sendiri)
 * 2. Tombol restart tidak bisa diklik → pastikan overlay tidak diblokir
 * 3. nextDir buffer diterapkan per-tick, bukan langsung ke direction
 */

// ─── Canvas Setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const TILE = 20;

function calcGridSize() {
  const wrapper = canvas.parentElement;
  const maxW    = Math.min(wrapper.clientWidth - 4, 480);
  const maxH    = Math.min(window.innerHeight * 0.6, 480);
  const cols    = Math.floor(maxW / TILE);
  const rows    = Math.floor(maxH / TILE);
  return {
    cols: Math.max(cols, 16),
    rows: Math.max(rows, 16)
  };
}

let COLS, ROWS;

function resizeCanvas() {
  const { cols, rows } = calcGridSize();
  COLS = cols;
  ROWS = rows;
  canvas.width  = COLS * TILE;
  canvas.height = ROWS * TILE;
}

// ─── Game State ────────────────────────────────────────────────────────────────
// 'idle' | 'running' | 'paused' | 'dead'
let state      = 'idle';
let snake      = [];
let direction  = { x: 1, y: 0 };
let nextDir    = { x: 1, y: 0 };
let food       = { x: 0, y: 0 };
let score      = 0;
let appleCount = 0;
let level      = 1;
let gameLoop   = null;
let flashTimer = 0;

// ─── Session Stats ─────────────────────────────────────────────────────────────
let sessPlayed = 0;
let sessApples = 0;
let sessBest   = 0;

// ─── LocalStorage ──────────────────────────────────────────────────────────────
const HS_KEY = 'fwg_snake_highscore';
function getHighscore() { return parseInt(localStorage.getItem(HS_KEY) || '0', 10); }
function saveHighscore(val) { localStorage.setItem(HS_KEY, String(val)); }

// ─── Speed per Level ───────────────────────────────────────────────────────────
const SPEEDS = [160, 145, 130, 115, 100, 90, 80, 72, 65, 60];
function getSpeed() { return SPEEDS[Math.min(level - 1, SPEEDS.length - 1)]; }

// ─── Init / Reset ──────────────────────────────────────────────────────────────
function initGame() {
  resizeCanvas();

  const startX = Math.floor(COLS / 2);
  const startY = Math.floor(ROWS / 2);

  // Mulai dengan panjang 3, bergerak ke kanan
  snake = [
    { x: startX,     y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY }
  ];

  // FIX: Reset direction DAN nextDir bersamaan agar tidak mismatch
  direction = { x: 1, y: 0 };
  nextDir   = { x: 1, y: 0 };

  score      = 0;
  appleCount = 0;
  level      = 1;
  flashTimer = 0;

  spawnFood();
  updateHUD();
  buildSpeedBars();
  drawAll();
}

// ─── Spawn Food ────────────────────────────────────────────────────────────────
function spawnFood() {
  let pos;
  let attempts = 0;
  do {
    pos = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS)
    };
    attempts++;
    // Hindari infinite loop jika grid penuh
    if (attempts > COLS * ROWS) break;
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  food = pos;
}

// ─── Game Loop ─────────────────────────────────────────────────────────────────
function startLoop() {
  stopLoop();
  gameLoop = setInterval(tick, getSpeed());
}

function stopLoop() {
  if (gameLoop !== null) {
    clearInterval(gameLoop);
    gameLoop = null;
  }
}

function tick() {
  if (state !== 'running') return;

  // Terapkan arah dari buffer
  direction = { ...nextDir };

  // Hitung posisi kepala baru
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  };

  // Cek tabrakan dinding
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    gameOver();
    return;
  }

  // FIX: Cek tabrakan body mulai dari index 1 (bukan 0 = kepala sendiri)
  // Juga tidak cek ekor paling akhir karena ekor akan bergerak sebelum kepala masuk
  for (let i = 1; i < snake.length - 1; i++) {
    if (snake[i].x === head.x && snake[i].y === head.y) {
      gameOver();
      return;
    }
  }

  // Tambah kepala baru
  snake.unshift(head);

  // Cek makan
  if (head.x === food.x && head.y === food.y) {
    score      += 10;
    appleCount += 1;
    sessApples += 1;
    flashTimer  = 6;

    const newLevel = Math.min(Math.floor(appleCount / 5) + 1, 10);
    if (newLevel !== level) {
      level = newLevel;
      startLoop(); // Restart interval dengan kecepatan baru
    }

    spawnFood();
    // Tidak pop ekor → ular bertambah panjang
  } else {
    // Tidak makan → hapus ekor
    snake.pop();
  }

  updateHUD();
  drawAll();
}

// ─── Game Over ─────────────────────────────────────────────────────────────────
function gameOver() {
  state = 'dead';
  stopLoop();
  sessPlayed += 1;

  const hs    = getHighscore();
  const isNew = score > hs;
  if (isNew) saveHighscore(score);
  if (score > sessBest) sessBest = score;

  updateHUD();
  updateSessionStats();

  // Update overlay game over
  document.getElementById('goScore').textContent     = score;
  document.getElementById('goHighscore').textContent = isNew ? score : hs;
  document.getElementById('goNew').hidden             = !isNew;

  // Gambar flash merah dulu, baru tampilkan overlay
  drawAll(true);

  // FIX: Pakai setTimeout agar browser selesai render dulu sebelum tampilkan overlay
  setTimeout(() => {
    showOverlay('overlayGameOver');
  }, 300);
}

// ─── Start / Pause / Resume / Restart ─────────────────────────────────────────
function startGame() {
  hideAllOverlays();
  state = 'running';
  initGame();
  startLoop();
}

function pauseGame() {
  if (state !== 'running') return;
  state = 'paused';
  stopLoop();
  showOverlay('overlayPause');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'running';
  hideAllOverlays();
  startLoop();
}

function restartGame() {
  stopLoop();
  state = 'idle'; // Reset state dulu
  startGame();
}

function togglePause() {
  if (state === 'running') pauseGame();
  else if (state === 'paused') resumeGame();
}

// ─── HUD Update ────────────────────────────────────────────────────────────────
function updateHUD() {
  const hs = getHighscore();
  const displayHS = Math.max(hs, score);
  document.getElementById('score').textContent         = score;
  document.getElementById('highscore').textContent     = displayHS;
  document.getElementById('level').textContent         = level;
  document.getElementById('length').textContent        = snake.length;
  document.getElementById('statHighscore').textContent = displayHS;
  updateSpeedBars();
}

function updateSessionStats() {
  document.getElementById('statPlayed').textContent = sessPlayed;
  document.getElementById('statApples').textContent = sessApples;
  document.getElementById('statBest').textContent   = sessBest;
}

// ─── Speed Bars ────────────────────────────────────────────────────────────────
function buildSpeedBars() {
  const container = document.getElementById('speedBars');
  container.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const bar       = document.createElement('div');
    bar.className   = 'speed-bar';
    bar.style.height = (4 + i * 3.2) + 'px';
    bar.dataset.lvl  = i + 1;
    container.appendChild(bar);
  }
  updateSpeedBars();
}

function updateSpeedBars() {
  document.querySelectorAll('.speed-bar').forEach(bar => {
    bar.classList.toggle('active', parseInt(bar.dataset.lvl, 10) <= level);
  });
}

// ─── Overlays ──────────────────────────────────────────────────────────────────
function showOverlay(id) {
  hideAllOverlays();
  const el = document.getElementById(id);
  if (el) {
    el.hidden = false;
    // FIX: Pastikan overlay tampil di atas canvas dan bisa diklik
    el.style.pointerEvents = 'auto';
  }
}

function hideAllOverlays() {
  ['overlayStart', 'overlayPause', 'overlayGameOver'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.hidden = true;
      el.style.pointerEvents = 'none';
    }
  });
}

// ─── Drawing ───────────────────────────────────────────────────────────────────
const COLOR = {
  bg:        '#05050e',
  grid:      '#0d0d20',
  snakeHead: '#39ff14',
  snakeBody: '#26b30e',
  snakeDark: '#1a7a09',
  food:      '#ff2d78',
  dead:      '#ff3333',
};

function drawAll(isDead = false) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, w, h);

  drawGrid();

  if (flashTimer > 0) {
    ctx.fillStyle = 'rgba(57,255,20,0.08)';
    ctx.fillRect(0, 0, w, h);
    flashTimer--;
  }

  if (isDead) {
    ctx.fillStyle = 'rgba(255,51,51,0.3)';
    ctx.fillRect(0, 0, w, h);
  }

  drawFood();
  drawSnake(isDead);
}

function drawGrid() {
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth   = 0.5;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * TILE, 0);
    ctx.lineTo(x * TILE, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * TILE);
    ctx.lineTo(canvas.width, y * TILE);
    ctx.stroke();
  }
}

function drawFood() {
  const cx = food.x * TILE + TILE / 2;
  const cy = food.y * TILE + TILE / 2;
  const r  = TILE / 2 - 2;

  ctx.shadowColor = COLOR.food;
  ctx.shadowBlur  = 14;
  ctx.fillStyle   = COLOR.food;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur  = 0;
  ctx.strokeStyle = '#ff7ab0';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(cx, food.y * TILE + 2);
  ctx.lineTo(cx + 3, food.y * TILE - 1);
  ctx.stroke();
}

function drawSnake(isDead) {
  const len = snake.length;
  snake.forEach((seg, i) => {
    const px  = seg.x * TILE;
    const py  = seg.y * TILE;
    const pad = 1;

    ctx.shadowBlur = 0;
    if (isDead) {
      ctx.fillStyle   = COLOR.dead;
      ctx.shadowColor = COLOR.dead;
      ctx.shadowBlur  = 6;
    } else if (i === 0) {
      ctx.fillStyle   = COLOR.snakeHead;
      ctx.shadowColor = COLOR.snakeHead;
      ctx.shadowBlur  = 12;
    } else {
      const ratio   = i / len;
      ctx.fillStyle = ratio < 0.5 ? COLOR.snakeBody : COLOR.snakeDark;
    }

    ctx.fillRect(px + pad, py + pad, TILE - pad * 2, TILE - pad * 2);
    ctx.shadowBlur = 0;

    if (i === 0 && !isDead) drawEyes(seg, direction);
  });
}

function drawEyes(head, dir) {
  const px = head.x * TILE;
  const py = head.y * TILE;
  const s  = TILE;
  const eyes = getEyePositions(px, py, s, dir);

  eyes.forEach(eye => {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(eye.x + 0.5, eye.y - 0.5, 1, 0, Math.PI * 2);
    ctx.fill();
  });
}

function getEyePositions(px, py, s, dir) {
  if (dir.x === 1)  return [{ x: px+s-5, y: py+4   }, { x: px+s-5, y: py+s-4 }];
  if (dir.x === -1) return [{ x: px+5,   y: py+4   }, { x: px+5,   y: py+s-4 }];
  if (dir.y === -1) return [{ x: px+4,   y: py+5   }, { x: px+s-4, y: py+5   }];
  /* dir.y === 1 */ return [{ x: px+4,   y: py+s-5 }, { x: px+s-4, y: py+s-5 }];
}

// ─── Keyboard Input ────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // FIX: Cegah scroll halaman untuk semua tombol game
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
    e.preventDefault();
  }

  switch (e.key) {
    case 'ArrowUp':    case 'w': case 'W': setDir(0, -1);  break;
    case 'ArrowDown':  case 's': case 'S': setDir(0,  1);  break;
    case 'ArrowLeft':  case 'a': case 'A': setDir(-1, 0);  break;
    case 'ArrowRight': case 'd': case 'D': setDir(1,  0);  break;

    case ' ':
      if (state === 'idle') startGame();
      else if (state === 'dead') restartGame();
      else togglePause();
      break;

    case 'r': case 'R':
      if (state !== 'idle') restartGame();
      break;
  }
});

// FIX: setDir — validasi lebih ketat agar tidak bisa berbalik arah
function setDir(dx, dy) {
  if (state === 'idle') { startGame(); return; }
  if (state === 'paused') { resumeGame(); return; }
  if (state !== 'running') return;

  // Tidak boleh berbalik 180°
  // Kalau sedang ke kanan (x=1), tidak boleh ke kiri (x=-1), dst.
  if (dx !== 0 && direction.x !== 0) return;
  if (dy !== 0 && direction.y !== 0) return;

  nextDir = { x: dx, y: dy };
}

// ─── D-Pad ─────────────────────────────────────────────────────────────────────
document.getElementById('dUp').addEventListener('click',    () => setDir(0, -1));
document.getElementById('dDown').addEventListener('click',  () => setDir(0,  1));
document.getElementById('dLeft').addEventListener('click',  () => setDir(-1, 0));
document.getElementById('dRight').addEventListener('click', () => setDir(1,  0));
document.getElementById('btnPause').addEventListener('click', () => {
  if (state === 'idle') startGame();
  else if (state === 'dead') restartGame();
  else togglePause();
});

// ─── Overlay Buttons ───────────────────────────────────────────────────────────
// FIX: Pastikan event listener terpasang setelah DOM siap
document.getElementById('btnStart').addEventListener('click',   () => startGame());
document.getElementById('btnResume').addEventListener('click',  () => resumeGame());
document.getElementById('btnRestart').addEventListener('click', () => restartGame());

// ─── Touch Swipe ───────────────────────────────────────────────────────────────
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  const dx    = e.changedTouches[0].clientX - touchStartX;
  const dy    = e.changedTouches[0].clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (Math.max(absDx, absDy) < 20) return;

  if (absDx > absDy) setDir(dx > 0 ? 1 : -1, 0);
  else               setDir(0, dy > 0 ? 1 : -1);

  e.preventDefault();
}, { passive: false });

// ─── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (state === 'idle') {
    resizeCanvas();
    drawAll();
  }
});

// ─── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  resizeCanvas();
  buildSpeedBars();

  const hs = getHighscore();
  document.getElementById('highscore').textContent     = hs;
  document.getElementById('statHighscore').textContent = hs;

  drawAll();
  showOverlay('overlayStart');
})();