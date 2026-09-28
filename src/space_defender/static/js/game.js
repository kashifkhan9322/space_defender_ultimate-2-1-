/**
 * Space Defender Ultimate - Enhanced Sky War Theme
 */

let canvas, ctx;
let gameState = null;
let gameInterval = null;
let player_id = null;
let username = null;
let difficulty = 'medium';

// Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Enhancement state
let stars = [];
let particles = [];
let isAutoFiring = false;
let frameCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    // Initialize starfield
    for (let i = 0; i < 100; i++) {
        stars.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * CANVAS_HEIGHT,
            size: Math.random() * 2,
            speed: Math.random() * 3 + 1
        });
    }

    // Load leaderboard on start
    loadLeaderboard();

    // Keyboard controls
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Button controls
    document.getElementById('leftBtn').addEventListener('mousedown', () => gameState.moveLeft = true);
    document.getElementById('leftBtn').addEventListener('mouseup', () => gameState.moveLeft = false);
    document.getElementById('rightBtn').addEventListener('mousedown', () => gameState.moveRight = true);
    document.getElementById('rightBtn').addEventListener('mouseup', () => gameState.moveRight = false);

    const shootBtn = document.getElementById('shootBtn');
    shootBtn.addEventListener('click', () => {
        isAutoFiring = !isAutoFiring;
        shootBtn.innerText = isAutoFiring ? '🛑 STOP' : '🔥 AUTO FIRE';
        shootBtn.classList.toggle('active', isAutoFiring);
    });
});

async function login() {
    username = document.getElementById('username').value.trim();
    difficulty = document.getElementById('difficulty').value;

    if (!username) {
        alert('Please enter a username');
        return;
    }

    try {
        const response = await fetch('/api/player/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        let data = await response.json();

        if (!data.success && data.error === 'Username exists') {
            const loginRes = await fetch('/api/player/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            data = await loginRes.json();
        }

        if (data.success) {
            player_id = data.player.id;
            document.getElementById('playerName').innerText = username;
            startNewGame();
        } else {
            alert(data.error || 'Failed to login');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Could not connect to server');
    }
}

async function startNewGame() {
    try {
        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id, difficulty })
        });

        const data = await response.json();

        if (data.success) {
            gameState = data.game_state;
            gameState.moveLeft = false;
            gameState.moveRight = false;
            particles = [];

            // Show game screen
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('gameScreen').classList.remove('hidden');
            document.getElementById('gameOver').classList.add('hidden');

            // Start game loop
            if (gameInterval) clearInterval(gameInterval);
            gameInterval = setInterval(updateGame, 1000 / 60);
        }
    } catch (err) {
        console.error('Start game error:', err);
    }
}

function handleKeyDown(e) {
    if (e.target.tagName && e.target.tagName.toLowerCase() === 'input') return;

    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }

    if (!gameState || gameState.game_over) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') gameState.moveLeft = true;
    if (e.key === 'ArrowRight' || e.key === 'd') gameState.moveRight = true;
    if (e.key === ' ') {
        isAutoFiring = !isAutoFiring;
        const shootBtn = document.getElementById('shootBtn');
        shootBtn.innerText = isAutoFiring ? '🛑 STOP' : '🔥 AUTO FIRE';
        shootBtn.classList.toggle('active', isAutoFiring);
    }
}

function handleKeyUp(e) {
    if (!gameState || gameState.game_over) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') gameState.moveLeft = false;
    if (e.key === 'ArrowRight' || e.key === 'd') gameState.moveRight = false;
}

function shoot() {
    gameState.bullets.push({
        x: gameState.player.x,
        y: gameState.player.y - 15,
        damage: 1,
        speed: 12,
        active: true
    });
}

function updateGame() {
    if (!gameState) return;

    if (gameState.game_over) {
        endGame();
        return;
    }

    frameCount++;

    // Handle Auto Fire
    if (isAutoFiring && frameCount % 10 === 0) {
        shoot();
    }

    // Update State
    updateLocalObjects();

    // Draw
    draw();

    // UI
    updateUI();

    // Sync
    if (frameCount % 60 === 0) {
        syncWithServer();
    }
}

