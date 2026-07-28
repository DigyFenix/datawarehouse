# Worker de extracción/introspección (plano de datos). Read-only al ERP; escribe metadatos.
FROM python:3.11-slim

WORKDIR /app

# Dependencias del sistema para hdbcli/psycopg (mínimas).
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir .

EXPOSE 3010

# Arranca el worker HTTP.
CMD ["uvicorn", "cresta_extraccion.worker:app", "--host", "0.0.0.0", "--port", "3010"]
