FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml README.md ./
COPY src/ src/
RUN pip install --no-cache-dir -e .
COPY dagster_project/ dagster_project/
COPY pipelines/ pipelines/
COPY tests/ tests/
ENV DAGSTER_HOME=/app/.dagster_home
RUN mkdir -p $DAGSTER_HOME data/raw data/interim data/processed data/cache
# one-off run:  docker compose run --rm pipeline python pipelines/run_resale.py
CMD ["dagster", "dev", "-m", "dagster_project.definitions", "-h", "0.0.0.0", "-p", "3000"]
