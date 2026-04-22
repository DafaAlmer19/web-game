/**
 * FWG – Pong Game
 * script.js
 *
 * Fitur:
 * - Canvas game Pong klasik vs AI
 * - 3 tingkat difficulty (Easy / Medium / Hard)
 * - AI yang realistis (tidak sempurna, ada error margin)
 * - Ball speed naik tiap 3 rally
 * - Efek glow + trail bola
 * - Mobile: tombol ▲▼ + touch drag canvas
 * - Pause / Resume / Restart
 * - Win / Lose overlay (skor 7)
 * - LocalStorage highscore (skor tertinggi saat menang)
 * - Statistik sesi: game, menang, kalah, rally
 * - Speed bars visual
 */

// ─── Canvas Setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// Ukuran field (fixed internal, tampil responsif via CSS)
const W = 520;  // lebar internal canvas
const H = 360;  // tinggi internal canvas

canvas.width  = W;
canvas.height = H;

// ─── Konstanta ─────────────────────────────────────────────────────────────────
const PADDLE_W    = 12;   // lebar paddle (px)
const PADDLE_H    = 70;   // tinggi paddle (px)
const PADDLE_GAP  = 16;   // jarak paddle dari tepi
const BALL_SIZE   = 10;   // radius bola
const WIN_SCORE   = 7;    // skor untuk menang
const BALL_BASE_SPEED = 5;// kecepatan awal bola

// AI difficulty settings: { speed, errorMargin }
// speed      = seberapa cepat AI bergerak per frame (px)
// errorMargin = seberapa jauh AI bisa "meleset" dari bola (px)
const DIFFICULTY = {
  easy:   { speed: 2.8, errorMargin: 50 },
  medium: { speed: 4.2, errorMargin: 25 },
  hard:   { speed: 6.0, errorMargin: 8  },
};

// ─── State Game ────────────────────────────────────────────────────────────────
let state        = 'idle';   // 'idle' | 'running' | 'paused' | 'win' | 'lose'
let difficulty   = 'medium';
let animFrame    = null;

// Paddle pemain (kiri)
let player = {
  x: PADDLE_GAP,
  y: H / 2 - PADDLE_H / 2,
  w: PADDLE_W,
  h: PADDLE_H,
  dy: 0,         // kecepatan gerak per frame
  score: 0,
};

// Paddle AI (kanan)
let ai = {
  x: W - PADDLE_GAP - PADDLE_W,
  y: H / 2 - PADDLE_H / 2,
  w: PADDLE_W,
  h: PADDLE_H,
  score: 0,
  targetY: H / 2, // target Y yang dikejar AI (dengan error)
};

// Bola
let ball = {
  x: W / 2,
  y: H / 2,
  vx: 0,
  vy: 0,
  speed: BALL_BASE_SPEED,
  trail: [],   // array of {x, y} untuk efek trail
};

// Rally counter (jumlah pantulan sejak bola diluncurkan)
let rallyCount   = 0;
let speedLevel   = 1;  // 1–8

// Input
const keys = { up: false, down: false };

// ─── Session Stats ─────────────────────────────────────────────────────────────
let sessPlayed = 0;
let sessWins   = 0;
let sessLoses  = 0;
let sessRally  = 0;

// ─── LocalStorage ──────────────────────────────────────────────────────────────
const HS_KEY = 'fwg_pong_highscore';
function getHighscore() { return parseInt(localStorage.getItem(HS_KEY) || '0', 10); }
function saveHighscore(val) { localStorage.setItem(HS_KEY, String(val)); }

// ─── Init Game ─────────────────────────────────────────────────────────────────
function initGame() {
  // Reset posisi paddle
  player.y = H / 2 - PADDLE_H / 2;
  player.score = 0;
  player.dy = 0;

  ai.y = H / 2 - PADDLE_H / 2;
  ai.score = 0;
  ai.targetY = H / 2;

  rallyCount = 0;
  speedLevel = 1;

  // Launch bola ke arah random
  launchBall();
  updateHUD();
  buildSpeedBars();
  updateSpeedBars();
}

// ─── Launch Bola ───────────────────────────────────────────────────────────────
function launchBall(towardPlayer = null) {
  ball.x = W / 2;
  ball.y = H / 2;
  ball.trail = [];

  // Tentukan arah horizontal
  // towardPlayer = true → ke kiri (ke arah player), false → ke kanan (ke AI)
  // null → random
  let dirX;
  if (towardPlayer === null) {
    dirX = Math.random() < 0.5 ? 1 : -1;
  } else {
    dirX = towardPlayer ? -1 : 1;
  }

  // Kecepatan berdasarkan speedLevel
  const spd = BALL_BASE_SPEED + (speedLevel - 1) * 0.6;
  ball.speed = spd;

  // Sudut awal: -30° sampai +30° dari horizontal
  const angle = (Math.random() * 60 - 30) * (Math.PI / 180);
  ball.vx = dirX * spd * Math.cos(angle);
  ball.vy = spd * Math.sin(angle);
}

