/**
 * FWG – Clicker Game
 * script.js
 *
 * Fitur:
 * - 3 mode waktu: 10s / 30s / 60s
 * - Sistem combo: klik < 0.8s antar klik = combo naik (max ×10)
 *   Berhenti > 0.8s = combo reset ke ×1
 * - Skor = 1 poin × combo per klik
 * - CPS (clicks per second) dihitung real-time dari 1 detik terakhir
 * - Timer ring SVG (animasi lingkaran menyusut)
 * - Floating particle "+N" setiap klik
 * - Animasi tombol tertekan
 * - LocalStorage highscore per mode waktu
 * - Statistik sesi
 */

// ─── Konstanta ─────────────────────────────────────────────────────────────────
const COMBO_TIMEOUT  = 800;   // ms — jika tidak klik dalam waktu ini, combo reset
const MAX_COMBO      = 10;    // batas atas combo
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.7px

// ─── State ─────────────────────────────────────────────────────────────────────
let timeMode      = 30;      // durasi game (detik)
let state         = 'idle';  // 'idle' | 'running' | 'done'

let score         = 0;
let clicks        = 0;
let combo         = 1;       // multiplier saat ini (1–10)
let maxCombo      = 1;       // combo tertinggi game ini

let timeLeft      = 30;
let timerInterval = null;

// Untuk hitung CPS: simpan timestamp klik dalam 1 detik terakhir
let clickTimestamps = [];

// Untuk combo timeout
let comboTimer    = null;

// Untuk combo track bar (waktu sejak klik terakhir)
let comboTrackInterval = null;
let lastClickTime = 0;

// ─── Session Stats ─────────────────────────────────────────────────────────────
let sessPlayed      = 0;
let sessTotalClicks = 0;
let sessBestCps     = 0;
let sessMaxCombo    = 1;

// ─── LocalStorage ──────────────────────────────────────────────────────────────
function hsKey(mode) { return `fwg_clicker_hs_${mode}s`; }
function getHighscore(mode) { return parseInt(localStorage.getItem(hsKey(mode)) || '0', 10); }
function saveHighscore(mode, val) { localStorage.setItem(hsKey(mode), String(val)); }

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const clickBtn     = document.getElementById('clickBtn');
const ringFill     = document.getElementById('ringFill');
const timerValEl   = document.getElementById('timerVal');
const scoreEl      = document.getElementById('score');
const highscoreEl  = document.getElementById('highscore');
const clicksEl     = document.getElementById('clicks');
const cpsEl        = document.getElementById('cps');
const comboDispEl  = document.getElementById('comboDisplay');
const comboFillEl  = document.getElementById('comboFill');
const comboHintEl  = document.getElementById('comboHint');
const particlesEl  = document.getElementById('particles');

// ─── Init ──────────────────────────────────────────────────────────────────────
function initGame() {
  score          = 0;
  clicks         = 0;
  combo          = 1;
  maxCombo       = 1;
  timeLeft       = timeMode;
  clickTimestamps = [];
  lastClickTime  = 0;

  clearInterval(timerInterval);
  clearTimeout(comboTimer);
  clearInterval(comboTrackInterval);

  updateHUD();
  updateRing(timeMode, timeMode);
  updateComboFill(1);
  updateComboCells();

  comboHintEl.textContent = 'Klik cepat untuk combo!';
  timerValEl.className    = 'timer-val';
  ringFill.className      = 'ring-fill';

  buildComboCells();
  updateHighscoreDisplay();
}

// ─── Start Game ────────────────────────────────────────────────────────────────
function startGame() {
  hideAllOverlays();
  state = 'running';
  initGame();

  // Countdown timer
  timerInterval = setInterval(() => {
    timeLeft--;
    updateRing(timeLeft, timeMode);
    updateTimerDisplay();

    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
  }, 1000);

  // Combo track bar: update setiap 50ms
  comboTrackInterval = setInterval(updateComboTrack, 50);
}

function endGame() {
  clearInterval(timerInterval);
  clearTimeout(comboTimer);
  clearInterval(comboTrackInterval);

  state = 'done';
  sessPlayed++;

  const hs    = getHighscore(timeMode);
  const isNew = score > hs;
  if (isNew) saveHighscore(timeMode, score);

  if (maxCombo > sessMaxCombo) sessMaxCombo = maxCombo;

  const avgCps = clicks / timeMode;
  if (avgCps > sessBestCps) sessBestCps = avgCps;

  // Update overlay result
  document.getElementById('goClicks').textContent    = clicks;
  document.getElementById('goScore').textContent     = score;
  document.getElementById('goCps').textContent       = avgCps.toFixed(1);
  document.getElementById('goCombo').textContent     = '×' + maxCombo;
  document.getElementById('goHighscore').textContent = isNew ? score : hs;
  document.getElementById('goNew').hidden            = !isNew;

  updateSessionStats();
  updateHighscoreDisplay();

  setTimeout(() => showOverlay('overlayResult'), 400);
}

