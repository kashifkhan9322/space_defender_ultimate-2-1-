// game.js — Space Defender Ultimate Game Logic
// Auth guard, canvas game engine, HUD updates, pause, game over

console.log('Space Defender Game JS v3.0 loaded');

// ── Auth Guard ──
const userData = localStorage.getItem('sd_user');
if (!userData) {
    window.location.href = '/login';
}
const currentUser = JSON.parse(userData || '{}');
let difficulty = sessionStorage.getItem('sd_difficulty') || 'medium';

// ── Difficulty Configuration ──
const DIFFICULTY_CONFIG = {
    easy: {
        label: 'Easy',
        spawnRate: 0.018,          // Low enemy spawn rate
        enemySpeedBase: 0.6,      // Slow base speed
        enemySpeedWaveScale: 0.3,  // Slow wave scaling
        maxEnemies: 8,            // Low asteroid/enemy count
        lives: 5,                 // 5 lives
        startHealth: 100,
        contactDamage: 10,        // 🟢 -10 health on collision
        powerupChance: 0.20,      // Frequent power-ups
        powerupHeal: 25,          // Generous healing
        invulnDuration: 700,      // 0.7s invulnerability after hit
        scoreMultiplier: 1.0,     // 1x score
        playerFireRate: 120,      // Fast fire rate for Easy

        // 🎨 Visual Theme (Easy)
        asteroidColor: '#555555',  // Dark gray
        glowColor: '#4488ff',      // Soft blue glow
        coreColor: '#222222',
        crackColor: 'transparent',
        rotationSpeed: 0.01        // Slow rotation
    },
    medium: {
        label: 'Medium',
        spawnRate: 0.035,          // Moderate spawn rate
        enemySpeedBase: 1.0,      // Medium base speed
        enemySpeedWaveScale: 0.5,  // Medium wave scaling
        maxEnemies: 15,           // Medium enemy count
        lives: 3,                 // 3 lives
        startHealth: 100,
        contactDamage: 20,        // 🟡 -20 health on collision
        powerupChance: 0.10,      // Occasional power-ups
        powerupHeal: 20,          // Standard healing
        invulnDuration: 700,      // 0.7s invulnerability after hit
        scoreMultiplier: 1.5,     // 1.5x score
        playerFireRate: 150,      // Standard fire rate

        // 🎨 Visual Theme (Medium)
        asteroidColor: '#444444',
        glowColor: '#ffbb44',      // Orange glow
        coreColor: '#332211',
        crackColor: '#ff8822',     // Orange cracks
        rotationSpeed: 0.02        // Moderate rotation
    },
    hard: {
        label: 'Hard',
        spawnRate: 0.06,           // Fast spawn rate
        enemySpeedBase: 1.5,      // High base speed
        enemySpeedWaveScale: 0.7,  // Fast wave scaling
        maxEnemies: 25,           // High enemy count
        lives: 1,                 // 1 life only
        startHealth: 100,
        contactDamage: 35,        // 🔴 -35 health on collision
        powerupChance: 0.04,      // Rare power-ups
        powerupHeal: 15,          // Less healing
        invulnDuration: 500,      // 0.5s invulnerability after hit
        scoreMultiplier: 2.0,     // 2x score
        playerFireRate: 200,      // Slower (more punishing) fire rate for Hard

        // 🎨 Visual Theme (Hard)
        asteroidColor: '#222222',
        glowColor: '#ff4444',      // Aggressive red glow
        coreColor: '#1a0000',
        crackColor: '#ff2222',     // Intense red cracks
        rotationSpeed: 0.04,       // Fast rotation

        // ⚡ Hard Mode Events
        stormChance: 0.002,        // Chance to trigger burst per frame
        eliteChance: 0.15
    }
};

let config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;

