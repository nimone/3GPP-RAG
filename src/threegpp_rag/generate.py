from typing import Iterator
from google import genai
from threegpp_rag.config import get_settings

REFUSAL = "Not found in the provided 3GPP specifications."

PROMPT = """You are a 3GPP standards technical assistant for telecom network operations.

Answer the user QUESTION using ONLY facts stated in the CONTEXT below. The context is extracted from
3GPP specification documents.

Rules:
1. Use ONLY facts stated in the CONTEXT. Do not infer, extrapolate, or use external knowledge of 3GPP or telecoms.
2. Cite the source for every claim, using the bracketed tag shown in the context, for example: TS 28.111 §4.1
3. Provide a thorough, detailed, and well-structured answer:
   - Explain the core concept, function, or mechanism clearly based on the context.
   - Break down specific types, attributes, operations, schemas, conditions, and requirements into organized bullet points.
   - Synthesise all relevant information present in the extracted clauses rather than giving a brief one-line summary.
4. Reply with exactly this sentence, and nothing else, ONLY when the context has no relevant information at all:
   {refusal}
5. Do not apologise or add meta-commentary. Answer thoroughly using the context, or give the exact refusal sentence.

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

def answer_stream(question: str, context: str) -> Iterator[str]:
    """Yield answer text chunks as they are generated."""
    if not context.strip():
        yield REFUSAL
        return
    try:
        resp_stream = _client().models.generate_content_stream(
            model=get_settings().gemini_model,
            contents=build_prompt(question, context),
        )
        for chunk in resp_stream:
            if chunk.text:
                yield chunk.text
    except Exception:
        # Fallback to non-streaming if stream is unsupported
        yield answer(question, context)

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