function restartGame() {
  hideAllOverlays();
  startGame();
}

// ─── Handle Click ──────────────────────────────────────────────────────────────
function handleClick(e) {
  if (state !== 'running') return;

  const now = Date.now();

  // Hitung CPS: simpan timestamp, buang yang lebih dari 1 detik lalu
  clickTimestamps.push(now);
  clickTimestamps = clickTimestamps.filter(t => now - t <= 1000);
  const cps = clickTimestamps.length;
  if (cps > sessBestCps) sessBestCps = parseFloat(cps.toFixed(1));

  // Combo logic
  if (lastClickTime > 0 && now - lastClickTime <= COMBO_TIMEOUT) {
    // Masih dalam window → naikkan combo
    combo = Math.min(combo + 1, MAX_COMBO);
  } else if (lastClickTime > 0) {
    // Terlalu lambat → reset combo
    combo = 1;
  }
  lastClickTime = now;

  if (combo > maxCombo) maxCombo = combo;

  // Reset combo timeout
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => {
    combo = 1;
    updateComboCells();
    updateHUD();
    comboHintEl.textContent = 'Klik cepat untuk combo!';
  }, COMBO_TIMEOUT);

  // Tambah skor
  const gained = combo;
  score  += gained;
  clicks += 1;
  sessTotalClicks++;

  // Animasi tombol
  animateButton();

  // Particle
  spawnParticle(e, gained);

  // Update UI
  updateHUD();
  updateComboCells();

  // Hint text
  if (combo >= MAX_COMBO) {
    comboHintEl.textContent = '🔥 MAX COMBO!';
  } else if (combo >= 5) {
    comboHintEl.textContent = '⚡ COMBO ×' + combo + '!';
  } else if (combo > 1) {
    comboHintEl.textContent = 'COMBO ×' + combo + '!';
  } else {
    comboHintEl.textContent = 'Klik cepat untuk combo!';
  }
}

// ─── Animasi Tombol ────────────────────────────────────────────────────────────
function animateButton() {
  clickBtn.classList.remove('pressed');
  void clickBtn.offsetWidth; // reflow
  clickBtn.classList.add('pressed');
  setTimeout(() => clickBtn.classList.remove('pressed'), 80);
}

// ─── Combo Track Bar (decay bar) ───────────────────────────────────────────────
// Bar menyusut dari 100% → 0% dalam COMBO_TIMEOUT ms sejak klik terakhir
function updateComboTrack() {
  if (lastClickTime === 0) {
    updateComboFill(0);
    return;
  }
  const elapsed  = Date.now() - lastClickTime;
  const fraction = Math.max(0, 1 - elapsed / COMBO_TIMEOUT);
  updateComboFill(fraction);
}

function updateComboFill(fraction) {
  // fraction: 0.0 – 1.0
  comboFillEl.style.width = (fraction * 100) + '%';

  // Warna berubah sesuai combo
  if (combo >= MAX_COMBO) {
    comboFillEl.style.background = '#ff2d78';
    comboFillEl.style.boxShadow  = '0 0 8px #ff2d78';
  } else if (combo >= 5) {
    comboFillEl.style.background = '#ffe600';
    comboFillEl.style.boxShadow  = '0 0 8px #ffe600';
  } else {
    comboFillEl.style.background = '';
    comboFillEl.style.boxShadow  = '';
  }
}

// ─── Timer Ring ────────────────────────────────────────────────────────────────
function updateRing(current, total) {
  const fraction = current / total;
  const offset   = RING_CIRCUMFERENCE * (1 - fraction);
  ringFill.style.strokeDashoffset = offset;

  // Warna ring
  ringFill.classList.remove('warning', 'danger');
  if (fraction <= 0.2) {
    ringFill.classList.add('danger');
  } else if (fraction <= 0.4) {
    ringFill.classList.add('warning');
  }
}

function updateTimerDisplay() {
  timerValEl.textContent = timeLeft;
  timerValEl.classList.remove('warning', 'danger');
  if (timeLeft <= Math.floor(timeMode * 0.2)) {
    timerValEl.classList.add('danger');
  } else if (timeLeft <= Math.floor(timeMode * 0.4)) {
    timerValEl.classList.add('warning');
  }
}

