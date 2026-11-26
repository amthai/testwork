"""Download verified model artifacts once, before running the speech service."""
import hashlib
import os
import shutil
import tempfile
import urllib.request
from pathlib import Path

DIRECTORY = Path(os.environ.get("PROOF_MODELS", Path.home() / ".cache/proof/speech"))
ASR = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-ctc-punct-giga-am-v3-russian-2025-12-16/resolve/360529f65d9687a7b1c2177130262819e51557da/"
TTS = "https://huggingface.co/rhasspy/piper-voices/resolve/e9c8a39444359388adaa94255becb37a5a2b8e51/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx"
FILES = [
    ("gigaam.onnx", ASR + "model.int8.onnx", "d5fea8df94263c285e54b21e5774b707c707192d3bdbeffd7b1eb07fb6743b35"),
    ("tokens.txt", ASR + "tokens.txt", "142de7570b3de5b3035ce111a89c228e80e6085273731d944093ddf24fa539cd"),
    ("denis.onnx", TTS, "879bc365cb14d1380e3f5ed6044162ccf54c99f6161871569b7f830aec3ce841"),
    ("denis.onnx.json", TTS + ".json", "5891b94580ae739a8cdc5d17591db6800333f85164d13599aca893883d99b9eb"),
]


def digest(path):
    with path.open("rb") as reader:
        return hashlib.file_digest(reader, "sha256").hexdigest()


if __name__ == "__main__":
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    for name, url, checksum in FILES:
        target = DIRECTORY / name
        if target.exists() and digest(target) == checksum:
            continue
        with tempfile.NamedTemporaryFile(dir=DIRECTORY, delete=False) as out:
            temp = Path(out.name)
        try:
            with urllib.request.urlopen(url, timeout=90) as src, temp.open("wb") as out:
                shutil.copyfileobj(src, out)
            if digest(temp) != checksum:
                raise ValueError(f"Checksum mismatch: {name}")
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)

