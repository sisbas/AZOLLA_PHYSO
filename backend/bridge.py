import sys
import os
import json
import base64

# Add backend directory to path for imports
backend_dir = os.path.join(os.path.dirname(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import cv2
import numpy as np
from azolla_processor import AzollaProcessor

def main():
    try:
        # Read parameters from stdin (JSON)
        input_data = sys.stdin.read()
        if not input_data:
            return
        
        params = json.loads(input_data)
        image_b64 = params.get("image")
        filename = params.get("filename")
        config = params.get("config", {})
        
        if not image_b64:
            print(json.dumps({"error": "No image data provided"}))
            return

        # Decode image
        image_bytes = base64.b64decode(image_b64)
        
        # Process
        processor = AzollaProcessor(config=config)
        result = processor.run_pipeline(image_bytes, image_path=filename)
        
        # Encode result images back to base64
        _, buffer_processed = cv2.imencode(".jpg", result["processed_image"])
        processed_b64 = base64.b64encode(buffer_processed).decode("utf-8")
        
        _, buffer_mask = cv2.imencode(".jpg", result["mask"])
        mask_b64 = base64.b64encode(buffer_mask).decode("utf-8")
        
        # Return structured response
        response = {
            "status": "success",
            "metrics": result["metrics"],
            "processed_image": f"data:image/jpeg;base64,{processed_b64}",
            "mask_image": f"data:image/jpeg;base64,{mask_b64}",
            "confidence": result["confidence_score"],
            "timestamp": result["timestamp"]
        }
        print(json.dumps(response))
        
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))

if __name__ == "__main__":
    main()
