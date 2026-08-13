from typing import Any
import psycopg
from psycopg.rows import dict_row
from threegpp_rag.config import get_settings

def to_pgvector(v: list[float]) -> str:
    return "[" + ",".join(str(x) for x in v) + "]"

def connect() -> psycopg.Connection:
    # Use Neon's pooled endpoint (-pooler host) to avoid exhausting connections.
    return psycopg.connect(get_settings().db_url, row_factory=dict_row)

def query(sql: str, params: tuple[Any, ...] = ()) -> list[dict]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []
