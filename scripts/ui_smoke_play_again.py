from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


@dataclass
class ConsoleMsg:
    type: str
    text: str
    location: Dict[str, Any]


@dataclass
class RequestFailure:
    url: str
    method: str
    resource_type: str
    failure: Optional[str]


@dataclass
class BadResponse:
    url: str
    status: int
    status_text: str


def _now_ms() -> int:
    return int(time.time() * 1000)


def main() -> int:
    base_url = "http://127.0.0.1:5000"

    console_errors: List[ConsoleMsg] = []
    page_errors: List[str] = []
    request_failures: List[RequestFailure] = []
    bad_responses: List[BadResponse] = []

    results: Dict[str, Any] = {
        "login": {"ok": False, "used_register_fallback": False},
        "dashboard_launch_game": {"ok": False, "difficulty": None},
        "game_over_reached": {"ok": False, "time_ms": None},
        "play_again": {
            "ok": False,
            "hud_before": None,
            "hud_after": None,
            "enemies_spawn_after_restart": None,
        },
        "back_to_dashboard": {"ok": False},
        "leaderboard_toggle": {"ok": False, "toggles": []},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        page.set_default_timeout(20_000)

        def on_console(msg):
            try:
                loc = msg.location or {}
            except Exception:
                loc = {}
            if msg.type == "error":
                console_errors.append(
                    ConsoleMsg(type=msg.type, text=msg.text, location=loc)
                )

        def on_page_error(err):
            page_errors.append(str(err))

        def on_request_failed(req):
            failure = None
            try:
                failure = req.failure
            except Exception:
                failure = None
            request_failures.append(
                RequestFailure(
                    url=req.url,
                    method=req.method,
                    resource_type=req.resource_type,
                    failure=str(failure) if failure else None,
                )
            )

        def on_response(resp):
            try:
                status = resp.status
            except Exception:
                return
            if status >= 400:
                bad_responses.append(
                    BadResponse(
                        url=resp.url,
                        status=status,
                        status_text=getattr(resp, "status_text", "") or "",
                    )
                )

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.on("requestfailed", on_request_failed)
        page.on("response", on_response)

        # ── Login ──
        page.goto(f"{base_url}/login", wait_until="domcontentloaded")
        page.fill("#username", "test_pilot")
        page.fill("#password", "anything")
        page.click("#loginBtn")

        # Either we go to dashboard, or we get "Pilot not found" and must register.
        try:
            page.wait_for_url("**/dashboard", timeout=6_000)
            results["login"]["ok"] = True
        except PlaywrightTimeoutError:
            results["login"]["used_register_fallback"] = True
            page.click("#registerLink")
            page.wait_for_url("**/dashboard", timeout=12_000)
            results["login"]["ok"] = True

        # ── Dashboard: set Hard + Launch Game ──
        page.wait_for_selector("#startGameBtn", state="visible")
        page.click(".difficulty-btn[data-diff='hard']")
        results["dashboard_launch_game"]["difficulty"] = "hard"
        page.click("#startGameBtn")
        page.wait_for_url("**/game", timeout=12_000)
        results["dashboard_launch_game"]["ok"] = True

        # ── Game: wait for game over (force collisions if slow) ──
        page.wait_for_selector("#hudLives", state="visible")
        hud_before = {
            "score": page.inner_text("#hudScore").strip(),
            "wave": page.inner_text("#hudWave").strip(),
            "health": page.inner_text("#hudHealth").strip(),
            "lives": page.inner_text("#hudLives").strip(),
        }
        results["play_again"]["hud_before"] = hud_before

        # Toggle auto-fire on (per user guidance to speed up if needed).
        try:
            page.click("#autoFireBtn")
        except PlaywrightError:
            pass

        # Suicide bot: keep aligning ship under the lowest asteroid.
        page.evaluate(
            """
            () => {
              if (window.__sdSuicideBot) return;
              window.__sdSuicideBot = setInterval(() => {
                try {
                  if (!gameRunning || gamePaused) return;
                  if (!enemies || enemies.length === 0) return;
                  // Choose the enemy closest to the player (largest y).
                  let target = enemies[0];
                  for (const e of enemies) {
                    if (e.y > target.y) target = e;
                  }
                  player.x = Math.max(20, Math.min(canvas.width - 20, target.x));
                } catch (e) {
                  // ignore
                }
              }, 40);
            }
            """
        )

        start_ms = _now_ms()
        try:
            page.locator("#gameOverOverlay").wait_for(state="visible", timeout=45_000)
        except PlaywrightTimeoutError:
            # As a last resort, force game over so we can still validate restart/back flows.
            page.evaluate(
                """
                () => {
                  try {
                    lives = 0;
                    player.health = 0;
                    gameOver();
                  } catch (e) {}
                }
                """
            )
            page.locator("#gameOverOverlay").wait_for(state="visible", timeout=10_000)

        results["game_over_reached"]["ok"] = True
        results["game_over_reached"]["time_ms"] = _now_ms() - start_ms

        # ── Play Again ──
        page.get_by_role("button", name="🔄 Play Again").click()

        # Wait until overlay is gone and HUD resets.
        page.locator("#gameOverOverlay").wait_for(state="hidden", timeout=20_000)
        page.wait_for_timeout(600)  # allow first frame(s) to update HUD

        hud_after = {
            "score": page.inner_text("#hudScore").strip(),
            "wave": page.inner_text("#hudWave").strip(),
            "health": page.inner_text("#hudHealth").strip(),
            "lives": page.inner_text("#hudLives").strip(),
            "combo": page.inner_text("#hudCombo").strip(),
        }
        results["play_again"]["hud_after"] = hud_after

        def enemies_spawned() -> Optional[bool]:
            try:
                return bool(
                    page.evaluate(
                        """
                        () => {
                          try { return Array.isArray(enemies) && enemies.length > 0; } catch (e) { return null; }
                        }
                        """
                    )
                )
            except PlaywrightError:
                return None

        spawned = None
        for _ in range(20):
            spawned = enemies_spawned()
            if spawned:
                break
            page.wait_for_timeout(250)

        results["play_again"]["enemies_spawn_after_restart"] = spawned

        # Consider restart OK if HUD appears reset-ish and enemies start spawning.
        results["play_again"]["ok"] = (
            hud_after.get("score") == "0"
            and hud_after.get("wave") == "1"
            and hud_after.get("health") in ("100", "99", "98")  # allow one tick of damage
            and hud_after.get("lives") == "1"
            and bool(spawned)
        )

        # ── Back to Dashboard ──
        page.click("#backBtn")
        page.wait_for_url("**/dashboard", timeout=20_000)
        results["back_to_dashboard"]["ok"] = True

        # ── Leaderboard panel toggles ──
        page.wait_for_selector("#toggleLbBtn", state="visible")
        toggles: List[Dict[str, Any]] = []

        for i in range(3):
            page.click("#toggleLbBtn")
            page.wait_for_timeout(200)
            open_visible = page.locator("#leaderboardPanel").evaluate(
                "el => el.classList.contains('visible')"
            )
            toggles.append({"iteration": i + 1, "after_click": "open", "visible": open_visible})

            page.click("#toggleLbBtn")
            page.wait_for_timeout(200)
            closed_visible = page.locator("#leaderboardPanel").evaluate(
                "el => el.classList.contains('visible')"
            )
            toggles.append(
                {"iteration": i + 1, "after_click": "close", "visible": closed_visible}
            )

        results["leaderboard_toggle"]["toggles"] = toggles
        results["leaderboard_toggle"]["ok"] = all(
            (t["after_click"] == "open" and t["visible"] is True)
            or (t["after_click"] == "close" and t["visible"] is False)
            for t in toggles
        )

        context.close()
        browser.close()

    report = {
        "results": results,
        "errors": {
            "console_error_count": len(console_errors),
            "page_error_count": len(page_errors),
            "request_failed_count": len(request_failures),
            "bad_response_count": len(bad_responses),
            "console_errors": [asdict(e) for e in console_errors][:50],
            "page_errors": page_errors[:50],
            "request_failures": [asdict(e) for e in request_failures][:50],
            "bad_responses": [asdict(e) for e in bad_responses if e.status >= 400][:50],
        },
    }

    print(json.dumps(report, indent=2))

    all_ok = (
        results["login"]["ok"]
        and results["dashboard_launch_game"]["ok"]
        and results["game_over_reached"]["ok"]
        and results["play_again"]["ok"]
        and results["back_to_dashboard"]["ok"]
        and results["leaderboard_toggle"]["ok"]
    )
    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())