// ── Game State ──
let canvas, ctx;
let player = { x: 400, y: 500, width: 40, height: 40, health: config.startHealth, score: 0 };
let lives = config.lives;
let enemies = [];
let bullets = [];
let powerups = [];
let particles = [];
let gameRunning = false;
let gamePaused = false;
let autoFire = false;
let lastPlayerFireTime = 0;
let lastTime = 0;
let gameLoopId = null;
let wave = 1;
let combo = 1.0;
let stats = { total_kills: 0, headshots: 0, max_combo: 1.0 };
let playerId = currentUser.id;
let playerName = currentUser.username || 'Pilot';
let gameId = null;
let keys = {};
let isStartingGame = false;
let pendingEndPromise = null;

// Hard Mode Event State
let stormTimer = 0; // Storm duration in ms
let nextStormTick = 0;

// ── Collision / Hit State ──
let isInvulnerable = false;        // Temporary invulnerability after a hit
let invulnTimer = 0;               // Remaining invulnerability time (ms)
let hitFlashTimer = 0;             // Red flash duration remaining (ms)
let screenShake = { x: 0, y: 0 };  // Current screen shake offset
let screenShakeTimer = 0;          // Screen shake remaining (ms)

// ── Initialize ──
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    setupKeyboard();
    setupMobileControls();

    // Auto-Fire Button (HUD)
    const autoFireBtn = document.getElementById('autoFireBtn');
    if (autoFireBtn) {
        autoFireBtn.addEventListener('click', toggleAutoFire);
    }

    launchGame();
});

function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    // Keep 4:3 aspect or fill
    canvas.width = Math.min(w, 1200);
    canvas.height = Math.min(h, 900);

    // Update player bounds
    if (player) {
        player.x = Math.min(player.x, canvas.width - 20);
        player.y = canvas.height - 80;
    }
}

// ── Keyboard ──
function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        keys[e.code] = true;

        if (e.code === 'Space') {
            e.preventDefault();
            toggleAutoFire();
        }

        if (e.code === 'Escape') {
            togglePause();
        }
    });
    document.addEventListener('keyup', (e) => keys[e.code] = false);
}

// ── Mobile Controls ──
function setupMobileControls() {
    const leftBtn = document.getElementById('leftBtn');
    const rightBtn = document.getElementById('rightBtn');
    const shootBtn = document.getElementById('shootBtn');

    if (leftBtn) {
        leftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowLeft'] = true; });
        leftBtn.addEventListener('touchend', () => { keys['ArrowLeft'] = false; });
        leftBtn.addEventListener('mousedown', () => { keys['ArrowLeft'] = true; });
        leftBtn.addEventListener('mouseup', () => { keys['ArrowLeft'] = false; });
    }

    if (rightBtn) {
        rightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys['ArrowRight'] = true; });
        rightBtn.addEventListener('touchend', () => { keys['ArrowRight'] = false; });
        rightBtn.addEventListener('mousedown', () => { keys['ArrowRight'] = true; });
        rightBtn.addEventListener('mouseup', () => { keys['ArrowRight'] = false; });
    }

    if (shootBtn) {
        shootBtn.addEventListener('click', toggleAutoFire);
    }
}

/**
 * Toggle Auto-Fire state and sync UI
 */
function toggleAutoFire() {
    autoFire = !autoFire;

    // Sync HUD button
    const autoFireBtn = document.getElementById('autoFireBtn');
    if (autoFireBtn) {
        autoFireBtn.textContent = autoFire ? '🔫 AUTO-FIRE: ON' : '🔫 AUTO-FIRE: OFF';
        autoFireBtn.classList.toggle('active-auto', autoFire);
    }

    // Sync Mobile button
    const shootBtn = document.getElementById('shootBtn');
    if (shootBtn) {
        shootBtn.classList.toggle('active', autoFire);
    }
}

/**
 * Handle difficulty selection on Game Over screen
 */
