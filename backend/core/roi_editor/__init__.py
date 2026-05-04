# ROI Editor Core Module
# Bilimsel görüntü karşılaştırma pipeline'ı için ROI izolasyonu ve batch processing

from .isolation import isolate_roi, ROIMethod, ROIParams
from .registration import register_images, RegistrationResult, RegistrationParams
from .normalization import normalize_to_reference, NormalizationStats, NormalizationParams
from .metrics import compute_scientific_metrics, ScientificMetrics, MetricsConfig
from .batch_processor import ScientificBatchComparator, BatchResult, BatchConfig, process_batch

__all__ = [
    # Isolation
    "isolate_roi",
    "ROIMethod",
    "ROIParams",
    # Registration
    "register_images",
    "RegistrationResult",
    "RegistrationParams",
    # Normalization
    "normalize_to_reference",
    "NormalizationStats",
    "NormalizationParams",
    # Metrics
    "compute_scientific_metrics",
    "ScientificMetrics",
    "MetricsConfig",
    # Batch Processing
    "ScientificBatchComparator",
    "BatchResult",
    "BatchConfig",
    "process_batch",
]
