"""Use the project Python environment for backend formatting in pre-commit hooks."""

import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
local_python = (
    root
    / "Backend"
    / "venv"
    / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
)
python = str(local_python) if local_python.exists() else sys.executable
files = sys.argv[1:]
if files:
    subprocess.run([python, "-m", "ruff", "check", "--fix", *files], check=True)
    subprocess.run([python, "-m", "ruff", "format", *files], check=True)
