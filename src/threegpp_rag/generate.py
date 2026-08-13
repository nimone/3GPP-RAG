from google import genai
from threegpp_rag.config import get_settings

REFUSAL = "Not found in the provided 3GPP specifications."

PROMPT = """You are a 3GPP standards assistant for telecom network operations.

Answer the QUESTION using ONLY the CONTEXT below. The context is extracted from
3GPP specification documents.

Rules:
1. Use ONLY facts stated in the CONTEXT. Do not infer, extrapolate, or use prior
   knowledge of 3GPP or telecoms.
2. Cite the source for every claim, using the bracketed tag shown in the context,
   for example: TS 28.111 §4.1
3. The context is extracted clauses, requirement rows and table fragments, not
   prose written to answer the question. Synthesise your answer from whatever it
   states — a requirement, a table row or a schema field is a valid basis for an
   answer. Partial information is worth reporting; say what the context states.
4. Reply with exactly this sentence, and nothing else, ONLY when the context says
   nothing relevant to the question at all:
   {refusal}
5. Do not apologise or explain what you cannot do. Answer, or give the exact
   refusal sentence.

CONTEXT:
{context}

QUESTION: {question}

ANSWER:"""

_GENAI_CLIENT: genai.Client | None = None

def _client() -> genai.Client:
    global _GENAI_CLIENT
    if _GENAI_CLIENT is None:
        _GENAI_CLIENT = genai.Client(api_key=get_settings().gemini_api_key)
    return _GENAI_CLIENT

def build_prompt(question: str, context: str) -> str:
    return PROMPT.format(refusal=REFUSAL, context=context, question=question)

def answer(question: str, context: str) -> str:
    # Empty context means retrieval rejected everything — refuse without a model call.
    if not context.strip():
        return REFUSAL
    resp = _client().models.generate_content(
        model=get_settings().gemini_model,
        contents=build_prompt(question, context),
    )
    return (resp.text or REFUSAL).strip()

def rewrite_query(q: str) -> str:
    """Rewrite question as keyword search for a second retrieval pass."""
    resp = _client().models.generate_content(
        model=get_settings().gemini_model,
        contents=(
            "Rewrite this question as a short keyword search query for 3GPP "
            "specification documents. Use technical terms likely to appear "
            "verbatim in the specs. Return ONLY the query.\n\n"
            f"Question: {q}"
        ),
    )
    return (resp.text or q).strip()

def check_model() -> bool:
    """Verify GEMINI_MODEL exists — fail loudly at startup."""
    try:
        want = get_settings().gemini_model
        client = _client()
        # force eager evaluation before client could be GC'd
        names = [m.name.split("/")[-1] for m in list(client.models.list())]
        return want in names or want.split("/")[-1] in names
    except Exception:
        return False
