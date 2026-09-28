from flask import Flask
from flask_cors import CORS
from .models import db
from .config import Config
import os

def create_app(config_class=Config):
    # Point static and templates to project root, not the package dir
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    app = Flask(__name__, 
                static_folder=os.path.join(root_dir, 'static'),
                template_folder=os.path.join(root_dir, 'templates'))
    app.config.from_object(config_class)

    # Initialize extensions
    CORS(app)
    db.init_app(app)

    # Register blueprints
    from .api import api_bp
    from .web import web_bp
    
    app.register_blueprint(api_bp, url_prefix='/api')
    app.register_blueprint(web_bp)

    # Create tables
    with app.app_context():
        db.create_all()

    return app