// ─── Game Loop ─────────────────────────────────────────────────────────────────
function gameLoop() {
  if (state !== 'running') return;

  update();
  draw();
  animFrame = requestAnimationFrame(gameLoop);
}

function startLoop() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(gameLoop);
}

function stopLoop() {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
}

// ─── Update ────────────────────────────────────────────────────────────────────
function update() {
  movePlayer();
  moveAI();
  moveBall();
}

// Gerak paddle player berdasarkan input keyboard/mobile
function movePlayer() {
  const SPEED = 6;
  if (keys.up)   player.y -= SPEED;
  if (keys.down) player.y += SPEED;

  // Clamp dalam batas canvas
  player.y = Math.max(0, Math.min(H - PADDLE_H, player.y));
}

// AI tracking bola dengan error margin dan max speed
function moveAI() {
  const diff   = DIFFICULTY[difficulty];
  const center = ai.y + PADDLE_H / 2;

  // Hanya update target sesekali agar tidak terlalu sempurna
  // Target = posisi bola + random error
  if (Math.random() < 0.08) {
    ai.targetY = ball.y + (Math.random() * diff.errorMargin * 2 - diff.errorMargin);
  }

  // Gerak menuju target dengan kecepatan terbatas
  const delta = ai.targetY - center;
  if (Math.abs(delta) > 2) {
    const move = Math.sign(delta) * Math.min(diff.speed, Math.abs(delta));
    ai.y += move;
  }

  // Clamp
  ai.y = Math.max(0, Math.min(H - PADDLE_H, ai.y));
}

// Gerak bola + deteksi pantulan
function moveBall() {
  // Simpan trail (max 8 titik)
  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 8) ball.trail.shift();

  ball.x += ball.vx;
  ball.y += ball.vy;

  // Pantulan atas-bawah
  if (ball.y - BALL_SIZE <= 0) {
    ball.y  = BALL_SIZE;
    ball.vy = Math.abs(ball.vy);
  }
  if (ball.y + BALL_SIZE >= H) {
    ball.y  = H - BALL_SIZE;
    ball.vy = -Math.abs(ball.vy);
  }

  // Pantulan paddle player (kiri)
  if (
    ball.vx < 0 &&  // bola bergerak ke kiri
    ball.x - BALL_SIZE <= player.x + player.w &&
    ball.x + BALL_SIZE >= player.x &&
    ball.y >= player.y &&
    ball.y <= player.y + player.h
  ) {
    ball.x = player.x + player.w + BALL_SIZE; // koreksi posisi agar tidak stuck
    bounceOffPaddle(player);
    rallyCount++;
    sessRally++;
    checkSpeedUp();
    updateSpeedBars();
  }

  // Pantulan paddle AI (kanan)
  if (
    ball.vx > 0 &&  // bola bergerak ke kanan
    ball.x + BALL_SIZE >= ai.x &&
    ball.x - BALL_SIZE <= ai.x + ai.w &&
    ball.y >= ai.y &&
    ball.y <= ai.y + ai.h
  ) {
    ball.x = ai.x - BALL_SIZE; // koreksi posisi
    bounceOffPaddle(ai);
    rallyCount++;
    sessRally++;
    checkSpeedUp();
    updateSpeedBars();
  }

  // Bola keluar kiri → AI dapat poin
  if (ball.x + BALL_SIZE < 0) {
    ai.score++;
    updateHUD();
    if (ai.score >= WIN_SCORE) {
      endGame(false);
    } else {
      rallyCount = 0;
      // Bola diluncurkan ke arah player (yang baru saja kecolongan)
      setTimeout(() => launchBall(true), 800);
    }
  }

  // Bola keluar kanan → Player dapat poin
  if (ball.x - BALL_SIZE > W) {
    player.score++;
    updateHUD();
    if (player.score >= WIN_SCORE) {
      endGame(true);
    } else {
      rallyCount = 0;
      // Bola ke arah AI (yang baru saja kecolongan)
      setTimeout(() => launchBall(false), 800);
    }
  }
}

