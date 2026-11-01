# syntax=docker/dockerfile:1
FROM ghcr.io/astral-sh/uv:0.12.10 AS uv
FROM python:3.13-slim-bookworm AS dependencies
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /service
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM dependencies AS test
RUN uv sync --frozen
COPY scoring ./scoring
COPY tests ./tests
CMD ["uv", "run", "--frozen", "pytest", "-q"]

FROM python:3.13-slim-bookworm AS runtime
WORKDIR /service
ENV PATH="/service/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=dependencies /service/.venv ./.venv
COPY scoring ./scoring
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"
CMD ["uvicorn", "scoring.api:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
