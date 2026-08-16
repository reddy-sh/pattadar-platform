import sys
from pathlib import Path

# Make `src.main` importable when pytest runs from services/api/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