function selectDifficulty(diff) {
    difficulty = diff;
    config = DIFFICULTY_CONFIG[diff] || DIFFICULTY_CONFIG.medium;
    sessionStorage.setItem('sd_difficulty', diff);

    // Update UI active states
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === diff);
    });

    // Proactively update badge
    const badge = document.getElementById('difficultyBadge');
    if (badge) {
        badge.textContent = config.label.toUpperCase();
        badge.className = 'difficulty-badge ' + difficulty;
    }
}

// ── Game Launch ──
async function launchGame() {
    if (isStartingGame) return;
    isStartingGame = true;

    // Refresh difficulty from session storage (in case it was changed)
    difficulty = sessionStorage.getItem('sd_difficulty') || 'medium';
    config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;

    try {
        // If the previous match is still ending (network in flight), wait.
        if (pendingEndPromise) {
            await pendingEndPromise;
            pendingEndPromise = null;
        }

        const response = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: playerId, difficulty: difficulty })
        });
        const result = await response.json();

        if (result.success) {
            gameId = result.game_id;

            // Clean up any existing loops or intervals before starting fresh
            if (gameLoopId) cancelAnimationFrame(gameLoopId);
            if (window.syncInterval) clearInterval(window.syncInterval);

            // Ensure difficulty is reflected in UI before starting
            updateHUD();

            resetGameState();
            gameRunning = true;
            gamePaused = false;
            lastTime = performance.now();
            gameLoopId = requestAnimationFrame(gameLoop);

            // Periodic sync
            window.syncInterval = setInterval(syncGameState, 5000);
        } else {
            console.error('Failed to start game:', result);
        }
    } catch (err) {
        console.error('Game start error:', err);
    } finally {
        isStartingGame = false;
    }
}

function resetGameState() {
    player = {
        x: canvas.width / 2,
        y: canvas.height - 80,
        width: 40,
        height: 40,
        health: config.startHealth,
        score: 0
    };
    lives = config.lives;
    enemies = [];
    bullets = [];
    powerups = [];
    particles = [];
    wave = 1;
    combo = 1.0;
    stats = { total_kills: 0, headshots: 0, max_combo: 1.0 };
    autoFire = false;
    stormTimer = 0;
    nextStormTick = 0;
    lastPlayerFireTime = 0;

    // Reset collision and animation state
    isInvulnerable = false;
    invulnTimer = 0;
    hitFlashTimer = 0;
    screenShake = { x: 0, y: 0 };
    screenShakeTimer = 0;

    // Clear stuck keys
    keys = {};

    // Reset UI / HUD
    updateHUD();

    // Sync Auto-Fire toggle state in UI
    const autoFireBtn = document.getElementById('autoFireBtn');
    if (autoFireBtn) {
        autoFireBtn.textContent = '🔫 AUTO-FIRE: OFF';
        autoFireBtn.classList.remove('active-auto');
    }
    const shootBtn = document.getElementById('shootBtn');
    if (shootBtn) shootBtn.classList.remove('active');

    // Hide overlays
    document.getElementById('gameOverOverlay').classList.remove('visible');
    document.getElementById('pauseOverlay').classList.remove('visible');
    document.getElementById('specialEventNotify').classList.remove('visible');
}

// ── Game Loop ──
function gameLoop(timestamp) {
    if (!gameRunning) return;

    if (!gamePaused) {
        const dt = Math.min(timestamp - lastTime, 50); // Cap delta to prevent jumps
        lastTime = timestamp;

        update(dt);
        draw();
    }

    gameLoopId = requestAnimationFrame(gameLoop);
}

