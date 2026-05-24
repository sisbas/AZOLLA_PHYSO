# filepath: backend/main.py
import uvicorn
import shutil
import os
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timedelta, timezone
from backend.pipeline_runner import AzollaPipeline
from backend.phenotyping_service import AzollaPhenotypingService
from backend.logger import get_logger

logger = get_logger("main")

app = FastAPI(title="Azolla Early Stress Detection API", version="1.2.5")

# Global Registry
tasks = {}
CONFIG_PATH = "backend/config.yaml"

try:
    logger.info("Initializing AzollaPipeline...")
    pipeline = AzollaPipeline(CONFIG_PATH)
    logger.info("AzollaPipeline initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize AzollaPipeline: {str(e)}", exc_info=True)
    raise

try:
    logger.info("Initializing AzollaPhenotypingService...")
    phenotyping_service = AzollaPhenotypingService()
    logger.info("AzollaPhenotypingService initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize AzollaPhenotypingService: {str(e)}", exc_info=True)
    raise

# Ensure output directory for serving images
OUTPUT_DIR = Path("results")
OUTPUT_DIR.mkdir(exist_ok=True)
app.mount("/media", StaticFiles(directory="results"), name="media")

class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: int
    result: Optional[Dict[str, Any]] = None

@app.get("/api/v1/health")
def health():
    return {"status": "ready", "pipeline": "azolla_v1", "gpu": False}

def _iso_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def _timestamp_from_filename(filename: Optional[str]) -> Optional[str]:
    if not filename:
        return None

    import re
    patterns = [
        (re.compile(r"(20\d{2})[-_\. ]?(0[1-9]|1[0-2])[-_\. ]?([0-2]\d|3[01])(?:[Tt_\- ]?([01]\d|2[0-3])[-_\. ]?([0-5]\d)(?:[-_\. ]?([0-5]\d))?)?"), (1, 2, 3)),
        (re.compile(r"([0-2]\d|3[01])[-_\. ](0[1-9]|1[0-2])[-_\. ](20\d{2})(?:[Tt_\- ]?([01]\d|2[0-3])[-_\. ]?([0-5]\d)(?:[-_\. ]?([0-5]\d))?)?"), (3, 2, 1)),
    ]

    for pattern, (year_idx, month_idx, day_idx) in patterns:
        match = pattern.search(filename)
        if not match:
            continue

        hour = match.group(4) or "00"
        minute = match.group(5) or "00"
        second = match.group(6) or "00"
        try:
            parsed = datetime(
                int(match.group(year_idx)),
                int(match.group(month_idx)),
                int(match.group(day_idx)),
                int(hour),
                int(minute),
                int(second),
                tzinfo=timezone.utc,
            )
            return _iso_timestamp(parsed)
        except ValueError:
            continue

    return None

def _normalize_timestamp(timestamp: Optional[str]) -> Optional[str]:
    if not timestamp:
        return None

    candidate = timestamp.strip()
    if not candidate:
        return None

    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        return _iso_timestamp(parsed)
    except ValueError:
        return candidate

def _resolve_series_timestamps(images: List[UploadFile], timestamps: Optional[List[str]]) -> List[str]:
    resolved = []
    deterministic_base = datetime(2000, 1, 1, tzinfo=timezone.utc)

    for index, img_file in enumerate(images):
        provided = timestamps[index] if timestamps and index < len(timestamps) else None
        timestamp = _normalize_timestamp(provided) or _timestamp_from_filename(img_file.filename)

        if not timestamp:
            timestamp = _iso_timestamp(deterministic_base + timedelta(seconds=index))

        resolved.append(timestamp)

    return resolved

