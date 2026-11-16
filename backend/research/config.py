"""Shared config: reads the repo .env.local (same file the Next.js app uses)."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env.local", override=False)
except Exception:
    pass


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


AI_BASE_URL = (env("AI_BASE_URL", "https://opencode.ai/inference/go/openai/v1")).rstrip("/")
if "/zen/go" in AI_BASE_URL:
    AI_BASE_URL = "https://opencode.ai/inference/go/openai/v1"
AI_API_KEY = env("AI_API_KEY")
AI_MODEL = env("AI_MODEL") if env("AI_MODEL") not in ("", "opencode-default") else "glm-5.3-flash"

ALPACA_KEY = env("ALPACA_API_KEY")
ALPACA_SECRET = env("ALPACA_SECRET_KEY")
ALPACA_BASE = (env("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")).rstrip("/")
if "api.alpaca.markets" in ALPACA_BASE and "paper" not in ALPACA_BASE:
    raise RuntimeError("Refusing to run against a live Alpaca host (paper only).")

FRED_KEY = env("FRED_KEY")
EXA_API_KEY = env("EXA_API_KEY")
DB_PATH = env("RESEARCH_DB", str(Path(__file__).resolve().parent.parent / "research.db"))
