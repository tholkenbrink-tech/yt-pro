
FROM denoland/deno:bin-2.9.3 AS deno

FROM python:3.12-slim

COPY --from=deno /deno /usr/local/bin/deno

ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

ARG PUID=1000
ARG PGID=1000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g ${PGID} appuser \
    && useradd -m -u ${PUID} -g ${PGID} appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data/database /data/temp /data/thumbnails /data/cookies \
    && chown -R appuser:appuser /app /data

USER appuser

ENV PYTHONUNBUFFERED=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
