/**
 * FWG – Free Web Games
 * main.js · Load game cards dari games.json + Search & Filter
 */

// ─── State ────────────────────────────────────────────────────────────────────
let allGames   = [];   // semua game dari JSON
let activeFilter = 'all'; // filter kategori aktif
let searchQuery  = '';    // kata kunci pencarian

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const gameGrid    = document.getElementById('gameGrid');
const gameCount   = document.getElementById('gameCount');
const noResult    = document.getElementById('noResult');
const searchInput = document.getElementById('searchInput');
const clearBtn    = document.getElementById('clearSearch');
const filterBtns  = document.querySelectorAll('.filter-btn');

// ─── Load Data ─────────────────────────────────────────────────────────────────
async function loadGames() {
  try {
    const res  = await fetch('./games.json');
    allGames   = await res.json();
    renderGrid();
  } catch (err) {
    gameGrid.innerHTML = `
      <p style="font-family:var(--font-pixel);font-size:.55rem;color:#ff2d78;grid-column:1/-1;text-align:center;padding:60px 0;">
        ❌ GAGAL MEMUAT GAMES<br><br>
        <span style="color:#6060a0;font-size:.45rem;">Pastikan games.json tersedia</span>
      </p>`;
    console.error('FWG: gagal load games.json', err);
  }
}

// ─── Render ────────────────────────────────────────────────────────────────────
function renderGrid() {
  // Filter by category
  let filtered = activeFilter === 'all'
    ? allGames
    : allGames.filter(g => g.category === activeFilter);

  // Filter by search
  if (searchQuery.trim() !== '') {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.category.toLowerCase().includes(q)
    );
  }

  // Update count
  gameCount.textContent = `${filtered.length} GAME${filtered.length !== 1 ? 'S' : ''}`;

  // Show / hide no-result
  noResult.hidden = filtered.length > 0;
  gameGrid.hidden  = filtered.length === 0;

  // Build cards
  gameGrid.innerHTML = filtered.map(game => buildCard(game)).join('');

  // Animate cards masuk
  const cards = gameGrid.querySelectorAll('.game-card');
  cards.forEach((card, i) => {
    card.style.opacity  = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = `opacity .25s ease ${i * 60}ms, transform .25s ease ${i * 60}ms, border-color .2s, box-shadow .2s`;
    requestAnimationFrame(() => {
      card.style.opacity  = card.classList.contains('unavailable') ? '0.55' : '1';
      card.style.transform = 'translateY(0)';
    });
  });
}

// ─── Build Card HTML ────────────────────────────────────────────────────────────
function buildCard(game) {
  const diffDots  = buildDiffDots(game.difficulty);
  const available = game.available;

  const comingSoon = !available
    ? `<span class="badge-coming">COMING SOON</span>` : '';

  // Tombol play: link jika tersedia, span jika belum
  const playBtn = available
    ? `<a href="${game.path}" class="card-play">▶ MAIN SEKARANG</a>`
    : `<span class="card-play">🔒 BELUM TERSEDIA</span>`;

  return `
    <div
      class="game-card ${available ? '' : 'unavailable'}"
      data-category="${game.category}"
      data-id="${game.id}"
    >
      ${comingSoon}

      <div class="card-emoji">
        ${game.icon
          ? `<img src="${game.icon}" alt="${game.title}" class="card-icon-img">`
          : `<span class="card-icon-emoji">${game.emoji}</span>`}
      </div>

      <div class="card-body">
        <h3 class="card-title">${game.title}</h3>
        <p class="card-desc">${game.description}</p>

        <div class="card-footer">
          <span class="card-category">${game.category}</span>
          <span class="card-difficulty">
            ${game.difficulty}
            <span class="diff-dots">${diffDots}</span>
          </span>
        </div>

        ${playBtn}
      </div>
    </div>
  `;
}

// ─── Difficulty Dots ────────────────────────────────────────────────────────────
function buildDiffDots(difficulty) {
  // Easy=1 dot, Medium=2, Hard=3
  const map  = { Easy: 1, Medium: 2, Hard: 3 };
  const fill = map[difficulty] ?? 1;
  let html   = '';
  for (let i = 1; i <= 3; i++) {
    html += `<span class="diff-dot ${i <= fill ? 'on' : ''}"></span>`;
  }
  return html;
}

// ─── Event: Search ──────────────────────────────────────────────────────────────
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  clearBtn.style.display = searchQuery ? 'block' : 'none';
  renderGrid();
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery       = '';
  clearBtn.style.display = 'none';
  searchInput.focus();
  renderGrid();
});

// Sembunyikan tombol clear saat awal
clearBtn.style.display = 'none';

// ─── Event: Filter ──────────────────────────────────────────────────────────────
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Update active state
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    activeFilter = btn.dataset.filter;
    renderGrid();
  });
});

// ─── Init ───────────────────────────────────────────────────────────────────────
loadGames();