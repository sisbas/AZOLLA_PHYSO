import base64
import json
import subprocess
import sys

import cv2
import numpy as np

from backend.core.image_preprocessor import ImagePreprocessor


def test_detect_lighting_issues_is_json_serializable():
    image = np.full((16, 16, 3), 32, dtype=np.uint8)

    lighting = ImagePreprocessor().detect_lighting_issues(image)

    json.dumps(lighting)
    assert type(lighting["is_dark"]) is bool
    assert type(lighting["is_bright"]) is bool
    assert type(lighting["is_low_contrast"]) is bool


def test_bridge_success_response_lighting_flags_are_python_bool():
    image = np.zeros((96, 96, 3), dtype=np.uint8)
    image[:, :, 1] = 180
    image[:, :, 0] = 40
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    payload = {
        "image": base64.b64encode(encoded).decode("ascii"),
        "filename": "lighting-bool-test.jpg",
        "pool_area_m2": 16.0,
    }

    completed = subprocess.run(
        [sys.executable, "backend/bridge.py"],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    response = json.loads(completed.stdout)

    assert response["status"] == "success", completed.stderr
    lighting = response["qc"]["lighting"]
    assert type(lighting["is_dark"]) is bool
    assert type(lighting["is_bright"]) is bool
    assert type(lighting["is_low_contrast"]) is bool