// ─── Particles ─────────────────────────────────────────────────────────────────
function spawnParticle(e, value) {
  const particle = document.createElement('div');
  particle.className = 'particle' + (combo >= 5 ? ' combo' : '');
  particle.textContent = '+' + value;

  // Posisi acak di sekitar tombol klik
  const areaRect = document.getElementById('gameArea').getBoundingClientRect();

  let x, y;
  if (e && e.clientX) {
    // Posisi mouse/touch
    x = e.clientX - areaRect.left;
    y = e.clientY - areaRect.top;
  } else {
    // Keyboard: tengah area
    x = areaRect.width / 2;
    y = areaRect.height / 2;
  }

  // Sebar sedikit secara acak
  x += (Math.random() - 0.5) * 60;
  y += (Math.random() - 0.5) * 40;

  // Pastikan tidak keluar area
  x = Math.max(20, Math.min(areaRect.width - 20, x));
  y = Math.max(20, Math.min(areaRect.height - 40, y));

  particle.style.left = x + 'px';
  particle.style.top  = y + 'px';

  particlesEl.appendChild(particle);

  // Hapus setelah animasi selesai
  setTimeout(() => {
    if (particle.parentNode) particle.parentNode.removeChild(particle);
  }, 800);
}

// ─── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD() {
  scoreEl.textContent    = score;
  highscoreEl.textContent = getHighscore(timeMode);
  clicksEl.textContent   = clicks;

  const cps = clickTimestamps.length;
  cpsEl.textContent = cps.toFixed(0);

  comboDispEl.textContent = '×' + combo;

  // Pop animasi skor
  scoreEl.classList.remove('score-pop');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('score-pop');
}

function updateHighscoreDisplay() {
  document.getElementById('statHighscore').textContent = getHighscore(timeMode);
  document.getElementById('statHsMode').textContent    = 'Mode ' + timeMode + 's';
  highscoreEl.textContent = getHighscore(timeMode);
}

function updateSessionStats() {
  document.getElementById('statPlayed').textContent      = sessPlayed;
  document.getElementById('statTotalClicks').textContent = sessTotalClicks;
  document.getElementById('statBestCps').textContent     = sessBestCps.toFixed(1);
  document.getElementById('statMaxCombo').textContent    = '×' + sessMaxCombo;
}

// ─── Combo Cells ───────────────────────────────────────────────────────────────
// Grid 2×5 = 10 sel untuk visualisasi combo level ×1–×10
function buildComboCells() {
  const grid = document.getElementById('comboGrid');
  grid.innerHTML = '';
  for (let i = 1; i <= MAX_COMBO; i++) {
    const cell     = document.createElement('div');
    cell.className = 'combo-cell';
    cell.textContent = '×' + i;
    cell.dataset.level = i;
    grid.appendChild(cell);
  }
  updateComboCells();
}

function updateComboCells() {
  document.querySelectorAll('.combo-cell').forEach(cell => {
    cell.classList.toggle('active', parseInt(cell.dataset.level, 10) <= combo);
  });
}

// ─── Overlays ──────────────────────────────────────────────────────────────────
function showOverlay(id) {
  hideAllOverlays();
  const el = document.getElementById(id);
  if (el) { el.hidden = false; el.style.pointerEvents = 'auto'; }
}

function hideAllOverlays() {
  ['overlayStart', 'overlayResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.hidden = true; el.style.pointerEvents = 'none'; }
  });
}

// ─── Event Listeners ───────────────────────────────────────────────────────────

// Tombol klik utama
clickBtn.addEventListener('click', handleClick);
// Juga tangkap touchstart agar lebih responsif di HP
clickBtn.addEventListener('touchstart', e => {
  e.preventDefault();
  handleClick(e.touches[0]);
}, { passive: false });

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    if (state === 'idle')   startGame();
    else if (state === 'done') restartGame();
    else handleClick(null);
  }
  if (e.key === 'r' || e.key === 'R') {
    if (state !== 'idle') restartGame();
  }
});

// Mode time buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state === 'running') return; // tidak bisa ganti saat main
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    timeMode = parseInt(btn.dataset.time, 10);
    updateHighscoreDisplay();
    initGame();
  });
});

// Overlay buttons
document.getElementById('btnStart').addEventListener('click',   () => startGame());
document.getElementById('btnRestart').addEventListener('click', () => restartGame());

// ─── Boot ──────────────────────────────────────────────────────────────────────
(function boot() {
  buildComboCells();
  initGame();
  updateSessionStats();
  showOverlay('overlayStart');
})();