"""Download verified model artifacts once, before running the speech service."""
import hashlib
import os
import shutil
import tempfile
import urllib.request
from pathlib import Path

DIRECTORY = Path(os.environ.get("PROOF_MODELS", Path.home() / ".cache/proof/speech"))
ASR = "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-ctc-punct-giga-am-v3-russian-2025-12-16/resolve/360529f65d9687a7b1c2177130262819e51557da/"
PIPER = "https://huggingface.co/rhasspy/piper-voices/resolve/e9c8a39444359388adaa94255becb37a5a2b8e51/ru/ru_RU/"
RU_PIPER = "https://huggingface.co/rraaww/ru_piper/resolve/ba4a8c784ff536f71e4dd48bd6815092fb02cd65/"
VOICES = {
    "denis": (PIPER + "denis/medium/ru_RU-denis-medium.onnx",
              "879bc365cb14d1380e3f5ed6044162ccf54c99f6161871569b7f830aec3ce841",
              "5891b94580ae739a8cdc5d17591db6800333f85164d13599aca893883d99b9eb"),
    "mari": (RU_PIPER + "ru_RU-mari-medium_epoch5699.onnx",
             "8f1b7a19d42d564f7e4951bf828a9e910d85e8f9e78cb495b31db9f29f580112",
             "ebb1740b93370d90a74587a38b4827958522497ad026849339f9d1e414f965e9"),
    "terra": (RU_PIPER + "ru_RU-terra5871-medium.onnx",
              "edf8010bf52550896347b074eaee969dc8efec72cf116cdb10db7d54a84473e8",
              "67f1ea8d21a2ddcb7cf60a4f60f8e35a613cc33f0378dff093a7aa8c2b85c13e"),
    "dmitri": (PIPER + "dmitri/medium/ru_RU-dmitri-medium.onnx",
               "9ed9941bac7373f2ec1be36627e0e71a349a59ca5522d4363fd50701db05193a",
               "c3741c9c1558fc38e902fd80d39155c32a7d019d7d17e3a43eac66b7bd3fbe09"),
}
FILES = [
    ("gigaam.onnx", ASR + "model.int8.onnx", "d5fea8df94263c285e54b21e5774b707c707192d3bdbeffd7b1eb07fb6743b35"),
    ("tokens.txt", ASR + "tokens.txt", "142de7570b3de5b3035ce111a89c228e80e6085273731d944093ddf24fa539cd"),
]
for voice_name, (model_url, model_checksum, config_checksum) in VOICES.items():
    FILES.append((voice_name + ".onnx", model_url, model_checksum))
    FILES.append((voice_name + ".onnx.json", model_url + ".json", config_checksum))


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