// Hitung arah pantul berdasarkan posisi bola relatif ke paddle
function bounceOffPaddle(paddle) {
  const hitPos    = (ball.y - (paddle.y + paddle.h / 2)) / (paddle.h / 2);
  // hitPos: -1 = tepi atas, 0 = tengah, 1 = tepi bawah
  const maxAngle  = 60 * (Math.PI / 180); // maks 60 derajat
  const angle     = hitPos * maxAngle;
  const speed     = ball.speed;
  const dirX      = paddle === player ? 1 : -1; // player → kanan, AI → kiri

  ball.vx = dirX * speed * Math.cos(angle);
  ball.vy = speed * Math.sin(angle);
}

// Naikkan kecepatan tiap 3 rally
function checkSpeedUp() {
  const newLevel = Math.min(Math.floor(rallyCount / 3) + 1, 8);
  if (newLevel > speedLevel) {
    speedLevel = newLevel;
    // Naikkan kecepatan bola saat ini
    const speed    = BALL_BASE_SPEED + (speedLevel - 1) * 0.6;
    ball.speed     = speed;
    const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const ratio    = speed / currentSpeed;
    ball.vx       *= ratio;
    ball.vy       *= ratio;
  }
}

// ─── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  // Background
  ctx.fillStyle = '#05050e';
  ctx.fillRect(0, 0, W, H);

  drawMidLine();
  drawTrail();
  drawBall();
  drawPaddle(player, '#00e5ff', '#00e5ff44');
  drawPaddle(ai,     '#ff2d78', '#ff2d7844');
  drawScores();
}

// Garis tengah putus-putus
function drawMidLine() {
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = '#2a2a4a';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Trail bola
function drawTrail() {
  ball.trail.forEach((pt, i) => {
    const alpha = (i / ball.trail.length) * 0.4;
    const r     = BALL_SIZE * (i / ball.trail.length) * 0.8;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(r, 2), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
    ctx.fill();
  });
}

// Bola dengan glow
function drawBall() {
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = '#ffffff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_SIZE, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur  = 0;
}

// Paddle dengan glow
function drawPaddle(paddle, color, glowColor) {
  ctx.shadowColor = color;
  ctx.shadowBlur  = 16;
  ctx.fillStyle   = color;
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

  // Highlight tepi
  ctx.shadowBlur = 0;
  ctx.fillStyle  = '#ffffff44';
  ctx.fillRect(paddle.x + 2, paddle.y + 2, 2, paddle.h - 4);
}

// Skor di canvas (kiri dan kanan)
function drawScores() {
  ctx.font      = '800 28px monospace';
  ctx.textAlign = 'center';

  // Player score (kiri)
  ctx.fillStyle   = '#00e5ff88';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur  = 10;
  ctx.fillText(player.score, W / 2 - 60, 44);

  // AI score (kanan)
  ctx.fillStyle   = '#ff2d7888';
  ctx.shadowColor = '#ff2d78';
  ctx.fillText(ai.score, W / 2 + 60, 44);

  ctx.shadowBlur  = 0;
  ctx.textAlign   = 'left';
}

// ─── End Game ──────────────────────────────────────────────────────────────────
function endGame(playerWon) {
  state = playerWon ? 'win' : 'lose';
  stopLoop();
  sessPlayed++;

  if (playerWon) {
    sessWins++;
    const hs    = getHighscore();
    const isNew = player.score > hs;
    if (isNew) saveHighscore(player.score);

    document.getElementById('goPlayerScore').textContent = player.score;
    document.getElementById('goAIScore').textContent     = ai.score;
    document.getElementById('goHighscore').textContent   = isNew ? player.score : hs;
    document.getElementById('goNew').hidden              = !isNew;

    setTimeout(() => showOverlay('overlayWin'), 400);
  } else {
    sessLoses++;
    document.getElementById('goPlayerScoreLose').textContent = player.score;
    document.getElementById('goAIScoreLose').textContent     = ai.score;

    setTimeout(() => showOverlay('overlayLose'), 400);
  }

  document.getElementById('statHighscore').textContent = getHighscore();
  updateSessionStats();
}

// ─── Game Control ──────────────────────────────────────────────────────────────
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
  state = 'idle';
  startGame();
}

function togglePause() {
  if (state === 'running') pauseGame();
  else if (state === 'paused') resumeGame();
}

// ─── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('scorePlayer').textContent    = player.score;
  document.getElementById('scoreAI').textContent        = ai.score;
  document.getElementById('scoreHighscore').textContent = getHighscore();
}

