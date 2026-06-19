"""Central image-input normalization utilities.

Boundary contract:
- Service/API boundary uses OpenCV-compatible BGR ``np.ndarray`` images by default.
- Pipeline internals may explicitly request RGB with ``color_space="RGB"`` when a downstream
  component expects RGB.

``load_image_input`` accepts common ingress shapes (FastAPI ``UploadFile``/file-like
objects, filesystem paths, raw encoded bytes, Base64 strings/data URLs, and existing
``np.ndarray`` images) and returns a validated 3-channel ``uint8`` array in the requested
color space.
"""
from __future__ import annotations

import base64
import binascii
import os
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np

from .errors import ErrorCategory, ErrorSeverity, format_error

ImageColorSpace = Literal["BGR", "RGB"]


class ImageInputError(ValueError):
    """Input-normalization error compatible with the shared pipeline error payload."""

    def __init__(self, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.payload = format_error(
            step="image_input_normalization",
            message=message,
            remediation="Geçerli bir görüntü dosyası, bytes, Base64 string veya np.ndarray gönderin.",
            severity=ErrorSeverity.ERROR.value,
            category=ErrorCategory.VALIDATION.value,
            error_code="IMAGE_INPUT_INVALID",
            details=details or {},
        )


def _decode_encoded_bytes(data: bytes, source_type: str) -> np.ndarray:
    nparr = np.frombuffer(data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ImageInputError(
            "Görüntü decode edilemedi veya format geçersiz.",
            details={"source_type": source_type, "byte_length": len(data)},
        )
    return image


def _decode_base64(source: str) -> bytes:
    candidate = source.strip()
    if candidate.startswith("data:") and "," in candidate:
        candidate = candidate.split(",", 1)[1]
    try:
        return base64.b64decode(candidate, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ImageInputError(
            f"Base64 görüntü verisi çözümlenemedi: {exc}",
            details={"source_type": "base64", "error_type": type(exc).__name__},
        ) from exc


def _read_upload_or_file(source: Any) -> bytes:
    file_obj = getattr(source, "file", source)
    try:
        position = file_obj.tell() if hasattr(file_obj, "tell") else None
        data = file_obj.read()
        if hasattr(file_obj, "seek") and position is not None:
            file_obj.seek(position)
    except Exception as exc:  # noqa: BLE001 - normalized to shared error payload
        raise ImageInputError(
            f"Görüntü kaynağı okunamadı: {exc}",
            details={"source_type": type(source).__name__, "error_type": type(exc).__name__},
        ) from exc
    if isinstance(data, str):
        data = data.encode()
    return data


def _normalize_array(image: np.ndarray, ndarray_color_space: ImageColorSpace, color_space: ImageColorSpace) -> np.ndarray:
    if image.size == 0:
        raise ImageInputError("Boş np.ndarray görüntü girdisi.", details={"source_type": "ndarray"})
    if image.ndim == 2:
        normalized = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        current = "BGR"
    elif image.ndim == 3 and image.shape[2] == 3:
        normalized = image.copy()
        current = ndarray_color_space
    elif image.ndim == 3 and image.shape[2] == 4:
        code = cv2.COLOR_RGBA2BGR if ndarray_color_space == "RGB" else cv2.COLOR_BGRA2BGR
        normalized = cv2.cvtColor(image, code)
        current = "BGR"
    else:
        raise ImageInputError(
            "np.ndarray görüntü HxW, HxWx3 veya HxWx4 boyutlarında olmalıdır.",
            details={"source_type": "ndarray", "shape": tuple(image.shape)},
        )
    if normalized.dtype != np.uint8:
        normalized = np.clip(normalized, 0, 255).astype(np.uint8)
    return _convert_color(normalized, current, color_space)


def _convert_color(image: np.ndarray, current: ImageColorSpace, target: ImageColorSpace) -> np.ndarray:
    if current == target:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB if target == "RGB" else cv2.COLOR_RGB2BGR)


def load_image_input(
    source: Any,
    *,
    color_space: ImageColorSpace = "BGR",
    ndarray_color_space: ImageColorSpace = "BGR",
) -> np.ndarray:
    """Normalize an image ingress value into a 3-channel ``uint8`` ``np.ndarray``.

    Args:
        source: FastAPI ``UploadFile``/file-like object, filesystem path, encoded image
            ``bytes``, Base64 string/data URL, or an existing ``np.ndarray``.
        color_space: Output channel order. Use ``"BGR"`` at service boundaries and
            ``"RGB"`` inside RGB-only pipeline components.
        ndarray_color_space: Declares the channel order of 3/4-channel ndarray inputs.

    Returns:
        A validated image array in the requested channel order.

    Raises:
        ImageInputError: Includes ``payload`` formatted with ``backend.core.errors``.
    """
    if color_space not in ("BGR", "RGB") or ndarray_color_space not in ("BGR", "RGB"):
        raise ImageInputError("color_space ve ndarray_color_space BGR veya RGB olmalıdır.")

    if isinstance(source, np.ndarray):
        return _normalize_array(source, ndarray_color_space, color_space)

    if isinstance(source, (bytes, bytearray, memoryview)):
        return _convert_color(_decode_encoded_bytes(bytes(source), "bytes"), "BGR", color_space)

    if isinstance(source, (str, os.PathLike)):
        source_text = os.fspath(source)
        path = Path(source_text)
        if path.exists():
            image = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if image is None:
                raise ImageInputError("Görüntü dosyası okunamadı veya format geçersiz.", details={"path": str(path)})
            return _convert_color(image, "BGR", color_space)
        return _convert_color(_decode_encoded_bytes(_decode_base64(source_text), "base64"), "BGR", color_space)

    if hasattr(source, "read") or hasattr(source, "file"):
        data = _read_upload_or_file(source)
        return _convert_color(_decode_encoded_bytes(data, type(source).__name__), "BGR", color_space)

    raise ImageInputError(
        "Desteklenmeyen görüntü girdi tipi.",
        details={"source_type": type(source).__name__},
    )
