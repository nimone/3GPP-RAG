import logging
from typing import Iterator
from google import genai
from threegpp_rag.config import get_settings

logger = logging.getLogger(__name__)

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
    settings = get_settings()
    client = _client()
    contents = build_prompt(question, context)
    try:
        resp = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
        )
        return (resp.text or REFUSAL).strip()
    except Exception as e:
        fallback = settings.gemini_fallback_model
        if fallback and fallback != settings.gemini_model:
            logger.warning(
                "Primary model %s failed (%s), attempting fallback to %s",
                settings.gemini_model, e, fallback,
            )
            try:
                resp = client.models.generate_content(
                    model=fallback,
                    contents=contents,
                )
                return (resp.text or REFUSAL).strip()
            except Exception as fe:
                logger.error("Fallback model %s also failed: %s", fallback, fe)
                raise fe from e
        raise e

def answer_stream(question: str, context: str) -> Iterator[str]:
    """Yield answer text chunks as they are generated."""
    if not context.strip():
        yield REFUSAL
        return
    settings = get_settings()
    client = _client()
    contents = build_prompt(question, context)
    try:
        resp_stream = client.models.generate_content_stream(
            model=settings.gemini_model,
            contents=contents,
        )
        for chunk in resp_stream:
            if chunk.text:
                yield chunk.text
        return
    except Exception as e:
        fallback = settings.gemini_fallback_model
        if fallback and fallback != settings.gemini_model:
            logger.warning(
                "Primary model %s stream failed (%s), attempting fallback stream to %s",
                settings.gemini_model, e, fallback,
            )
            try:
                resp_stream = client.models.generate_content_stream(
                    model=fallback,
                    contents=contents,
                )
                for chunk in resp_stream:
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as fe:
                logger.warning("Fallback stream failed (%s), falling back to non-stream answer", fe)
        # Fallback to non-streaming if stream is unsupported
        yield answer(question, context)

def rewrite_query(q: str) -> str:
    """Rewrite question as keyword search for a second retrieval pass."""
    settings = get_settings()
    client = _client()
    contents = (
        "Rewrite this question as a short keyword search query for 3GPP "
        "specification documents. Use technical terms likely to appear "
        "verbatim in the specs. Return ONLY the query.\n\n"
        f"Question: {q}"
    )
    try:
        resp = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
        )
        return (resp.text or q).strip()
    except Exception as e:
        fallback = settings.gemini_fallback_model
        if fallback and fallback != settings.gemini_model:
            logger.warning(
                "Primary model %s query rewrite failed (%s), attempting fallback to %s",
                settings.gemini_model, e, fallback,
            )
            try:
                resp = client.models.generate_content(
                    model=fallback,
                    contents=contents,
                )
                return (resp.text or q).strip()
            except Exception:
                return q
        return q

def check_model() -> bool:
    """Verify GEMINI_MODEL or fallback model exists — fail loudly at startup."""
    try:
        settings = get_settings()
        want = settings.gemini_model
        fallback = settings.gemini_fallback_model
        client = _client()
        # force eager evaluation before client could be GC'd
        names = [m.name.split("/")[-1] for m in list(client.models.list())]
        primary_ok = want in names or want.split("/")[-1] in names
        fallback_ok = fallback in names or fallback.split("/")[-1] in names
        return primary_ok or fallback_ok
    except Exception:
        return False