// ── Update ──
function update(dt) {
    const speed = 5 * (dt / 16.67); // normalize to 60fps

    // ── Tick invulnerability / hit flash / screen shake timers ──
    if (isInvulnerable) {
        invulnTimer -= dt;
        if (invulnTimer <= 0) {
            isInvulnerable = false;
            invulnTimer = 0;
        }
    }
    if (hitFlashTimer > 0) hitFlashTimer = Math.max(0, hitFlashTimer - dt);
    if (screenShakeTimer > 0) {
        screenShakeTimer = Math.max(0, screenShakeTimer - dt);
        const intensity = 4 * (screenShakeTimer / 300); // fade out shake
        screenShake.x = (Math.random() - 0.5) * intensity * 2;
        screenShake.y = (Math.random() - 0.5) * intensity * 2;
    } else {
        screenShake.x = 0;
        screenShake.y = 0;
    }

    // ── Player movement ──
    if (keys['ArrowLeft'] || keys['KeyA']) player.x = Math.max(20, player.x - speed);
    if (keys['ArrowRight'] || keys['KeyD']) player.x = Math.min(canvas.width - 20, player.x + speed);

    // ── Auto fire (Fixed Rate based on difficulty) ──
    if (autoFire && performance.now() - lastPlayerFireTime >= config.playerFireRate) {
        bullets.push({ x: player.x, y: player.y - 20, speed: 8 });
        lastPlayerFireTime = performance.now();
    }

    // ── Update bullets ──
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= bullets[i].speed;
        if (bullets[i].y < -10) bullets.splice(i, 1);
    }

    // ── Hard Mode Events (Storms) ──
    if (difficulty === 'hard') {
        if (stormTimer > 0) {
            stormTimer -= dt;
            if (Date.now() > nextStormTick) {
                spawnAsteroid(true); // Storm asteroid
                nextStormTick = Date.now() + 150;
            }
        } else if (Math.random() < config.stormChance) {
            stormTimer = 3000 + Math.random() * 2000; // 3-5s storm
            showNotification("ASTEROID STORM DETECTED!", 2500);
            screenShakeTimer = 500;
        }
    }

    // ── Spawn enemies (governed by difficulty config) ──
    if (enemies.length < config.maxEnemies && Math.random() < config.spawnRate) {
        spawnAsteroid();
    }

    // ── Update enemies ──
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        e.y += e.speed;
        e.rotation += e.rotationSpeed;

        // ── Collision with player (ONLY way health decreases) ──
        if (!isInvulnerable && checkCollision(player, e)) {
            handleCollision(e, ei);
            continue;
        }

        // ── Off screen — just remove, NO health penalty ──
        if (e.y > canvas.height + 30) {
            enemies.splice(ei, 1);
            continue;
        }

        // ── Bullet→Enemy collision ──
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            const bDist = Math.hypot(e.x - b.x, e.y - b.y);
            if (bDist < e.size) {
                e.health--;
                bullets.splice(bi, 1);

                if (e.health <= 0) {
                    const currentWave = Number(wave) || 1;
                    let points = Math.round(10 * currentWave * config.scoreMultiplier);
                    if (isNaN(points)) points = 10;

                    const currentScore = Number(player.score) || 0;
                    player.score = currentScore + points;

                    stats.total_kills = (Number(stats.total_kills) || 0) + 1;

                    spawnParticles(e.x, e.y, '#00ffff', 8);
                    enemies.splice(ei, 1);

                    // Chance powerup (governed by difficulty)
                    if (Math.random() < config.powerupChance) {
                        powerups.push({ x: e.x, y: e.y, speed: 2 });
                    }
                }
                break;
            }
        }
    }

    // ── Update powerups ──
    for (let i = powerups.length - 1; i >= 0; i--) {
        powerups[i].y += powerups[i].speed;
        const pDist = Math.hypot(powerups[i].x - player.x, powerups[i].y - player.y);
        if (pDist < 30) {
            player.health = Math.min(config.startHealth, player.health + config.powerupHeal);
            spawnParticles(powerups[i].x, powerups[i].y, '#00ff88', 6);
            powerups.splice(i, 1);
            continue;
        }
        if (powerups[i].y > canvas.height + 20) {
            powerups.splice(i, 1);
        }
    }

    // ── Update particles ──
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // ── Wave progression ──
    const currentKills = Number(stats.total_kills) || 0;
    const currentWave = Number(wave) || 1;
    if (currentKills > currentWave * 10) {
        wave = currentWave + 1;
    }

    // ── Update HUD ──
    updateHUD();

    // ── Check death → lose a life or game over ──
    if (player.health <= 0) {
        lives--;
        if (lives > 0) {
            // Respawn with full health + brief invulnerability
            player.health = config.startHealth;
            player.x = canvas.width / 2;
            isInvulnerable = true;
            invulnTimer = config.invulnDuration * 2; // Extra-long on respawn
            spawnParticles(player.x, player.y, '#ffdd00', 12);
        } else {
            player.health = 0;
            gameOver();
        }
    }
}

