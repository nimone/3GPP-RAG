import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from threegpp_rag.app import app  # noqa: E402

# Vercel's Python runtime discovers the ASGI callable named `app`.
