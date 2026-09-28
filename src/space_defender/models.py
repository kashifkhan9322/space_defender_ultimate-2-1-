from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class Player(db.Model):
    __tablename__ = 'players'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Stats
    total_score = db.Column(db.Integer, default=0)
    total_games = db.Column(db.Integer, default=0)
    total_kills = db.Column(db.Integer, default=0)
    total_headshots = db.Column(db.Integer, default=0)
    max_combo = db.Column(db.Integer, default=0)
    max_wave = db.Column(db.Integer, default=0)
    high_score = db.Column(db.Integer, default=0)
    
    # Achievements
    achievements = db.Column(db.Text, default='[]')
    
    # Relationships
    game_sessions = db.relationship('GameSession', backref='player', lazy=True)
    
    def get_achievements(self):
        try:
            return json.loads(self.achievements)
        except:
            return []
    
    def add_achievement(self, achievement_id):
        achievements = self.get_achievements()
        if achievement_id not in achievements:
            achievements.append(achievement_id)
            self.achievements = json.dumps(achievements)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'total_score': self.total_score,
            'total_games': self.total_games,
            'total_kills': self.total_kills,
            'total_headshots': self.total_headshots,
            'max_combo': self.max_combo,
            'max_wave': self.max_wave,
            'high_score': self.high_score,
            'achievements': self.get_achievements()
        }

class GameSession(db.Model):
    __tablename__ = 'game_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey('players.id'), nullable=False)
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime)
    
    # Game stats
    score = db.Column(db.Integer, default=0)
    wave_reached = db.Column(db.Integer, default=0)
    kills = db.Column(db.Integer, default=0)
    headshots = db.Column(db.Integer, default=0)
    perfect_kills = db.Column(db.Integer, default=0)
    boss_kills = db.Column(db.Integer, default=0)
    powerups_collected = db.Column(db.Integer, default=0)
    max_combo_achieved = db.Column(db.Integer, default=0)
    play_time = db.Column(db.Integer, default=0)
    difficulty = db.Column(db.String(20), default='medium')
    
    def to_dict(self):
        return {
            'id': self.id,
            'score': self.score,
            'wave_reached': self.wave_reached,
            'kills': self.kills,
            'headshots': self.headshots,
            'max_combo': self.max_combo_achieved,
            'play_time': self.play_time,
            'difficulty': self.difficulty
        }

class Leaderboard(db.Model):
    __tablename__ = 'leaderboard'
    
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey('players.id'))
    player_name = db.Column(db.String(50))
    score = db.Column(db.Integer)
    wave = db.Column(db.Integer)
    difficulty = db.Column(db.String(20))
    achieved_at = db.Column(db.DateTime, default=datetime.utcnow)