// ═══════════════════════════════════════════
//   ASTEROID ENGINE & ATTACK SYSTEM
// ═══════════════════════════════════════════

function spawnAsteroid(isStorm = false) {
    const isElite = difficulty === 'hard' && !isStorm && Math.random() < config.eliteChance;
    const size = (isElite ? 40 : 15 + Math.random() * 20);

    // Generate complex polygon shape
    const segments = 8 + Math.floor(Math.random() * 5);
    const points = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const radius = size * (0.8 + Math.random() * 0.4);
        points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }

    // Generate glowing cracks
    const cracks = [];
    if (config.crackColor !== 'transparent') {
        const crackCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < crackCount; i++) {
            const a1 = Math.random() * Math.PI * 2;
            const a2 = a1 + (Math.random() - 0.5);
            cracks.push({
                x1: Math.cos(a1) * size * 0.2, y1: Math.sin(a1) * size * 0.2,
                x2: Math.cos(a2) * size * 0.8, y2: Math.sin(a2) * size * 0.8
            });
        }
    }

    enemies.push({
        x: Math.random() * (canvas.width - 40) + 20,
        y: -size,
        size: size,
        points: points,
        cracks: cracks,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * config.rotationSpeed * 2,
        speed: (isStorm ? 4 : config.enemySpeedBase) + Math.random() * (wave * config.enemySpeedWaveScale),
        health: isElite ? 3 : 1,
        isElite: isElite,
        color: config.asteroidColor,
        glowColor: config.glowColor,
        coreColor: config.coreColor,
        crackColor: config.crackColor
    });
}

// ═══════════════════════════════════════════
//   COLLISION DETECTION & DAMAGE SYSTEM
// ═══════════════════════════════════════════

/**
 * checkCollision — proper hitbox overlap test.
 * Player: treated as bounding box (triangle inscribed in rect).
 * Enemy/Asteroid: treated as a circle.
 * Uses circle-vs-AABB (axis-aligned bounding box) hybrid test.
 */
function checkCollision(p, enemy) {
    // Player bounding box (the triangle fits inside this rectangle)
    const pLeft = p.x - p.width / 2;
    const pRight = p.x + p.width / 2;
    const pTop = p.y - p.height / 2;
    const pBottom = p.y + p.height / 2;

    // Find the closest point on the AABB to the circle center
    const closestX = Math.max(pLeft, Math.min(enemy.x, pRight));
    const closestY = Math.max(pTop, Math.min(enemy.y, pBottom));

    // Distance from circle center to closest point on AABB
    const dx = enemy.x - closestX;
    const dy = enemy.y - closestY;
    const distSq = dx * dx + dy * dy;

    return distSq < (enemy.size * enemy.size);
}

/**
 * handleCollision — called when a confirmed hitbox overlap is detected.
 * Applies difficulty-based damage, destroys the asteroid, triggers
 * invulnerability + visual feedback (flash, shake, particles).
 */
