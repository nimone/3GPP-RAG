from threegpp_rag.generate import REFUSAL, answer, build_prompt

def test_prompt_states_the_grounding_rule_and_citation_format():
    p = build_prompt("What is an alarm?", "[TS 28.111 §4.1] An alarm is a notification.")
    assert "ONLY" in p
    assert "TS 28.111 §4.1" in p
    assert REFUSAL in p
    assert "What is an alarm?" in p

def test_empty_context_refuses_without_calling_the_model():
    assert answer("anything", "") == REFUSAL

def test_whitespace_only_context_refuses():
    assert answer("anything", "   \n  ") == REFUSAL
