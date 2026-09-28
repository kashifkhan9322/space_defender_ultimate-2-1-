// dashboard.js — Dashboard Logic
// Auth guard, player stats, difficulty selection, leaderboard, logout

console.log('Dashboard module loaded');

let selectedDifficulty = 'medium';

// ── Leaderboard ──
let leaderboardLoaded = false;

// ── Auth Guard ──
(function authGuard() {
    const user = localStorage.getItem('sd_user');
    if (!user) {
        window.location.href = '/login';
        return;
    }
    initDashboard(JSON.parse(user));
})();

// ── Init ──
function initDashboard(player) {
    // Welcome message
    document.getElementById('welcomeName').textContent = player.username;
    document.getElementById('navUsername').textContent = player.username;
    document.getElementById('navAvatar').textContent = player.username.charAt(0).toUpperCase();

    // Player stats
    document.getElementById('statGames').textContent = player.total_games || 0;
    document.getElementById('statHighScore').textContent = formatNumber(player.high_score || 0);
    document.getElementById('statKills').textContent = formatNumber(player.total_kills || 0);
    document.getElementById('statMaxWave').textContent = player.max_wave || 0;
    document.getElementById('statMaxCombo').textContent = player.max_combo || 0;
    document.getElementById('statTotalScore').textContent = formatNumber(player.total_score || 0);

    // Restore difficulty from this session only
    const savedDiff = sessionStorage.getItem('sd_difficulty');
    if (savedDiff) {
        selectDifficulty(savedDiff);
    } else {
        selectDifficulty('medium'); // Default for clean state flow
    }
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

// ── Difficulty Selection ──
function selectDifficulty(diff) {
    selectedDifficulty = diff;
    sessionStorage.setItem('sd_difficulty', diff);

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === diff);
    });
}

// ── Start Game ──
function startGame() {
    sessionStorage.setItem('sd_difficulty', selectedDifficulty);

    // Fade out transition
    document.getElementById('dashboardPage').classList.add('page-exit');
    setTimeout(() => {
        window.location.href = '/game';
    }, 300);
}

function toggleLeaderboard() {
    const panel = document.getElementById('leaderboardPanel');
    const btn = document.getElementById('toggleLbBtn');
    const isVisible = panel.classList.contains('visible');

    if (isVisible) {
        panel.classList.remove('visible');
        btn.textContent = 'View Rankings';
    } else {
        panel.classList.add('visible');
        btn.textContent = 'Hide Rankings';
        if (!leaderboardLoaded) {
            fetchLeaderboard();
        }
    }
}

async function fetchLeaderboard() {
    const container = document.getElementById('leaderboardEntries');

    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();

        if (data.length === 0) {
            container.innerHTML = '<div class="leaderboard-empty">No entries yet. Be the first!</div>';
            leaderboardLoaded = true;
            return;
        }

        container.innerHTML = '';
        data.forEach((entry, index) => {
            const row = document.createElement('div');
            row.className = 'leaderboard-entry';
            row.innerHTML = `
                <span class="leaderboard-rank">#${index + 1}</span>
                <span class="leaderboard-name">${escapeHtml(entry.player_name)}</span>
                <span class="leaderboard-score">${formatNumber(entry.score)}</span>
                <span class="leaderboard-meta">Wave ${entry.wave} · ${entry.difficulty}</span>
            `;
            container.appendChild(row);
        });

        leaderboardLoaded = true;
    } catch (err) {
        console.error('Leaderboard fetch error:', err);
        container.innerHTML = '<div class="leaderboard-empty">Failed to load leaderboard.</div>';
    }
}

// ── Logout ──
function logout() {
    localStorage.removeItem('sd_user');
    sessionStorage.removeItem('sd_difficulty');

    document.getElementById('dashboardPage').classList.add('page-exit');
    setTimeout(() => {
        window.location.href = '/login';
    }, 300);
}

// ── Utility ──
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
