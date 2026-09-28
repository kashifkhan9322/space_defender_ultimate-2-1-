from flask import Blueprint, request, jsonify
from ..models import db, Player, GameSession, Leaderboard
from ..core.game_engine import SpaceDefenderGame
from datetime import datetime

api_bp = Blueprint('api', __name__)

@api_bp.route('/player/register', methods=['POST'])
def register_player():
    data = request.json
    username = data.get('username')
    
    existing = Player.query.filter_by(username=username).first()
    if existing:
        return jsonify({'success': False, 'error': 'Username exists'})
    
    player = Player(username=username)
    db.session.add(player)
    db.session.commit()
    
    return jsonify({'success': True, 'player': player.to_dict()})

@api_bp.route('/player/login', methods=['POST'])
def login_player():
    data = request.json
    username = data.get('username')
    
    player = Player.query.filter_by(username=username).first()
    if player:
        return jsonify({'success': True, 'player': player.to_dict()})
    return jsonify({'success': False, 'error': 'Player not found'})

@api_bp.route('/game/start', methods=['POST'])
def start_game():
    data = request.json
    player_id = data.get('player_id')
    difficulty = data.get('difficulty', 'medium')
    
    game_session = GameSession(
        player_id=player_id,
        difficulty=difficulty
    )
    db.session.add(game_session)
    db.session.commit()

    player = Player.query.get(player_id)
    game = SpaceDefenderGame(difficulty, player.username if player else "Player")
    
    return jsonify({
        'success': True,
        'game_id': game_session.id,
        'game_state': game.get_state()
    })

@api_bp.route('/game/update', methods=['POST'])
def update_game():
    data = request.json
    game_state = data.get('game_state')
    game_id = data.get('game_id')

    if not game_id:
        return jsonify({'success': False, 'error': 'Missing game_id'}), 400
    if not game_state:
        return jsonify({'success': False, 'error': 'Missing game_state'}), 400

    game_session = GameSession.query.get(game_id)
    if not game_session:
        return jsonify({'success': False, 'error': 'Game session not found'}), 404

    # Persist only the pieces the server owns (avoid trusting client for player_id, difficulty, etc.)
    game_session.score = int(((game_state.get('player') or {}).get('score', 0)) or 0)
    game_session.wave_reached = int((game_state.get('wave', 0)) or 0)
    stats = game_state.get('stats') or {}
    game_session.kills = int((stats.get('total_kills', 0)) or 0)
    game_session.headshots = int((stats.get('headshots', 0)) or 0)
    game_session.max_combo_achieved = int((stats.get('max_combo', 0)) or 0)
    game_session.play_time = int((game_state.get('time_played', 0)) or 0)
    db.session.commit()

    return jsonify({'success': True})

@api_bp.route('/game/end', methods=['POST'])
def end_game():
    data = request.json or {}
    game_id = data.get('game_id')

    if not game_id:
        return jsonify({'success': False, 'error': 'Missing game_id'}), 400

    game_session = GameSession.query.get(game_id)
    if not game_session:
        return jsonify({'success': False, 'error': 'Game session not found'}), 404

    # Idempotency: if already ended, do nothing.
    if not game_session.end_time:
        game_session.end_time = datetime.utcnow()

        player = Player.query.get(game_session.player_id)
        if player:
            current_score = int(game_session.score or 0)
            player.total_score = int(player.total_score or 0) + current_score
            player.total_games = int(player.total_games or 0) + 1
            player.total_kills = int(player.total_kills or 0) + int(game_session.kills or 0)
            player.total_headshots = int(player.total_headshots or 0) + int(game_session.headshots or 0)
            player.max_combo = max(int(player.max_combo or 0), int(game_session.max_combo_achieved or 0))
            player.max_wave = max(int(player.max_wave or 0), int(game_session.wave_reached or 0))
            player.high_score = max(int(player.high_score or 0), current_score)

            leaderboard = Leaderboard(
                player_id=player.id,
                player_name=player.username,
                score=current_score,
                wave=int(game_session.wave_reached or 0),
                difficulty=game_session.difficulty
            )
            db.session.add(leaderboard)

        db.session.commit()

    return jsonify({'success': True})

@api_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    entries = Leaderboard.query.order_by(Leaderboard.score.desc()).limit(10).all()
    
    result = []
    for entry in entries:
        result.append({
            'player_name': entry.player_name,
            'score': entry.score,
            'wave': entry.wave,
            'difficulty': entry.difficulty
        })
    
    return jsonify(result)
