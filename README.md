# Space Defender Ultimate

A professional implementation of the Space Defender game.

## Project Structure

- `src/space_defender/`: Main package
  - `api/`: API endpoints and blueprints
  - `core/`: Core game engine logic
  - `web/`: Web routes and frontend logic
  - `static/`: Frontend assets (CSS, JS, Images)
  - `templates/`: HTML templates
- `run.py`: Entry point for the application
- `run.bat`: Windows startup script
- `requirements.txt`: Project dependencies
- `pyproject.toml`: Project metadata

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configuration:
   Create a `.env` file based on `.env.example`.

## Running the Game

Simply run:
```bash
python run.py
```
Or on Windows, double-click `run.bat`.
