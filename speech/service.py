"""Private PCM16 (16 kHz mono) recognition and WAV synthesis for the Proof backend."""
import io
import json
import os
import re
import threading
import wave
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import sherpa_onnx
from piper import PiperVoice
from models import DIRECTORY, VOICES

recognizer = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(
    model=str(DIRECTORY / "gigaam.onnx"), tokens=str(DIRECTORY / "tokens.txt"),
    feature_dim=64, num_threads=3,
)
inference = threading.Lock()
# Only pronounce the assistant's words. Candidate transcripts stay verbatim.
pronunciations = {"figma": "Фигма", "a/b": "а бэ", "ux": "ю икс", "ui": "ю ай", "proof": "Пруф"}
terms = re.compile(r"\b(" + "|".join(map(re.escape, pronunciations)) + r")\b", re.IGNORECASE)


@lru_cache(maxsize=1)
def load_voice(name):
    return PiperVoice.load(DIRECTORY / (name + ".onnx"))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, code, body=b"", mime="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(200 if self.path == "/ready" else 404)

    def do_POST(self):
        if self.path not in ("/transcribe", "/synthesize"):
            return self.respond(404)
        limit = 960000 if self.path == "/transcribe" else 16000
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= limit:
                return self.respond(413)
            self.connection.settimeout(15)
            body = self.rfile.read(size)
            if len(body) != size:
                return self.respond(400)
            if not inference.acquire(timeout=8):
                return self.respond(503)
            try:
                if self.path == "/transcribe":
                    samples = np.frombuffer(body, dtype="<i2").astype("float32") / 32768
                    stream = recognizer.create_stream()
                    stream.accept_waveform(16000, samples)
                    recognizer.decode_stream(stream)
                    data = json.dumps({"text": stream.result.text}, ensure_ascii=False).encode()
                    mime = "application/json"
                else:
                    voice_name = self.headers.get("X-Piper-Voice", "denis")
                    if voice_name not in VOICES:
                        return self.respond(400)
                    text = body.decode().strip()
                    if not 0 < len(text) <= 2000:
                        return self.respond(400)
                    text = terms.sub(lambda m: pronunciations[m[0].lower()], text)
                    wav = io.BytesIO()
                    with wave.open(wav, "wb") as writer:
                        load_voice(voice_name).synthesize_wav(text, writer)
                    data, mime = wav.getvalue(), "audio/wav"
            finally:
                inference.release()
        except (ValueError, UnicodeError):
            return self.respond(400)
        except Exception:
            return self.respond(503)
        self.respond(200, data, mime)


if __name__ == "__main__":
    ThreadingHTTPServer((os.getenv("SPEECH_HOST", "127.0.0.1"), int(os.getenv("SPEECH_PORT", "8078"))), Handler).serve_forever()

