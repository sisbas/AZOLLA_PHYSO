# filepath: backend/main.py
import uvicorn
import shutil
import os
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path
from uuid import uuid4
from datetime import datetime
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
    timestamps: List[str] = File(...),
    experiment_id: Optional[str] = None
):
    try:
        task_id = str(uuid4())
        if not experiment_id:
            experiment_id = f"EXP-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        logger.info(f"Creating new task {task_id} for experiment {experiment_id} with {len(images)} images")
        tasks[task_id] = {"status": "queued", "progress": 0}
        background_tasks.add_task(process_series_task, task_id, experiment_id, images, timestamps)
        
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
async def analyze_phenotyping(image: UploadFile = File(...), pool_area_m2: float = 16.0):
    try:
        logger.info(f"Starting phenotyping analysis, pool_area: {pool_area_m2} m²")
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            logger.warning("Failed to decode phenotyping image")
            raise HTTPException(status_code=400, detail="Geçersiz görüntü dosyası.")
        
        result = phenotyping_service.analyze(img, pool_area_m2=pool_area_m2)
        logger.info("Phenotyping analysis completed successfully")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Phenotyping analysis failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Fenotipleme analizi hatası: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