function handleCollision(enemy, enemyIndex) {
    // 1. Apply damage (clamped to 0)
    player.health = Math.max(0, player.health - config.contactDamage);

    // 2. Destroy the asteroid
    enemies.splice(enemyIndex, 1);

    // 3. Explosion particles at collision point
    const hitX = (player.x + enemy.x) / 2;
    const hitY = (player.y + enemy.y) / 2;
    spawnParticles(hitX, hitY, '#ff4444', 12);
    spawnParticles(hitX, hitY, '#ff8800', 6);

    // Debris chunks
    for (let i = 0; i < 4; i++) {
        particles.push({
            x: enemy.x, y: enemy.y,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 0.8,
            color: enemy.color,
            size: 2 + Math.random() * 4
        });
    }

    // 4. Activate invulnerability window (prevents rapid multi-hits)
    isInvulnerable = true;
    invulnTimer = config.invulnDuration;

    // 5. Trigger red flash (300ms)
    hitFlashTimer = 300;

    // 6. Trigger screen shake (300ms)
    screenShakeTimer = 300;
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0,
            color
        });
    }
}

// ── Draw ──
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── Apply screen shake ──
    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // ── Draw player (Enhanced Futuristic Ship) ──
    drawPlayerShip(ctx, player.x, player.y, performance.now(), hitFlashTimer > 0, isInvulnerable, invulnTimer, autoFire);

    // ── Draw bullets ──
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffdd00';
    bullets.forEach(b => {
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
    });
    ctx.shadowBlur = 0;

    // ── Draw enemies ──
    enemies.forEach(e => {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rotation);

        // Particle trail (simple trail for moving fast)
        if (e.speed > 2 && Math.random() < 0.2) {
            spawnParticles(e.x, e.y, e.glowColor, 1);
        }

        // 1. Glow shader effect
        ctx.shadowColor = e.glowColor;
        ctx.shadowBlur = e.isElite ? 25 : 15;

        // 2. High-detail polygon body
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(e.points[0].x, e.points[0].y);
        for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i].x, e.points[i].y);
        ctx.closePath();
        ctx.fill();

        // 3. Shading (Layered design)
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.moveTo(e.points[0].x * 0.9, e.points[0].y * 0.9);
        for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i].x * 0.9, e.points[i].y * 0.9);
        ctx.closePath();
        ctx.fill();

        // 4. Glowing Core
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, e.size * 0.6);
        coreGrad.addColorStop(0, e.glowColor);
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, e.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // 5. Cracks and details
        if (e.crackColor !== 'transparent') {
            ctx.strokeStyle = e.crackColor;
            ctx.lineWidth = 1;
            e.cracks.forEach(c => {
                ctx.beginPath();
                ctx.moveTo(c.x1, c.y1);
                ctx.lineTo(c.x2, c.y2);
                ctx.stroke();
            });
        }

        ctx.restore();
    });

    // ── Draw powerups ──
    powerups.forEach(p => {
        ctx.fillStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Cross symbol
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y);
        ctx.lineTo(p.x + 4, p.y);
        ctx.moveTo(p.x, p.y - 4);
        ctx.lineTo(p.x, p.y + 4);
        ctx.stroke();
    });

    // ── Draw particles ──
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // ── Draw Debris/Chunks ──
    particles.forEach(p => {
        if (p.size) { // Debris chunks have a size property
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.life * 5); // Rotate debris as it fades
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        }
    });
    ctx.globalAlpha = 1;

    // ── Health bar at bottom ──
    const barWidth = canvas.width * 0.3;
    const barX = canvas.width / 2 - barWidth / 2;
    const barY = canvas.height - 20;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(barX, barY, barWidth, 8);
    const healthPct = Math.max(0, player.health) / config.startHealth;
    const healthColor = healthPct > 0.5 ? '#00ff88' : healthPct > 0.25 ? '#ffdd00' : '#ff4444';
    ctx.fillStyle = healthColor;
    ctx.fillRect(barX, barY, barWidth * healthPct, 8);

    // ── Red flash overlay ──
    if (hitFlashTimer > 0) {
        const flashAlpha = 0.25 * (hitFlashTimer / 300);
        ctx.fillStyle = `rgba(255, 0, 0, ${flashAlpha})`;
        ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);
    }

    // ── Restore from screen shake transform ──
    ctx.restore();
}

