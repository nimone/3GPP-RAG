import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from threegpp_rag.crag.graph import deps_from_env, run_crag       # noqa: E402
from threegpp_rag.generate import REFUSAL, answer                 # noqa: E402
from threegpp_rag.retrieval import retrieve                       # noqa: E402

def main() -> None:
    rows = [json.loads(l) for l in Path("eval/data/qa.jsonl").read_text().splitlines() if l.strip()]
    crag_hits = rag_hits = 0

    for row in rows:
        want_refusal = row["expected"] == "REFUSE"

        state = run_crag(row["query"], deps_from_env())
        crag_ans = answer(row["query"], state["context"])

        # Vanilla RAG: same retrieval, no grading, no gate — always answers.
        plain_ctx = "\n\n".join(f"[{c.citation}] {c.text}" for c in retrieve(row["query"]))
        rag_ans = answer(row["query"], plain_ctx)

        crag_ok = state["refused"] if want_refusal else row["expected"].lower() in crag_ans.lower()
        rag_ok = (REFUSAL in rag_ans) if want_refusal else row["expected"].lower() in rag_ans.lower()
        crag_hits += crag_ok
        rag_hits += rag_ok
        print(f"Q: {row['query'][:55]}\n  CRAG[{state['action']}] {'ok' if crag_ok else 'MISS'}"
              f" | RAG {'ok' if rag_ok else 'MISS'}")

    n = len(rows)
    print(f"\nCRAG {crag_hits}/{n}   vanilla RAG {rag_hits}/{n}")

if __name__ == "__main__":
    main()