function updateSessionStats() {
  document.getElementById('statPlayed').textContent = sessPlayed;
  document.getElementById('statWins').textContent   = sessWins;
  document.getElementById('statLoses').textContent  = sessLoses;
  document.getElementById('statRally').textContent  = sessRally;
}

// ─── Speed Bars ────────────────────────────────────────────────────────────────
function buildSpeedBars() {
  const container = document.getElementById('speedBars');
  container.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const bar       = document.createElement('div');
    bar.className   = 'speed-bar';
    bar.style.height = (4 + i * 4) + 'px';
    bar.dataset.lvl  = i + 1;
    container.appendChild(bar);
  }
}

function updateSpeedBars() {
  document.querySelectorAll('.speed-bar').forEach(bar => {
    bar.classList.toggle('active', parseInt(bar.dataset.lvl, 10) <= speedLevel);
  });
}

// ─── Overlays ──────────────────────────────────────────────────────────────────
function showOverlay(id) {
  hideAllOverlays();
  const el = document.getElementById(id);
  if (el) { el.hidden = false; el.style.pointerEvents = 'auto'; }
}

function hideAllOverlays() {
  ['overlayStart', 'overlayPause', 'overlayWin', 'overlayLose'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.hidden = true; el.style.pointerEvents = 'none'; }
  });
}

// ─── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();

  switch (e.key) {
    case 'ArrowUp':   case 'w': case 'W': keys.up   = true; break;
    case 'ArrowDown': case 's': case 'S': keys.down = true; break;
    case ' ':
      if (state === 'idle')               startGame();
      else if (state === 'win' || state === 'lose') restartGame();
      else togglePause();
      break;
    case 'r': case 'R':
      if (state !== 'idle') restartGame();
      break;
  }
});

document.addEventListener('keyup', e => {
  switch (e.key) {
    case 'ArrowUp':   case 'w': case 'W': keys.up   = false; break;
    case 'ArrowDown': case 's': case 'S': keys.down = false; break;
  }
});

// ─── Mobile Buttons ────────────────────────────────────────────────────────────
const mobUp   = document.getElementById('mobUp');
const mobDown = document.getElementById('mobDown');

// Tekan dan tahan → gerak terus
function holdPress(btn, keyName) {
  let interval = null;

  const start = () => {
    keys[keyName] = true;
    if (state === 'idle') startGame();
  };
  const stop = () => {
    keys[keyName] = false;
  };

  btn.addEventListener('mousedown',  start);
  btn.addEventListener('mouseup',    stop);
  btn.addEventListener('mouseleave', stop);
  btn.addEventListener('touchstart', e => { e.preventDefault(); start(); }, { passive: false });
  btn.addEventListener('touchend',   e => { e.preventDefault(); stop();  }, { passive: false });
}

holdPress(mobUp,   'up');
holdPress(mobDown, 'down');

document.getElementById('btnPause').addEventListener('click', () => {
  if (state === 'idle') startGame();
  else if (state === 'win' || state === 'lose') restartGame();
  else togglePause();
});

// ─── Touch drag pada canvas (geser paddle) ─────────────────────────────────────
let lastTouchY = null;

canvas.addEventListener('touchstart', e => {
  lastTouchY = e.touches[0].clientY;
  e.preventDefault();
  if (state === 'idle') startGame();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  if (lastTouchY === null) return;
  const currentY = e.touches[0].clientY;
  const deltaY   = currentY - lastTouchY;
  lastTouchY     = currentY;

  // Scale delta dari ukuran layar ke ukuran canvas internal
  const scaleY = H / canvas.getBoundingClientRect().height;
  player.y    += deltaY * scaleY;
  player.y     = Math.max(0, Math.min(H - PADDLE_H, player.y));

  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => {
  lastTouchY = null;
}, { passive: false });

// ─── Overlay Buttons ───────────────────────────────────────────────────────────
document.getElementById('btnStart').addEventListener('click',       () => startGame());
document.getElementById('btnResume').addEventListener('click',      () => resumeGame());
document.getElementById('btnRestartWin').addEventListener('click',  () => restartGame());
document.getElementById('btnRestartLose').addEventListener('click', () => restartGame());

// ─── Difficulty Buttons ────────────────────────────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Hanya bisa ganti saat tidak sedang main
    if (state === 'running') return;

    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
  });
});

// ─── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  buildSpeedBars();
  updateSpeedBars();

  // Tampilkan highscore dari storage
  document.getElementById('scoreHighscore').textContent = getHighscore();
  document.getElementById('statHighscore').textContent  = getHighscore();

  // Gambar frame awal
  draw();
  showOverlay('overlayStart');
})();