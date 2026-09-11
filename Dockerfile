FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY . .
RUN python -m pip install --no-cache-dir ".[worker,postgres]" \
    && useradd --create-home auditor \
    && mkdir -p /app/.data/uploads \
    && chown -R auditor:auditor /app
USER auditor
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