// ── HUD ──
function updateHUD() {
    document.getElementById('hudScore').textContent = player.score;
    document.getElementById('hudWave').textContent = wave;
    document.getElementById('hudHealth').textContent = Math.max(0, player.health);
    document.getElementById('hudLives').textContent = lives;
    document.getElementById('hudCombo').textContent = (combo || 1.0).toFixed(1) + 'x';

    // Difficulty Badge
    const badge = document.getElementById('difficultyBadge');
    if (badge) {
        badge.textContent = config.label.toUpperCase();
        badge.className = 'difficulty-badge ' + difficulty;
    }
}

function showNotification(text, duration = 3000) {
    const el = document.getElementById('specialEventNotify');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), duration);
}

// ── Pause ──
function togglePause() {
    if (!gameRunning) return;

    gamePaused = !gamePaused;

    const overlay = document.getElementById('pauseOverlay');
    const btn = document.getElementById('pauseBtn');

    if (gamePaused) {
        overlay.classList.add('visible');
        btn.textContent = '▶ Resume';
    } else {
        overlay.classList.remove('visible');
        btn.textContent = '⏸ Pause';
        lastTime = performance.now();
    }
}

// ── Game Over ──
function gameOver() {
    gameRunning = false;
    clearInterval(window.syncInterval);

    document.getElementById('finalScore').textContent = player.score;
    document.getElementById('finalWave').textContent = wave;
    document.getElementById('finalKills').textContent = stats.total_kills;
    document.getElementById('finalCombo').textContent = (stats.max_combo || 1.0).toFixed(1) + 'x';

    document.getElementById('gameOverOverlay').classList.add('visible');

    // Update difficulty selection UI state
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === difficulty);
    });

    // End match (async). Store the promise so restarts/navigation can await it.
    pendingEndPromise = endCurrentGame();
}

// ── Restart ──
async function restartGame() {
    document.getElementById('gameOverOverlay').classList.remove('visible');
    // launchGame() now re-reads difficulty from localStorage
    await launchGame();
}

// ── Back to Dashboard ──
async function backToDashboard() {
    gameRunning = false;
    gamePaused = false;
    clearInterval(window.syncInterval);

    // Save/end current state before leaving (avoid session races)
    if (pendingEndPromise) {
        await pendingEndPromise;
        pendingEndPromise = null;
    } else {
        await endCurrentGame();
    }

    // Re-fetch player data so dashboard shows updated stats
    await refreshPlayerData();
    document.getElementById('gamePage').classList.add('page-exit');
    setTimeout(() => {
        window.location.href = '/dashboard';
    }, 300);
}

async function refreshPlayerData() {
    try {
        const response = await fetch('/api/player/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: playerName })
        });
        const result = await response.json();
        if (result.success) {
            localStorage.setItem('sd_user', JSON.stringify(result.player));
        }
    } catch (err) {
        console.error('Failed to refresh player data:', err);
    }
}

/**
 * Enhanced Spaceship Visuals
 * Detailed futuristic design with layered panels, glowing strips, and animated engine.
 */
