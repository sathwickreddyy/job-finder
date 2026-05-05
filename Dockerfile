# syntax=docker/dockerfile:1.7
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system deps only if needed (none required for current requirements.txt).
# tini gives us proper signal forwarding so `docker compose down` terminates
# streamlit cleanly without zombie python processes.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

# Install Python deps first so requirements.txt edits don't bust the app layer.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the app. `data/`, `config/`, `resumes/` are bind-mounted at runtime
# from docker-compose so edits persist on the host.
COPY app/ ./app/
COPY config/ ./config/
COPY resumes/ ./resumes/
COPY README.md ./

# Streamlit default port
EXPOSE 8501

# PYTHONPATH makes `app.ui.streamlit_app` resolve when streamlit executes
# the file directly. tini is PID 1 so SIGTERM propagates to Python.
ENV PYTHONPATH=/app

ENTRYPOINT ["/usr/bin/tini", "--"]
# Default command is the UI; the `daily` and `cli` services in compose
# override this with the specific CLI invocation they need.
CMD ["python", "-m", "streamlit", "run", "app/ui/streamlit_app.py", \
     "--server.address", "0.0.0.0", "--server.port", "8501", \
     "--server.headless", "true", \
     "--browser.gatherUsageStats", "false"]
