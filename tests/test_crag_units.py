from threegpp_rag.crag.action import decide_action
from threegpp_rag.crag.decompose import recompose, split_into_strips

def test_decide_action_thresholds():
    assert decide_action([0.9, 0.2], upper=0.55, lower=0.30) == "correct"
    assert decide_action([0.40], upper=0.55, lower=0.30) == "ambiguous"
    assert decide_action([0.10], upper=0.55, lower=0.30) == "incorrect"

def test_decide_action_empty_scores_is_incorrect():
    assert decide_action([], upper=0.55, lower=0.30) == "incorrect"

def test_decide_action_uses_max_not_mean():
    assert decide_action([0.9, 0.01, 0.01], upper=0.55, lower=0.30) == "correct"

def test_split_preserves_decimals_and_spec_numbers():
    strips = split_into_strips("See TS 28.552 clause 5.1. The value is 1.5 dB. Done.")
    assert any("28.552" in s for s in strips)
    assert any("1.5 dB" in s for s in strips)
    assert len(strips) == 3

def test_split_keeps_table_rows_whole():
    strips = split_into_strips("| alarmId | Identifies the alarm. |")
    assert strips == ["| alarmId | Identifies the alarm. |"]

def test_recompose_drops_low_scoring_strips():
    def scorer(query, docs):
        return [0.9 if "alarm" in d else 0.05 for d in docs]
    out = recompose("alarms", "An alarm was raised. The sky is blue.", scorer, 0.25)
    assert "alarm was raised" in out
    assert "sky is blue" not in out

def test_recompose_empty_text_returns_empty():
    assert recompose("q", "", lambda q, d: [], 0.25) == ""
