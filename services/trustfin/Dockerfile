FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Mount or COPY the TrustFin artefact here. The file is intentionally NOT in
# this repository: it is research evidence owned by the TrustFin project.
ENV TRUSTFIN_MODEL_PATH=/models/I9_fit_only_selected.joblib
ENV PORT=8080

EXPOSE 8080

# SageMaker / Lambda container contracts both accept a single listening port.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
