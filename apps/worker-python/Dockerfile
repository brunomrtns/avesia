# =============================================================================
# apps/worker-python/Dockerfile — Avesia Python Worker (Celery)
#
# Single-stage build for simplicity (spaCy model + NLTK data need to be
# downloaded and kept in the same image).
#
# Runtime: Python 3.12-slim, dumb-init, non-root user
# =============================================================================

FROM python:3.12-slim

WORKDIR /app

# System deps: build tools + runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libpq5 \
    dumb-init \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy project metadata and source
COPY apps/worker-python/pyproject.toml ./
COPY apps/worker-python/src/ ./src/

# Install the package
RUN pip install --no-cache-dir -e . || pip install --no-cache-dir .

# Download spaCy Portuguese model (small — ~12MB)
RUN python -m spacy download pt_core_news_sm || true

# Download NLTK data
RUN python -c "import nltk; nltk.download('punkt_tab', quiet=True); nltk.download('stopwords', quiet=True)" || true

# Create non-root user
RUN groupadd -r avesia && useradd -r -g avesia avesia
RUN chown -R avesia:avesia /app
USER avesia

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 3102

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
    CMD curl -sf http://localhost:3102/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "-m", "src.main"]