function drawPlayerShip(ctx, x, y, time, isHit, isInvulnerable, invulnTimer, isAutoFire) {
    // 1. Invisible check (blink effect)
    if (isInvulnerable && Math.floor(invulnTimer / 60) % 2 === 0) return;

    ctx.save();

    // 2. Idle Animation (gentle hover)
    const hoverOffset = Math.sin(time / 200) * 3;
    ctx.translate(x, y + hoverOffset);

    const themeColor = isHit ? '#ff4444' : '#00ffff';
    const secondaryColor = isHit ? '#882222' : '#005577';
    const hullColor = '#2a2a2e';

    // 3. Engine Flame (Reactive & Animated)
    const flameSize = 15 + Math.random() * 8;
    const flameGrad = ctx.createRadialGradient(0, 20, 0, 0, 20, flameSize * 1.5);
    flameGrad.addColorStop(0, '#fff');
    flameGrad.addColorStop(0.3, themeColor);
    flameGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-10, 18);
    ctx.lineTo(0, 18 + flameSize * 2);
    ctx.lineTo(10, 18);
    ctx.closePath();
    ctx.fill();

    // Secondary exhaust glows
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(-8, 18, 5 + Math.random() * 3, 0, Math.PI * 2);
    ctx.arc(8, 18, 5 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // 4. Main Hull (Layered & Smooth)
    ctx.shadowBlur = isHit ? 20 : 10;
    ctx.shadowColor = themeColor;

    // Outer Fins / Wings
    ctx.fillStyle = secondaryColor;
    ctx.beginPath();
    ctx.moveTo(-22, 10);
    ctx.lineTo(-28, 18);
    ctx.lineTo(-8, 18);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(22, 10);
    ctx.lineTo(28, 18);
    ctx.lineTo(8, 18);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();

    // Main Body Panels
    ctx.fillStyle = hullColor;
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(0, -25); // Nose
    ctx.bezierCurveTo(15, -15, 18, 15, 12, 20); // Right side
    ctx.lineTo(-12, 20); // Bottom
    ctx.bezierCurveTo(-18, 15, -15, -15, 0, -25); // Left side
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. Surface Details (Vents & Panels)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -5); ctx.lineTo(8, -5); // Upper horizontal
    ctx.moveTo(-10, 5); ctx.lineTo(10, 5); // Lower horizontal
    ctx.stroke();

    // Glow Strips (Neon details)
    ctx.shadowBlur = 8;
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 8); ctx.lineTo(-16, 14);
    ctx.moveTo(14, 8); ctx.lineTo(16, 14);
    ctx.stroke();

    // 5.5 Auto-Fire Status Indicator (LED)
    if (isAutoFire) {
        const ledColor = '#00ff88';
        ctx.shadowBlur = 10;
        ctx.shadowColor = ledColor;
        ctx.fillStyle = ledColor;
        // Small glowing LED on each wing
        ctx.beginPath();
        ctx.arc(-18, 12, 2.5, 0, Math.PI * 2);
        ctx.arc(18, 12, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Hull pulse
        if (Math.sin(time / 100) > 0) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = ledColor;
            ctx.beginPath();
            ctx.moveTo(-5, 5);
            ctx.lineTo(5, 5);
            ctx.lineTo(8, 12);
            ctx.lineTo(-8, 12);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    // 6. Cockpit (Detailed Dome)
    const cockpitGrad = ctx.createRadialGradient(0, -5, 0, 0, -5, 10);
    cockpitGrad.addColorStop(0, '#001a1a');
    cockpitGrad.addColorStop(0.8, '#000');
    cockpitGrad.addColorStop(1, themeColor);

    ctx.fillStyle = cockpitGrad;
    ctx.beginPath();
    ctx.ellipse(0, -5, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glass Reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(-2, -8, 2, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ── Sync State ──
async function syncGameState() {
    if (!gameId) return;

    const state = {
        player: { score: player.score },
        wave: wave,
        stats: stats,
        time_played: 0
    };

    try {
        const res = await fetch('/api/game/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: gameId, game_state: state })
        });
        if (!res.ok) {
            console.warn('Sync failed:', res.status);
        }
    } catch (err) {
        console.error('Sync error:', err);
    }
}

async function endCurrentGame() {
    if (!gameId) return;

    const endingGameId = gameId;

    // Prevent any further syncs from using an already-ended game id.
    gameId = null;

    try {
        // Best-effort final sync before ending.
        try {
            const state = {
                player: { score: player.score },
                wave: wave,
                stats: stats,
                time_played: 0
            };
            await fetch('/api/game/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game_id: endingGameId, game_state: state })
            });
        } catch (e) {
            // Ignore final-sync failures; still attempt end.
        }

        const res = await fetch('/api/game/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_id: endingGameId })
        });
        if (!res.ok) {
            console.warn('End game failed:', res.status);
        }
    } catch (err) {
        console.error('End game error:', err);
    }
}
