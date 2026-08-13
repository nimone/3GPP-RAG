from threegpp_rag.types import CragAction

def decide_action(scores: list[float], upper: float, lower: float) -> CragAction:
    """Route on the single best score.

    Max not mean: one strongly relevant chunk is enough to answer. Averaging
    lets irrelevant chunks veto a correct retrieval.
    """
    top = max(scores) if scores else 0.0
    if top >= upper:
        return "correct"
    if top < lower:
        return "incorrect"
    return "ambiguous"
