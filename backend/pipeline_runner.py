# filepath: backend/pipeline_runner.py
import cv2
import yaml
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Tuple
from datetime import datetime
from backend.core import (
    StandardizationModule,
    SegmentationModule,
    MaskOptimizerModule,
    FeatureExtractionModule,
    DecisionModule,
    PseudocolorModule,
    BiomassIsolationModule,
    FrondSegmenterModule,
    DLFallbackModule,
    ValidationModule
)

class AzollaPipeline:
    """
    Orchestrates the full 10-step Azolla Stress Detection pipeline.
    Korelasyon ≠ nedensellik. Bu skor erken uyarı indeksidir; biyokimyasal validasyon gerektirir.
    """
    def __init__(self, config_path: str):
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.setup_logging()
        
        # Initialize modules
        self.std = StandardizationModule(self.config)
        self.seg = SegmentationModule(self.config)
        self.opt = MaskOptimizerModule(self.config)
        self.feat = FeatureExtractionModule(self.config)
        self.dec = DecisionModule(self.config)
        self.pseudo = PseudocolorModule(self.config)
        self.iso = BiomassIsolationModule(self.config)
        self.frond = FrondSegmenterModule(self.config)
        self.dl = DLFallbackModule(self.config)
        self.val = ValidationModule(self.config)
        
        self.output_base = Path(self.config['output']['base_dir'])

    def setup_logging(self):
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )

    def run_single_frame(self, img_bgr: np.ndarray, timestamp: str, experiment_id: str) -> Dict[str, Any]:
        """Runs the 10-step logic on a single image frame."""
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        out_dir = self.output_base / experiment_id / timestamp.replace(":", "-")
        
        all_errors = []

        # 1. Standardization
        std_res = self.std.process(img_rgb)
        all_errors.extend(std_res.errors)
        
        # 2. & 3. Segmentation & Optimization
        raw_mask, seg_qc = self.seg.process(std_res.img_clean)
        all_errors.extend(seg_qc.errors)
        
        opt_mask, opt_qc, opt_status = self.opt.process(raw_mask)
        all_errors.extend(opt_qc.errors)
        
        # 4. Feature Extraction
        feature_record = self.feat.process_frame(std_res.img_clean, opt_mask, timestamp)
        all_errors.extend(feature_record.errors)
        
        # 8 & 9. Frond Segmenter (with Fallback)
        labels, frond_qc = self.frond.process(opt_mask)
        all_errors.extend(frond_qc.get('errors', []))
        
        if not frond_qc.get('plausible', True):
            labels, dl_qc, dl_status = self.dl.process(img_rgb, opt_mask)
            all_errors.extend(dl_qc.get('errors', []))
            opt_status = dl_status
            
        # 6. Pseudocolor
        overlay, heatmap, ps_metrics = self.pseudo.generate_heatmap(std_res.img_clean, opt_mask)
        
        # 7. Isolation
        isolated = self.iso.isolate(img_rgb, opt_mask)
        
        # Compile results
        results = {
            "timestamp": timestamp,
            "metrics": {
                **{k: v for k, v in seg_qc.__dict__.items() if k != 'errors'},
                **{k: v for k, v in opt_qc.__dict__.items() if k != 'errors'},
                **{k: v for k, v in frond_qc.items() if k != 'errors'},
                **ps_metrics,
                **{k: v for k, v in feature_record.__dict__.items() if k != 'errors'}
            },
            "status": opt_status,
            "errors": all_errors,
            "image_paths": {
                "rgb": f"{experiment_id}/{timestamp}/rgb.png",
                "pseudocolor": f"{experiment_id}/{timestamp}/heatmap.png",
                "overlay": f"{experiment_id}/{timestamp}/overlay.png"
            }
        }
        
        # Export artifacts
        self.iso.export_results(out_dir, {
            "rgb": img_rgb,
            "std_clean": std_res.img_clean,
            "heatmap": heatmap,
            "overlay": overlay,
            "isolated": isolated,
            "metrics": results["metrics"]
        })
        
        return results

    def run_series(self, frames: List[Tuple[np.ndarray, str]], experiment_id: str) -> Dict[str, Any]:
        """Runs the pipeline over a time-series and applies temporal decision engine."""
        results_list = []
        for img, ts in frames:
            res = self.run_single_frame(img, ts, experiment_id)
            results_list.append(res)
            
        # Decision Phase
        feature_data = [r['metrics'] for r in results_list]
        feature_df = pd.DataFrame(feature_data)
        
        decision_df = self.dec.process(feature_df)
        
        # Final validation
        val_report = self.val.run_cv(feature_df)
        
        for i, res in enumerate(results_list):
            decision_data = decision_df.iloc[i].to_dict()
            res['decision'] = {k: v for k, v in decision_data.items() if k != 'errors'}
            res['errors'].extend(decision_data.get('errors', []))
            
        return {
            "experiment_id": experiment_id,
            "timeline": results_list,
            "validation": val_report,
            "metadata": self.val.generate_metadata(hash(str(self.config)))
        }
