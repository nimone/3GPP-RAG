from threegpp_rag.config import get_settings
from threegpp_rag.db import query, to_pgvector
from threegpp_rag.jina import embed
from threegpp_rag.types import Chunk

RRF_K = 60

def rrf_sql() -> str:
    """Dense and sparse arms fused by Reciprocal Rank Fusion.

    RRF combines rankings not raw scores, so cosine distance and ts_rank_cd
    need no calibration. Full outer join keeps docs found by either arm.
    """
    return f"""
    with dense as (
      select id, row_number() over (order by embedding <=> %s::vector) as rank
      from chunks
      order by embedding <=> %s::vector
      limit %s
    ),
    sparse as (
      select id, row_number() over (
        order by ts_rank_cd(tsv, plainto_tsquery('english', %s)) desc
      ) as rank
      from chunks
      where tsv @@ plainto_tsquery('english', %s)
      limit %s
    )
    select c.id, c.text, c.spec, c.clause, c.title,
           coalesce(1.0 / ({RRF_K} + dense.rank), 0.0)
         + coalesce(1.0 / ({RRF_K} + sparse.rank), 0.0) as rrf
    from dense
    full outer join sparse on dense.id = sparse.id
    join chunks c on c.id = coalesce(dense.id, sparse.id)
    order by rrf desc
    limit %s
    """

def rows_to_chunks(rows: list[dict]) -> list[Chunk]:
    return [Chunk(id=r["id"], text=r["text"], spec=r["spec"],
                  clause=r["clause"], title=r["title"]) for r in rows]

def retrieve(q: str, top_k: int | None = None) -> list[Chunk]:
    k = top_k or get_settings().top_k
    vec = to_pgvector(embed([q], "query")[0])
    pool = k * 3
    rows = query(rrf_sql(), (vec, vec, pool, q, q, pool, k))
    return rows_to_chunks(rows)
