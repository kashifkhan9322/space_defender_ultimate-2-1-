from flask import Blueprint, render_template

web_bp = Blueprint('web', __name__)


@web_bp.route('/')
@web_bp.route('/login')
def login_page():
    return render_template('pages/login.html')


@web_bp.route('/dashboard')
def dashboard_page():
    return render_template('pages/dashboard.html')


@web_bp.route('/game')
def game_page():
    return render_template('pages/game.html')
