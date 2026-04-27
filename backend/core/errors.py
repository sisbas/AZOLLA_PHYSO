# filepath: backend/core/errors.py
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any
from enum import Enum
import traceback
from datetime import datetime

class ErrorSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class ErrorCategory(Enum):
    VALIDATION = "validation"
    SEGMENTATION = "segmentation"
    PROCESSING = "processing"
    IO = "io"
    CONFIGURATION = "configuration"
    MODEL = "model"
    SYSTEM = "system"

@dataclass
class PipelineStepError:
    step: str
    message: str
    remediation: str
    severity: str = "warning"
    category: str = "processing"
    error_code: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    details: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "message": self.message,
            "remediation": self.remediation,
            "severity": self.severity,
            "category": self.category,
            "error_code": self.error_code,
            "timestamp": self.timestamp,
            "details": self.details
        }

@dataclass
class ProcessingContext:
    """Hata bağlamını takip eden sınıf"""
    image_id: str = ""
    experiment_id: str = ""
    step: str = ""
    config_snapshot: Dict[str, Any] = field(default_factory=dict)
    errors: List[PipelineStepError] = field(default_factory=list)
    warnings: List[PipelineStepError] = field(default_factory=list)
    
    def add_error(self, step: str, message: str, remediation: str, 
                  severity: str = "error", category: str = "processing",
                  error_code: str = "", details: Dict[str, Any] = None):
        error = PipelineStepError(
            step=step,
            message=message,
            remediation=remediation,
            severity=severity,
            category=category,
            error_code=error_code,
            details=details or {}
        )
        self.errors.append(error)
        return error
    
    def add_warning(self, step: str, message: str, remediation: str,
                    details: Dict[str, Any] = None):
        warning = PipelineStepError(
            step=step,
            message=message,
            remediation=remediation,
            severity="warning",
            category="processing",
            details=details or {}
        )
        self.warnings.append(warning)
        return warning
    
    def has_critical_errors(self) -> bool:
        return any(e.severity == "critical" for e in self.errors)
    
    def to_dict(self) -> dict:
        return {
            "image_id": self.image_id,
            "experiment_id": self.experiment_id,
            "current_step": self.step,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "errors": [e.to_dict() for e in self.errors],
            "warnings": [w.to_dict() for w in self.warnings],
            "can_continue": not self.has_critical_errors()
        }

def format_error(step: str, message: str, remediation: str, 
                 severity: str = "warning", category: str = "processing",
                 error_code: str = "", details: Dict[str, Any] = None) -> dict:
    """Geriye dönük uyumluluk için eski fonksiyon"""
    error = PipelineStepError(
        step=step,
        message=message,
        remediation=remediation,
        severity=severity,
        category=category,
        error_code=error_code,
        details=details or {}
    )
    return error.to_dict()

def safe_execute(func, default_value=None, error_handler=None):
    """
    Dekorator benzeri güvenli çalıştırma fonksiyonu.
    Hata yakalar, loglar ve güvenli bir şekilde devam eder.
    """
    try:
        return func(), None
    except Exception as e:
        error_msg = f"{func.__name__} failed: {str(e)}"
        stack_trace = traceback.format_exc()
        
        if error_handler:
            error_handler(e, stack_trace)
        else:
            import logging
            logging.error(f"{error_msg}\n{stack_trace}")
        
        return default_value, PipelineStepError(
            step=func.__name__,
            message=str(e),
            remediation="İşlem atlandı, varsayılan değer kullanılıyor.",
            severity="error",
            details={"stack_trace": stack_trace}
        )

def create_error_response(context: ProcessingContext, status_code: int = 500) -> dict:
    """Standart hata yanıtı oluştur"""
    return {
        "status": "failed" if context.has_critical_errors() else "completed_with_warnings",
        "context": context.to_dict(),
        "http_status": status_code,
        "timestamp": datetime.now().isoformat()
    }
