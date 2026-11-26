FROM python:3.11-slim-bookworm
WORKDIR /opt/proof-speech
ENV PROOF_MODELS=/opt/proof-speech/weights SPEECH_HOST=0.0.0.0 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY models.py service.py GigaAM-LICENSE VOICE-NOTICES Apache-2.0-LICENSE ./
RUN install -d -o 65534 -g 65534 "$PROOF_MODELS"
VOLUME ["/opt/proof-speech/weights"]
USER 65534:65534
CMD ["sh", "-c", "python models.py && exec python service.py"]
