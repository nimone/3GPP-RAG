import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from threegpp_rag.crag.graph import deps_from_env, run_crag       # noqa: E402
from threegpp_rag.generate import REFUSAL, answer                 # noqa: E402

def score_row(row: dict, result: dict) -> dict:
    refused = result["refused"] or REFUSAL in result["answer"]
    want_refusal = row["expected"] == "REFUSE"
    if want_refusal:
        return {"correct": refused, "hallucinated": not refused,
                "false_refusal": False, "citation_ok": True}
    hit = row["expected"].lower() in result["answer"].lower()
    citation_ok = ("citation" not in row) or (row["citation"] in result["answer"]) \
        or (row["citation"] in result.get("citations", []))
    return {"correct": hit and not refused, "hallucinated": False,
            "false_refusal": refused, "citation_ok": citation_ok}

def main() -> None:
    rows = [json.loads(l) for l in Path("eval/data/qa.jsonl").read_text().splitlines() if l.strip()]
    results = []
    for row in rows:
        state = run_crag(row["query"], deps_from_env())
        text = answer(row["query"], state["context"])
        result = {"answer": text, "refused": state["refused"],
                  "citations": [c.citation for c in state.get("chunks", [])]}
        s = score_row(row, result)
        results.append({**row, **s, "action": state["action"]})
        mark = "PASS" if s["correct"] else "FAIL"
        print(f"[{mark}] {row['query'][:60]:60s} action={state['action']}")

    in_scope = [r for r in results if r["expected"] != "REFUSE"]
    out_scope = [r for r in results if r["expected"] == "REFUSE"]
    pct = lambda n, d: f"{100 * n / d:.0f}%" if d else "n/a"

    print("\n" + "=" * 58)
    print(f"Answer accuracy (in-scope)   {pct(sum(r['correct'] for r in in_scope), len(in_scope))}")
    print(f"Citation validity            {pct(sum(r['citation_ok'] for r in in_scope), len(in_scope))}")
    print(f"Refusal rate (out-of-scope)  {pct(sum(r['correct'] for r in out_scope), len(out_scope))}")
    print(f"False-refusal rate           {pct(sum(r['false_refusal'] for r in in_scope), len(in_scope))}")
    print(f"Hallucination rate           {pct(sum(r['hallucinated'] for r in out_scope), len(out_scope))}")
    print("=" * 58)
    Path("eval/results.json").write_text(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
