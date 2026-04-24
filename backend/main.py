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

app = FastAPI(title="Azolla Early Stress Detection API", version="1.2.4")

# Global Registry
tasks = {}
CONFIG_PATH = "backend/config.yaml"
pipeline = AzollaPipeline(CONFIG_PATH)

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
        tasks[task_id]["status"] = "processing"
        frame_tuples = []
        
        for i, (img_file, ts) in enumerate(zip(images, timestamps)):
            # Read image
            contents = await img_file.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is not None:
                frame_tuples.append((img, ts))
            
            tasks[task_id]["progress"] = int((i / len(images)) * 50) # First 50% for loading

        # Run pipeline
        results = pipeline.run_series(frame_tuples, experiment_id)
        
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["progress"] = 100
        tasks[task_id]["result"] = results
        
    except Exception as e:
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)

@app.post("/api/v1/predict/series")
async def predict_series(
    background_tasks: BackgroundTasks, 
    images: List[UploadFile] = File(...), 
    timestamps: List[str] = File(...),
    experiment_id: Optional[str] = None
):
    task_id = str(uuid4())
    if not experiment_id:
        experiment_id = f"EXP-{datetime.now().strftime('%Y%Y%m%d-%H%M%S')}"
    
    tasks[task_id] = {"status": "queued", "progress": 0}
    background_tasks.add_task(process_series_task, task_id, experiment_id, images, timestamps)
    
    return {"task_id": task_id, "experiment_id": experiment_id}

@app.get("/api/v1/tasks/{task_id}/status", response_model=TaskStatus)
async def get_task_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return {**tasks[task_id], "task_id": task_id}

@app.get("/api/v1/tasks/{task_id}/results")
async def get_task_results(task_id: str):
    if task_id not in tasks or tasks[task_id]["status"] != "completed":
        raise HTTPException(status_code=400, detail="Results not ready or task failed")
    return tasks[task_id]["result"]

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
