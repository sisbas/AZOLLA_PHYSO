# filepath: backend/pipeline_runner.py
import cv2
import yaml
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Tuple
from datetime import datetime, timezone
from backend.core.errors import format_error
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
    ValidationModule,
    PhenotypingModule
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
        self.pheno = PhenotypingModule(self.config)  # Fenotipleme modülü
        
        self.output_base = Path(self.config['output']['base_dir'])

    def setup_logging(self):
        # Use centralized logger instead of basicConfig
        from backend.logger import get_logger
        self.logger = get_logger("pipeline")
        self.logger.info("Pipeline modules initialized")

    def run_single_frame(self, img_bgr: np.ndarray, timestamp: str, experiment_id: str,
                         previous_results: Dict[str, Any] = None,
                         time_diff_days: float = 1.0) -> Dict[str, Any]:
        """Runs the 10-step logic on a single image frame with phenotyping."""
        try:
            self.logger.info(f"Processing frame at {timestamp} for experiment {experiment_id}")
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
            out_dir = self.output_base / experiment_id / timestamp.replace(":", "-")
            
            all_errors = []
            segmentation_outputs = {}

            # 1. Standardization
            self.logger.debug("Running standardization...")
            std_res = self.std.process(img_rgb)
            all_errors.extend(std_res.errors)
            
            # 2. & 3. Segmentation & Optimization (now returns extra outputs)
            self.logger.debug("Running segmentation...")
            raw_mask, seg_qc, segmentation_outputs = self.seg.process(std_res.img_clean)
            all_errors.extend(seg_qc.errors)
            
            self.logger.debug("Running mask optimization...")
            opt_mask, opt_qc, opt_status = self.opt.process(raw_mask)
            all_errors.extend(opt_qc.errors)
            
            # 4. Feature Extraction
            self.logger.debug("Extracting features...")
            feature_record = self.feat.process_frame(std_res.img_clean, opt_mask, timestamp)
            all_errors.extend(feature_record.errors)
            
            # 5. Fenotipleme ve Biyokütle Tahmini (YENİ)
            self.logger.debug("Running phenotyping...")
            phenotype_metrics = self.pheno.process(
                img_rgb,
                opt_mask,
                previous_results=previous_results,
                time_diff_days=time_diff_days
            )
            all_errors.extend(phenotype_metrics.errors)
            
            # 8 & 9. Frond Segmenter (with Fallback)
            self.logger.debug("Running frond segmentation...")
            labels, frond_qc = self.frond.process(opt_mask)
            all_errors.extend(frond_qc.get('errors', []))
            
            if not frond_qc.get('plausible', True):
                self.logger.warning("Frond segmentation implausible, using DL fallback...")
                labels, dl_qc, dl_status = self.dl.process(img_rgb, opt_mask)
                all_errors.extend(dl_qc.get('errors', []))
                opt_status = dl_status
                
            # 6. Pseudocolor
            self.logger.debug("Generating pseudocolor heatmap...")
            overlay, heatmap, ps_metrics = self.pseudo.generate_heatmap(std_res.img_clean, opt_mask)
            
            # 7. Isolation
            self.logger.debug("Isolating biomass...")
            isolated = self.iso.isolate(img_rgb, opt_mask)
            
            # Compile results - merge segmentation outputs with metrics
            results = {
                "timestamp": timestamp,
                "metrics": {
                    **{k: v for k, v in seg_qc.__dict__.items() if k != 'errors'},
                    **{k: v for k, v in opt_qc.__dict__.items() if k != 'errors'},
                    **{k: v for k, v in frond_qc.items() if k != 'errors'},
                    **ps_metrics,
                    **{k: v for k, v in feature_record.__dict__.items() if k != 'errors'}
                },
                "phenotyping": self.pheno.to_dict(phenotype_metrics),  # Fenotipleme sonuçları ekle
                "segmentation": segmentation_outputs,  # Add detailed segmentation outputs
                "status": opt_status,
                "errors": all_errors,
                "image_urls": {
                    "rgb": f"/media/{experiment_id}/{timestamp.replace(':', '-')}/rgb.png",
                    "pseudocolor": f"/media/{experiment_id}/{timestamp.replace(':', '-')}/heatmap.png",
                    "overlay": f"/media/{experiment_id}/{timestamp.replace(':', '-')}/overlay.png",
                    "isolated": f"/media/{experiment_id}/{timestamp.replace(':', '-')}/isolated.png"
                }
            }
            
            # Export artifacts
            self.logger.debug(f"Exporting results to {out_dir}...")
            self.iso.export_results(out_dir, {
                "rgb": img_rgb,
                "std_clean": std_res.img_clean,
                "heatmap": heatmap,
                "overlay": overlay,
                "isolated": isolated,
                "metrics": results["metrics"],
                "phenotyping": results["phenotyping"]
            })
            
            self.logger.info(f"Frame processing completed for {timestamp}")
            return results
            
        except Exception as e:
            self.logger.error(f"Error processing frame {timestamp}: {str(e)}", exc_info=True)
            raise

    def run_series(self, frames: List[Tuple[np.ndarray, str]], experiment_id: str) -> Dict[str, Any]:
        """Runs the pipeline over a time-series and applies temporal decision engine."""
        def rolling_stats(values: pd.Series, window: int = 3) -> Tuple[List[float], List[float]]:
            moving_avg = values.rolling(window=window, min_periods=1).mean().fillna(0.0)
            moving_std = values.rolling(window=window, min_periods=1).std(ddof=0).fillna(0.0)
            return moving_avg.tolist(), moving_std.tolist()

        def robust_z_scores(values: pd.Series) -> List[float]:
            arr = values.to_numpy(dtype=float)
            median = float(np.nanmedian(arr)) if arr.size else 0.0
            mad = float(np.nanmedian(np.abs(arr - median))) if arr.size else 0.0
            scale = 1.4826 * mad + 1e-9
            return (((arr - median) / scale)).tolist()

        def detect_change_points(values: pd.Series, threshold_multiplier: float = 5.0) -> List[int]:
            arr = values.to_numpy(dtype=float)
            if arr.size < 3:
                return []
            mean = float(np.mean(arr))
            std = float(np.std(arr)) + 1e-9
            pos_cusum = 0.0
            neg_cusum = 0.0
            threshold = threshold_multiplier * std
            change_points = []
            for i, val in enumerate(arr):
                centered = val - mean
                pos_cusum = max(0.0, pos_cusum + centered)
                neg_cusum = min(0.0, neg_cusum + centered)
                if pos_cusum > threshold or abs(neg_cusum) > threshold:
                    change_points.append(i)
                    pos_cusum = 0.0
                    neg_cusum = 0.0
            return sorted(set(change_points))
        def parse_frame_timestamp(timestamp: str):
            """Parse frame timestamps into datetimes for chronological ordering."""
            if timestamp is None:
                return None

            ts_text = str(timestamp).strip()
            if not ts_text:
                return None

            normalized = ts_text.replace("Z", "+00:00")
            def normalize_datetime(value: datetime):
                if value.tzinfo is not None:
                    return value.astimezone(timezone.utc).replace(tzinfo=None)
                return value

            try:
                return normalize_datetime(datetime.fromisoformat(normalized))
            except ValueError:
                pass

            parsed = pd.to_datetime(ts_text, errors='coerce')
            if pd.isna(parsed):
                return None

            if hasattr(parsed, 'to_pydatetime'):
                return normalize_datetime(parsed.to_pydatetime())

            return parsed

        try:
            self.logger.info(f"Starting series processing for experiment {experiment_id} with {len(frames)} frames")
            parsed_frames = []
            for input_index, (img, ts) in enumerate(frames):
                parsed_ts = parse_frame_timestamp(ts)
                parse_error = None
                if parsed_ts is None:
                    parse_error = format_error(
                        "timeline",
                        f"Timestamp could not be parsed for chronological sorting: {ts}",
                        "Use an ISO-8601 timestamp or another unambiguous date/time format. Unparsed frames are kept after parsed frames in input order.",
                        severity="warning",
                        category="validation",
                        error_code="TIMESTAMP_PARSE_FAILED",
                        details={"timestamp": ts, "input_index": input_index}
                    )
                    self.logger.warning(parse_error["message"])

                parsed_frames.append({
                    "img": img,
                    "timestamp": ts,
                    "parsed_timestamp": parsed_ts,
                    "input_index": input_index,
                    "parse_error": parse_error,
                })

            parsed_frames.sort(key=lambda frame: (
                frame["parsed_timestamp"] is None,
                frame["parsed_timestamp"] or datetime.max,
                frame["input_index"]
            ))

            results_list = []
            previous_successful_result = None
            previous_successful_parsed_ts = None
            for i, frame in enumerate(parsed_frames):
                img = frame["img"]
                ts = frame["timestamp"]
                parsed_ts = frame["parsed_timestamp"]
                self.logger.debug(f"Processing frame {i+1}/{len(parsed_frames)} at {ts}")
                time_diff_days = (
                    (parsed_ts - previous_successful_parsed_ts).total_seconds() / 86400.0
                    if parsed_ts is not None and previous_successful_parsed_ts is not None
                    else None
                )
                res = self.run_single_frame(
                    img,
                    ts,
                    experiment_id,
                    previous_results=previous_successful_result,
                    time_diff_days=time_diff_days
                )
                res["time_delta_days"] = time_diff_days
                if parsed_ts is not None:
                    res["parsed_timestamp"] = parsed_ts.isoformat()
                if frame["parse_error"] is not None:
                    res.setdefault("errors", []).append(frame["parse_error"])
                results_list.append(res)

                has_error = any(error.get('severity') == 'error' for error in res.get('errors', []))
                if not has_error:
                    previous_successful_result = res
                    previous_successful_parsed_ts = parsed_ts
                
            self.logger.info(f"Completed processing {len(frames)} frames, running decision engine...")
            
            # Decision Phase
            feature_data = [r['metrics'] for r in results_list]
            feature_df = pd.DataFrame(feature_data)
            
            decision_df = self.dec.process(feature_df)
            
            # Final validation
            self.logger.debug("Running cross-validation...")
            val_report = self.val.run_cv(feature_df)
            
            for i, res in enumerate(results_list):
                decision_data = decision_df.iloc[i].to_dict()
                res['decision'] = {k: v for k, v in decision_data.items() if k != 'errors'}
                # Keep the decision probability available under metrics as well so
                # existing dashboard metric renderers and comparison charts can
                # consume a single metric namespace.
                if 'early_stress_prob' in decision_data:
                    res['metrics']['early_stress_prob'] = decision_data['early_stress_prob']
                res['errors'].extend(decision_data.get('errors', []))

            timeline_df = pd.DataFrame({
                "coverage": [r.get("metrics", {}).get("coverage_pct", np.nan) for r in results_list],
                "frond_count": [r.get("metrics", {}).get("frond_count", np.nan) for r in results_list],
                "stress_score": [r.get("phenotyping", {}).get("stres_analizi", {}).get("stress_score", np.nan) for r in results_list],
            }).apply(pd.to_numeric, errors='coerce')

            series_signals: Dict[str, Any] = {}
            for metric_key in ["coverage", "frond_count", "stress_score"]:
                values = timeline_df[metric_key].fillna(method='ffill').fillna(method='bfill').fillna(0.0)
                moving_avg, moving_std = rolling_stats(values, window=3)
                anomaly_scores = robust_z_scores(values)
                anomaly_flags = [abs(score) >= 3.5 for score in anomaly_scores]
                change_points = detect_change_points(values)
                series_signals[metric_key] = {
                    "moving_avg": moving_avg,
                    "moving_std": moving_std,
                    "anomaly_scores": anomaly_scores,
                    "anomaly_flags": anomaly_flags,
                    "change_points": change_points,
                }

            for i, res in enumerate(results_list):
                per_frame = {}
                for metric_key in ["coverage", "frond_count", "stress_score"]:
                    signal = series_signals[metric_key]
                    per_frame[metric_key] = {
                        "moving_avg": signal["moving_avg"][i],
                        "moving_std": signal["moving_std"][i],
                        "anomaly_score": signal["anomaly_scores"][i],
                        "anomaly_flag": signal["anomaly_flags"][i],
                        "change_point": i in signal["change_points"],
                    }
                res["time_series_signals"] = per_frame

            metadata = self.val.generate_metadata(hash(str(self.config)))
            metadata['decision'] = {
                "early_weights": self.config.get('decision', {}).get('early_weights', {}),
                "prob_threshold": self.config.get('decision', {}).get('prob_threshold')
            }
            
            self.logger.info(f"Series processing completed for experiment {experiment_id}")
            
            return {
                "experiment_id": experiment_id,
                "timeline": results_list,
                "time_series_signals": series_signals,
                "validation": val_report,
                "metadata": metadata
            }
        except Exception as e:
            self.logger.error(f"Error in series processing for {experiment_id}: {str(e)}", exc_info=True)
            raise
