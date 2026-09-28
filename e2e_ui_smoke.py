import asyncio
import json
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

from playwright.async_api import Page, async_playwright


BASE_URL = "http://127.0.0.1:5000"


@dataclass
class ConsoleEntry:
    type: str
    text: str
    location: Optional[Dict[str, Any]] = None


@dataclass
class NetworkFailure:
    url: str
    method: str
    failure: Optional[str]


@dataclass
class HttpError:
    url: str
    method: str
    status: int


async def attach_observers(page: Page, console: List[ConsoleEntry], net_failures: List[NetworkFailure], http_errors: List[HttpError]) -> None:
    page.on(
        "console",
        lambda msg: console.append(
            ConsoleEntry(
                type=msg.type,
                text=msg.text,
                location=msg.location if msg.location else None,
            )
        ),
    )

    page.on(
        "requestfailed",
        lambda req: net_failures.append(
            NetworkFailure(
                url=req.url,
                method=req.method,
                failure=req.failure.error_text if req.failure else None,
            )
        ),
    )

    async def on_response(resp):
        try:
            status = resp.status
            if status >= 400:
                req = resp.request
                http_errors.append(HttpError(url=resp.url, method=req.method, status=status))
        except Exception:
            # Best-effort logging only; never fail the run due to observer.
            pass

    page.on("response", on_response)


async def login(page: Page, username: str, password: str) -> None:
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.locator("#username").fill(username)
    await page.locator("#password").fill(password)
    await page.locator("#loginBtn").click()

    # If the user doesn't exist, register instead (still using "any password" rule from prompt).
    # This keeps the smoke run resilient.
    try:
        await page.wait_for_url("**/dashboard", timeout=4000)
    except Exception:
        msg = await page.locator("#loginMessage").inner_text()
        if "Pilot not found" in msg:
            await page.locator("#registerLink").click()
            await page.wait_for_url("**/dashboard", timeout=10000)
        else:
            raise

    await page.wait_for_selector("#dashboardPage", state="visible", timeout=10000)


async def dashboard_launch_game_hard(page: Page) -> None:
    await page.wait_for_selector("#startGameBtn", state="visible", timeout=10000)
    await page.locator("button.difficulty-btn[data-diff='hard']").click()
    await page.locator("#startGameBtn").click()

    # Confirm the click fired the transition; if not, invoke startGame() directly.
    try:
        await page.wait_for_function(
            "() => document.getElementById('dashboardPage')?.classList.contains('page-exit')",
            timeout=2000,
        )
    except Exception:
        await page.evaluate("() => { if (typeof startGame === 'function') startGame(); }")

    # Game page can take a bit to load; don't wait for full "load".
    await page.wait_for_url("**/game", wait_until="domcontentloaded", timeout=45000)
    await page.wait_for_selector("#gameCanvas", state="visible", timeout=30000)


async def get_game_state(page: Page) -> Dict[str, Any]:
    return await page.evaluate(
        """() => {
  const livesVal = typeof lives !== 'undefined' ? lives : null;
  const healthVal = (typeof player !== 'undefined' && player) ? player.health : null;
  const scoreVal = (typeof player !== 'undefined' && player) ? player.score : null;
  const waveVal = typeof wave !== 'undefined' ? wave : null;
  const enemiesLen = (typeof enemies !== 'undefined' && enemies) ? enemies.length : null;
  const running = typeof gameRunning !== 'undefined' ? gameRunning : null;
  const auto = typeof autoFire !== 'undefined' ? autoFire : null;
  const canvas = document.getElementById('gameCanvas');
  const w = canvas ? canvas.width : null;
  const h = canvas ? canvas.height : null;
  const pX = (typeof player !== 'undefined' && player) ? player.x : null;
  const pY = (typeof player !== 'undefined' && player) ? player.y : null;
  let target = null;
  if (typeof enemies !== 'undefined' && enemies && enemies.length) {
    // pick closest-to-player by y (largest y)
    let best = enemies[0];
    for (const e of enemies) {
      if (e.y > best.y) best = e;
    }
    target = { x: best.x, y: best.y, size: best.size };
  }
  const overlayVisible = document.getElementById('gameOverOverlay')?.classList.contains('visible') || false;
  return { lives: livesVal, health: healthVal, score: scoreVal, wave: waveVal, enemies: enemiesLen, running, autoFire: auto, canvasW: w, canvasH: h, playerX: pX, playerY: pY, target, overlayVisible };
}"""
    )


async def ensure_autofire_on(page: Page) -> None:
    btn = page.locator("#autoFireBtn")
    await btn.wait_for(state="visible", timeout=10000)
    txt = (await btn.inner_text()).strip()
    if "OFF" in txt:
        await btn.click()
    await page.wait_for_function("() => (typeof autoFire !== 'undefined') && autoFire === true", timeout=5000)


async def nudge_towards_target(page: Page, target_x: float, max_hold_ms: int = 120) -> None:
    state = await get_game_state(page)
    px = state.get("playerX")
    if px is None:
        return
    dx = target_x - px
    if abs(dx) < 8:
        return
    key = "ArrowRight" if dx > 0 else "ArrowLeft"
    await page.keyboard.down(key)
    await page.wait_for_timeout(max_hold_ms)
    await page.keyboard.up(key)


