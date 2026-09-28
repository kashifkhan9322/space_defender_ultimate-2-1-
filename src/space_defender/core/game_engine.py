
# game_engine.py
import random
import math
import time
from enum import Enum

class GameDifficulty(Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"

class EnemyType:
    def __init__(self, name, color, size, speed, health, points, shape):
        self.name = name
        self.color = color
        self.size = size
        self.speed = speed
        self.health = health
        self.points = points
        self.shape = shape

class SpaceDefenderGame:
    def __init__(self, difficulty="medium", player_name="Player"):
        self.player = {
            "name": player_name,
            "x": 400,
            "y": 500,
            "health": 100,
            "max_health": 100,
            "score": 0,
            "level": 1
        }
       
        self.enemies = []
        self.bullets = []
        self.powerups = []
        self.game_over = False
        self.difficulty = difficulty
        self.wave_number = 1
        self.wave_progress = 0
        self.wave_needed = 10
        self.combo = 1
        self.max_combo = 0
        self.last_kill_time = 0
        self.total_kills = 0
        self.headshots = 0
        self.start_time = time.time()
       
        # Enemy types
        self.enemy_types = {
            "scout": EnemyType("Scout", "#44ff44", 15, 2, 1, 10, "circle"),
            "fighter": EnemyType("Fighter", "#ffaa00", 20, 1.5, 2, 20, "triangle"),
            "battleship": EnemyType("Battleship", "#ff4444", 30, 0.8, 3, 50, "square"),
            "asteroid": EnemyType("Asteroid", "#888888", 25, 1.2, 2, 15, "asteroid")
        }
       
    def move_player(self, direction):
        if direction == "left" and self.player["x"] > 30:
            self.player["x"] -= 10
        elif direction == "right" and self.player["x"] < 770:
            self.player["x"] += 10
           
    def shoot(self):
        self.bullets.append({
            "x": self.player["x"],
            "y": self.player["y"],
            "damage": 1,
            "speed": 10,
            "active": True
        })
       
    def spawn_enemy(self):
        spawn_rates = {"easy": 0.03, "medium": 0.05, "hard": 0.07}
        rate = spawn_rates.get(self.difficulty, 0.05)
       
        if random.random() < rate:
            # Choose enemy type based on wave
            if self.wave_number < 3:
                enemy_type = self.enemy_types["scout"]
            elif self.wave_number < 6:
                enemy_type = random.choice([self.enemy_types["scout"], self.enemy_types["fighter"]])
            else:
                enemy_type = random.choice(list(self.enemy_types.values()))
           
            self.enemies.append({
                "x": random.randint(50, 750),
                "y": 0,
                "type": enemy_type,
                "health": enemy_type.health,
                "max_health": enemy_type.health,
                "speed": enemy_type.speed
            })
            self.wave_progress += 1
           
    def update(self):
        if self.game_over:
            return self.get_state()
       
        current_time = time.time()
       
        # Update bullets
        for bullet in self.bullets[:]:
            bullet["y"] -= bullet["speed"]
            if bullet["y"] < 0:
                self.bullets.remove(bullet)
       
        # Update enemies
        for enemy in self.enemies[:]:
            enemy["y"] += enemy["speed"]
            if enemy["y"] > 600:
                self.enemies.remove(enemy)
                self.player["health"] -= 10
                self.combo = 1
       
        # Check collisions
        for bullet in self.bullets[:]:
            for enemy in self.enemies[:]:
                distance = math.sqrt(
                    (bullet["x"] - enemy["x"])**2 +
                    (bullet["y"] - enemy["y"])**2
                )
                if distance < enemy["type"].size:
                    # Check headshot
                    is_headshot = abs(bullet["y"] - enemy["y"]) < 5
                   
                    # Apply damage
                    enemy["health"] -= 1
                   
                    # Remove bullet
                    if bullet in self.bullets:
                        self.bullets.remove(bullet)
                   
                    # Check if enemy died
                    if enemy["health"] <= 0:
                        # Update combo
                        if current_time - self.last_kill_time < 2.0:
                            self.combo = min(self.combo + 0.25, 4.0)
                        else:
                            self.combo = 1.0
                       
                        self.last_kill_time = current_time
                        self.max_combo = max(self.max_combo, self.combo)
                       
                        # Calculate score
                        points = enemy["type"].points * self.combo
                        if is_headshot:
                            points *= 2
                            self.headshots += 1
                       
                        self.player["score"] += int(points)
                        self.total_kills += 1
                       
                        # Remove enemy
                        self.enemies.remove(enemy)
                       
                        # Chance to spawn powerup
                        if random.random() < 0.1:
                            self.powerups.append({
                                "x": enemy["x"],
                                "y": enemy["y"],
                                "type": "health",
                                "color": "#00ff00"
                            })
                    break
       
        # Check powerup collection
        for powerup in self.powerups[:]:
            powerup["y"] += 2
            distance = math.sqrt(
                (powerup["x"] - self.player["x"])**2 +
                (powerup["y"] - self.player["y"])**2
            )
            if distance < 30:
                self.player["health"] = min(self.player["health"] + 20, self.player["max_health"])
                self.powerups.remove(powerup)
            elif powerup["y"] > 600:
                self.powerups.remove(powerup)
       
        # Spawn new enemies
        self.spawn_enemy()
       
        # Wave progression
        if self.wave_progress >= self.wave_needed:
            self.wave_number += 1
            self.wave_progress = 0
            self.wave_needed = 10 + (self.wave_number * 2)
       
        # Check game over
        if self.player["health"] <= 0:
            self.game_over = True
       
        return self.get_state()
   
    def get_state(self):
        return {
            "player": self.player,
            "enemies": [{
                "x": e["x"],
                "y": e["y"],
                "type": {
                    "name": e["type"].name,
                    "color": e["type"].color,
                    "size": e["type"].size,
                    "shape": e["type"].shape
                },
                "health": e["health"],
                "max_health": e["max_health"]
            } for e in self.enemies],
            "bullets": self.bullets,
            "powerups": self.powerups,
            "game_over": self.game_over,
            "wave": self.wave_number,
            "wave_progress": self.wave_progress,
            "wave_needed": self.wave_needed,
            "combo": self.combo,
            "stats": {
                "total_kills": self.total_kills,
                "headshots": self.headshots,
                "max_combo": self.max_combo
            },
            "time_played": int(time.time() - self.start_time)
        }