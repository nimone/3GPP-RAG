FROM python:3.13-slim
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src/ ./src/
ENV PYTHONPATH=/app/src
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "threegpp_rag.app:app", "--host", "0.0.0.0", "--port", "8000"]