async def force_game_over(page: Page, timeout_s: int = 90) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    start = time.time()
    pre = await get_game_state(page)
    last_health = pre.get("health")
    last_lives = pre.get("lives")
    last_progress_t = time.time()

    while True:
        state = await get_game_state(page)
        if state.get("overlayVisible"):
            return pre, state

        # Progress check: if we haven't lost health/lives in a while, be more aggressive.
        health = state.get("health")
        lives_val = state.get("lives")
        if health != last_health or lives_val != last_lives:
            last_health = health
            last_lives = lives_val
            last_progress_t = time.time()

        tgt = state.get("target")
        if tgt and state.get("running"):
            # Minimal movement: align x under the lowest asteroid.
            await nudge_towards_target(page, tgt["x"])

            # If we're really stuck, directly snap X (still waits for natural collision on next frame).
            if time.time() - last_progress_t > 10:
                await page.evaluate(
                    """(x) => { if (typeof player !== 'undefined' && player) { player.x = x; } }""",
                    tgt["x"],
                )
                last_progress_t = time.time()

        # Enable auto-fire per the prompt (helps clear screen, but mostly for parity with manual play).
        if state.get("autoFire") is False:
            await ensure_autofire_on(page)

        if time.time() - start > timeout_s:
            raise TimeoutError(f"Timed out waiting for game over after {timeout_s}s. Last state: {state}")

        await page.wait_for_timeout(150)


async def click_play_again(page: Page) -> None:
    overlay = page.locator("#gameOverOverlay")
    await overlay.wait_for(state="visible", timeout=30000)
    await page.locator("#gameOverOverlay button.btn.btn-primary").click()
    await page.wait_for_function(
        "() => !document.getElementById('gameOverOverlay')?.classList.contains('visible')",
        timeout=15000,
    )


async def assert_game_reset(page: Page, expect_lives: int) -> Dict[str, Any]:
    await page.wait_for_function(
        f"() => typeof lives !== 'undefined' && lives === {int(expect_lives)} && typeof wave !== 'undefined' && wave === 1 && typeof player !== 'undefined' && player && player.health === 100 && player.score === 0",
        timeout=15000,
    )

    # Enemies should start spawning again shortly.
    await page.wait_for_function("() => typeof enemies !== 'undefined' && enemies && enemies.length > 0", timeout=7000)
    return await get_game_state(page)


async def back_to_dashboard(page: Page) -> None:
    await page.locator("#backBtn").click()
    await page.wait_for_url("**/dashboard", timeout=20000)
    await page.wait_for_selector("#dashboardPage", state="visible", timeout=10000)


async def leaderboard_toggle_repeatedly(page: Page, times: int = 4) -> List[bool]:
    panel = page.locator("#leaderboardPanel")
    btn = page.locator("#toggleLbBtn")
    await btn.wait_for(state="visible", timeout=10000)

    vis: List[bool] = []
    for _ in range(times):
        await btn.click()
        await page.wait_for_timeout(250)
        is_visible = await panel.evaluate("el => el.classList.contains('visible')")
        vis.append(bool(is_visible))
    return vis


def summarize_logs(console: List[ConsoleEntry], net_failures: List[NetworkFailure], http_errors: List[HttpError]) -> Dict[str, Any]:
    console_errors = [c for c in console if c.type in {"error"}]
    console_warnings = [c for c in console if c.type in {"warning"}]
    return {
        "console_error_count": len(console_errors),
        "console_warning_count": len(console_warnings),
        "network_failure_count": len(net_failures),
        "http_error_count": len(http_errors),
        "console_errors": [asdict(c) for c in console_errors[:50]],
        "console_warnings": [asdict(c) for c in console_warnings[:50]],
        "network_failures": [asdict(n) for n in net_failures[:50]],
        "http_errors": [asdict(h) for h in http_errors[:50]],
    }


async def main() -> None:
    console: List[ConsoleEntry] = []
    net_failures: List[NetworkFailure] = []
    http_errors: List[HttpError] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await context.new_page()
        await attach_observers(page, console, net_failures, http_errors)

        await login(page, username="test_pilot", password="anything")
        await dashboard_launch_game_hard(page)

        # Hard mode should be 1 life; confirm after first reset later too.
        await ensure_autofire_on(page)

        # Drive to game over, then restart twice to verify repeatability.
        pre1, over1 = await force_game_over(page, timeout_s=90)
        await click_play_again(page)
        reset1 = await assert_game_reset(page, expect_lives=1)

        pre2, over2 = await force_game_over(page, timeout_s=90)
        await click_play_again(page)
        reset2 = await assert_game_reset(page, expect_lives=1)

        await back_to_dashboard(page)
        lb_vis = await leaderboard_toggle_repeatedly(page, times=6)

        report = {
            "steps": {
                "game_over_1": {"pre": pre1, "over": over1},
                "after_play_again_1": reset1,
                "game_over_2": {"pre": pre2, "over": over2},
                "after_play_again_2": reset2,
                "leaderboard_visibility_sequence": lb_vis,
            },
            "errors": summarize_logs(console, net_failures, http_errors),
        }

        print(json.dumps(report, indent=2))
        await context.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