function updateLocalObjects() {
    // Movement
    if (gameState.moveLeft) gameState.player.x = Math.max(30, gameState.player.x - 8);
    if (gameState.moveRight) gameState.player.x = Math.min(CANVAS_WIDTH - 30, gameState.player.x + 8);

    // Stars
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > CANVAS_HEIGHT) star.y = 0;
    });

    // Bullets
    gameState.bullets = gameState.bullets.filter(b => b.y > 0);
    gameState.bullets.forEach(b => b.y -= b.speed);

    // Enemies & Spawning
    if (frameCount % 40 === 0) spawnAsteroid();

    gameState.enemies.forEach(e => {
        e.y += e.type.speed;
        if (e.type.name === 'Asteroid') e.rotation = (e.rotation || 0) + 0.02;
    });

    // Collision checking
    gameState.bullets.forEach((b, bi) => {
        gameState.enemies.forEach((e, ei) => {
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < e.type.size + 5) {
                e.health -= 1;
                createExplosion(b.x, b.y, '#fff', 5);
                gameState.bullets.splice(bi, 1);
                if (e.health <= 0) {
                    gameState.player.score += e.type.points;
                    createExplosion(e.x, e.y, e.type.color, 15);
                    gameState.enemies.splice(ei, 1);
                    gameState.stats.total_kills++;
                }
            }
        });
    });

    // Particles
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        p.size *= 0.95;
    });

    // Player damage
    gameState.enemies.forEach((e, ei) => {
        if (e.y > CANVAS_HEIGHT) {
            gameState.enemies.splice(ei, 1);
            gameState.player.health -= 10;
            if (gameState.player.health <= 0) gameState.game_over = true;
        }

        const dx = e.x - gameState.player.x;
        const dy = e.y - gameState.player.y;
        if (Math.sqrt(dx * dx + dy * dy) < 40) {
            gameState.player.health -= 20;
            createExplosion(gameState.player.x, gameState.player.y, '#ff0', 10);
            gameState.enemies.splice(ei, 1);
            if (gameState.player.health <= 0) gameState.game_over = true;
        }
    });
}

function spawnAsteroid() {
    const size = Math.random() * 20 + 20;
    gameState.enemies.push({
        x: Math.random() * (CANVAS_WIDTH - 100) + 50,
        y: -50,
        health: 2,
        max_health: 2,
        rotation: 0,
        type: {
            name: 'Asteroid',
            color: '#888',
            size: size,
            speed: Math.random() * 2 + 1,
            shape: 'asteroid'
        }
    });
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            size: Math.random() * 4 + 2,
            color,
            life: 1.0,
            decay: Math.random() * 0.05 + 0.02
        });
    }
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stars
    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Draw Player Spaceship
    drawSpaceship(gameState.player.x, gameState.player.y);

    // Draw Enemies
    gameState.enemies.forEach(enemy => {
        if (enemy.type.shape === 'asteroid') {
            drawAsteroid(enemy.x, enemy.y, enemy.type.size, enemy.rotation);
        } else {
            // Default drawing for other types
            ctx.fillStyle = enemy.type.color;
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.type.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Health Bar
        if (enemy.health < enemy.max_health) {
            ctx.fillStyle = 'rgba(255,0,0,0.5)';
            ctx.fillRect(enemy.x - 20, enemy.y - enemy.type.size - 10, 40, 5);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(enemy.x - 20, enemy.y - enemy.type.size - 10, 40 * (enemy.health / enemy.max_health), 5);
        }
    });

    // Draw Bullets
    ctx.fillStyle = '#0ff';
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 10;
    gameState.bullets.forEach(bullet => {
        ctx.fillRect(bullet.x - 2, bullet.y - 10, 4, 15);
    });
    ctx.shadowBlur = 0;
}

function drawSpaceship(x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Engine Glow
    const glow = ctx.createRadialGradient(0, 15, 0, 0, 15, 20);
    glow.addColorStop(0, '#0ff');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 15, 10 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#222';
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 2;

    // Main Hull
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(12, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wings
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(25, 15);
    ctx.lineTo(12, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-25, 15);
    ctx.lineTo(-12, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit
    ctx.fillStyle = '#0aa';
    ctx.beginPath();
    ctx.arc(0, -5, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawAsteroid(x, y, size, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.fillStyle = '#555';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;

    ctx.beginPath();
    const steps = 8;
    for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const r = size * (0.8 + Math.random() * 0.4);
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crates
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(-size / 3, -size / 4, size / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function updateUI() {
    document.getElementById('score').innerText = gameState.player.score;
    document.getElementById('health').innerText = gameState.player.health;
    document.getElementById('wave').innerText = gameState.wave;
    document.getElementById('combo').innerText = gameState.combo.toFixed(1) + 'x';
}

async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        const container = document.getElementById('leaderboardEntries');
        container.innerHTML = '';
        data.forEach((entry, index) => {
            const div = document.createElement('div');
            div.className = 'leaderboard-entry';
            div.innerHTML = `<span>${index + 1}. ${entry.player_name}</span><span>Wave ${entry.wave} - ${entry.score} pts</span>`;
            container.appendChild(div);
        });
    } catch (err) { }
}

async function syncWithServer() {
    try {
        await fetch('/api/game/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_state: gameState })
        });
    } catch (err) { }
}

async function endGame() {
    clearInterval(gameInterval);
    gameInterval = null;
    try {
        await fetch('/api/game/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: gameState.player.score })
        });
        document.getElementById('finalScore').innerText = gameState.player.score;
        document.getElementById('finalWave').innerText = gameState.wave;
        document.getElementById('finalKills').innerText = gameState.stats.total_kills;
        document.getElementById('gameOver').classList.remove('hidden');
        loadLeaderboard();
    } catch (err) { }
}

function restart() { startNewGame(); }
function quitToMenu() {
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = null;
    gameState = null;
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    loadLeaderboard();
}