async def process_series_task(task_id: str, experiment_id: str, images: List[UploadFile], timestamps: List[str]):
    try:
        logger.info(f"Starting processing for task {task_id}, experiment {experiment_id}")
        tasks[task_id]["status"] = "processing"
        frame_tuples = []
        
        for i, (img_file, ts) in enumerate(zip(images, timestamps)):
            try:
                # Read image
                contents = await img_file.read()
                nparr = np.frombuffer(contents, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if img is not None:
                    frame_tuples.append((img, ts))
                    logger.debug(f"Loaded image {i+1}/{len(images)} with timestamp {ts}")
                else:
                    logger.warning(f"Failed to decode image {i+1}: {img_file.filename}")
            except Exception as e:
                logger.error(f"Error loading image {img_file.filename}: {str(e)}", exc_info=True)
                tasks[task_id].setdefault("errors", []).append({
                    "file": img_file.filename,
                    "error": str(e)
                })
            
            tasks[task_id]["progress"] = int((i / len(images)) * 50) # First 50% for loading

        if not frame_tuples:
            raise ValueError("No valid images were loaded")
        
        logger.info(f"Running pipeline on {len(frame_tuples)} frames")
        # Run pipeline
        results = pipeline.run_series(frame_tuples, experiment_id)
        
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
        tasks[task_id]["result"] = results
        logger.info(f"Task {task_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Task {task_id} failed: {str(e)}", exc_info=True)
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
        tasks[task_id].setdefault("errors", []).append({
            "step": "process_series",
            "error": str(e),
            "traceback": __import__('traceback').format_exc()
        })

@app.post("/api/v1/predict/series")
async def predict_series(
    background_tasks: BackgroundTasks, 
    images: List[UploadFile] = File(...), 
    timestamps: Optional[List[str]] = Form(None),
    experiment_id: Optional[str] = Form(None)
):
    try:
        task_id = str(uuid4())
        if not experiment_id:
            experiment_id = f"EXP-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        resolved_timestamps = _resolve_series_timestamps(images, timestamps)
        logger.info(f"Creating new task {task_id} for experiment {experiment_id} with {len(images)} images")
        tasks[task_id] = {"status": "queued", "progress": 0}
        background_tasks.add_task(process_series_task, task_id, experiment_id, images, resolved_timestamps)
        
        return {"task_id": task_id, "experiment_id": experiment_id}
    except Exception as e:
        logger.error(f"Failed to create prediction task: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Görev oluşturma hatası: {str(e)}")

@app.get("/api/v1/tasks/{task_id}/status", response_model=TaskStatus)
async def get_task_status(task_id: str):
    try:
        if task_id not in tasks:
            logger.warning(f"Task {task_id} not found")
            raise HTTPException(status_code=404, detail="Task not found")
        return {**tasks[task_id], "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting task status for {task_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Durum sorgulama hatası: {str(e)}")

@app.get("/api/v1/tasks/{task_id}/results")
async def get_task_results(task_id: str):
    try:
        if task_id not in tasks or tasks[task_id]["status"] != "completed":
            logger.warning(f"Results not ready for task {task_id}, status: {tasks.get(task_id, {}).get('status', 'unknown')}")
            raise HTTPException(status_code=400, detail="Results not ready or task failed")
        return tasks[task_id]["result"]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting task results for {task_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sonuç alma hatası: {str(e)}")


@app.post("/api/v1/phenotyping/analyze")
async def analyze_phenotyping(
    images: List[UploadFile] = File(...),
    group_name: List[str] = Form(...),
    timepoint: List[str] = Form(...),
    replicate_id: Optional[List[str]] = Form(None),
    pool_area_m2: float = Form(16.0),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
):
    try:
        logger.info(f"Starting phenotyping analysis, pool_area: {pool_area_m2} m²")
        try:
            parsed_start_date, parsed_end_date = phenotyping_service.validate_date_inputs(
                start_date=start_date,
                end_date=end_date,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if len(group_name) != len(images) or len(timepoint) != len(images):
            raise HTTPException(
                status_code=400,
                detail="group_name ve timepoint alanları, gönderilen images adediyle aynı uzunlukta olmalıdır.",
            )
        if replicate_id is not None and len(replicate_id) != len(images):
            raise HTTPException(
                status_code=400,
                detail="replicate_id gönderildiyse images adediyle aynı uzunlukta olmalıdır.",
            )

        results_with_meta: List[Dict[str, Any]] = []
        for idx, image in enumerate(images):
            contents = await image.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                logger.warning("Failed to decode phenotyping image: %s", image.filename)
                raise HTTPException(status_code=400, detail=f"Geçersiz görüntü dosyası: {image.filename}")

            result = phenotyping_service.analyze(
                img,
                pool_area_m2=pool_area_m2,
                start_date=parsed_start_date,
                end_date=parsed_end_date,
            )
            normalized_group_name = group_name[idx].strip()
            normalized_timepoint = timepoint[idx].strip().lower()
            normalized_replicate_id = (
                replicate_id[idx].strip() if replicate_id is not None and replicate_id[idx] is not None else None
            )

            results_with_meta.append({
                "file_name": image.filename,
                "group_name": normalized_group_name,
                "timepoint": normalized_timepoint,
                "replicate_id": normalized_replicate_id,
                "result": result,
            })

        group_comparisons = phenotyping_service.compute_group_comparisons(results_with_meta)

        response_payload = {
            "schema_version": "1.0.0",
            "data": {
                "results": results_with_meta,
                "group_comparisons": group_comparisons,
            },
        }
        logger.info("Phenotyping analysis completed successfully for %d images", len(images))
        return response_payload
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Phenotyping analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Fenotipleme analizi hatası: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
