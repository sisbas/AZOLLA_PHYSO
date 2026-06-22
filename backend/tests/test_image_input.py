import base64
import importlib.util
import sys
import types
from pathlib import Path

import cv2
import numpy as np

BACKEND_DIR = Path(__file__).resolve().parents[1]
CORE_DIR = BACKEND_DIR / "core"

if "core" not in sys.modules:
    core_pkg = types.ModuleType("core")
    core_pkg.__path__ = [str(CORE_DIR)]
    sys.modules["core"] = core_pkg

if "core.errors" not in sys.modules:
    errors_spec = importlib.util.spec_from_file_location("core.errors", CORE_DIR / "errors.py")
    errors_module = importlib.util.module_from_spec(errors_spec)
    sys.modules["core.errors"] = errors_module
    errors_spec.loader.exec_module(errors_module)

image_input_spec = importlib.util.spec_from_file_location("core.image_input", CORE_DIR / "image_input.py")
image_input_module = importlib.util.module_from_spec(image_input_spec)
sys.modules["core.image_input"] = image_input_module
image_input_spec.loader.exec_module(image_input_module)
load_image_input = image_input_module.load_image_input


def test_long_jpeg_base64_decodes_without_path_exists(monkeypatch):
    image = np.full((64, 64, 3), 255, dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    image_b64 = base64.b64encode(encoded).decode("ascii")
    assert image_b64.startswith("/9j/")
    assert len(image_b64) > 512

    def fail_exists(self):  # pragma: no cover - should not be reached
        raise OSError("File name too long")

    monkeypatch.setattr("pathlib.Path.exists", fail_exists)

    decoded = load_image_input(image_b64, color_space="BGR")

    assert decoded.shape == image.shape
    assert decoded.dtype == np.uint8
