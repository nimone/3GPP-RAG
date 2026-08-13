import os
from dataclasses import dataclass
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()

def _req(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"Missing required env var: {name}")
    return v

def _f(name: str, default: float) -> float:
    return float(os.environ.get(name, default))

@dataclass(frozen=True)
class Settings:
    jina_api_key: str
    gemini_api_key: str
    gemini_model: str
    db_url: str
    upper_threshold: float
    lower_threshold: float
    keep_threshold: float
    top_k: int

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        jina_api_key=_req("JINA_API_KEY"),
        gemini_api_key=_req("GEMINI_API_KEY"),
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        db_url=_req("DB_URL"),
        upper_threshold=_f("CRAG_UPPER", 0.55),
        lower_threshold=_f("CRAG_LOWER", 0.30),
        keep_threshold=_f("CRAG_KEEP", 0.10),   # calibrated on the eval set
        # 12, not 8: gold clauses were ranking 9th-12th on definition questions.
        # Costs ~4s per query in refinement, well inside Vercel's 60s limit.
        top_k=int(os.environ.get("CRAG_TOP_K", 12)),
    )
