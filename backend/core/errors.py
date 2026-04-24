# filepath: backend/core/errors.py
from dataclasses import dataclass
from typing import Optional

@dataclass
class PipelineStepError:
    step: str
    message: str
    remediation: str
    severity: str = "warning" # "warning" or "error"

def format_error(step: str, message: str, remediation: str, severity: str = "warning") -> dict:
    return {
        "step": step,
        "message": message,
        "remediation": remediation,
        "severity": severity
    }
