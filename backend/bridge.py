import sys
import os
import json
import base64
import logging
import traceback
from datetime import datetime

# Add backend directory to path for imports
backend_dir = os.path.join(os.path.dirname(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Setup comprehensive logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("AzollaBridge")

import cv2
import numpy as np
from azolla_processor import AzollaProcessor, ProcessingError

def create_error_response(message: str, step: str = "unknown", details: dict = None) -> dict:
    """Standart hata yanıtı formatı"""
    return {
        "status": "error",
        "message": message,
        "step": step,
        "timestamp": datetime.now().isoformat(),
        "details": details or {},
        "remediation": "Lütfen giriş verisini kontrol edin ve tekrar deneyin."
    }

def main():
    context = {
        "start_time": datetime.now().isoformat(),
        "step": "initialization",
        "errors": [],
        "warnings": []
    }
    
    try:
        # Read parameters from stdin (JSON)
        context["step"] = "reading_input"
        input_data = sys.stdin.read()
        
        if not input_data.strip():
            logger.error("No input data received from stdin")
            print(json.dumps(create_error_response(
                "No input data provided",
                "input_reading",
                {"stdin_empty": True}
            )))
            return
        
        logger.info(f"Received input data ({len(input_data)} bytes)")
        
        try:
            params = json.loads(input_data)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON input: {str(e)}")
            print(json.dumps(create_error_response(
                f"Invalid JSON format: {str(e)}",
                "json_parsing",
                {"raw_input_length": len(input_data)}
            )))
            return
        
        image_b64 = params.get("image")
        filename = params.get("filename", "unknown")
        config = params.get("config", {})
        
        context["filename"] = filename
        context["config"] = config
        
        if not image_b64:
            logger.error("No image data in request")
            print(json.dumps(create_error_response(
                "No image data provided",
                "validation",
                {"received_keys": list(params.keys())}
            )))
            return
        
        # Decode image with error handling
        context["step"] = "decoding_image"
        try:
            image_bytes = base64.b64decode(image_b64)
            logger.info(f"Image decoded successfully ({len(image_bytes)} bytes)")
        except Exception as e:
            logger.error(f"Base64 decoding failed: {str(e)}")
            print(json.dumps(create_error_response(
                f"Image decoding failed: {str(e)}",
                "base64_decoding",
                {"error_type": type(e).__name__}
            )))
            return
        
        # Validate image data
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            test_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if test_img is None:
                raise ValueError("OpenCV could not decode the image")
            logger.info(f"Image validated: {test_img.shape}")
        except Exception as e:
            logger.error(f"Image validation failed: {str(e)}")
            print(json.dumps(create_error_response(
                f"Invalid image format: {str(e)}",
                "image_validation",
                {"filename": filename}
            )))
            return
        
        # Process with comprehensive error handling
        context["step"] = "processing"
        processor = None
        result = None
        
        try:
            processor = AzollaProcessor(config=config)
            logger.info("AzollaProcessor initialized")
            
            result = processor.run_pipeline(image_bytes, image_path=filename)
            logger.info("Pipeline completed successfully")
            
        except ProcessingError as e:
            # Custom processing error
            logger.error(f"Processing error: {str(e)}")
            print(json.dumps(create_error_response(
                str(e),
                "processing",
                {"error_type": "ProcessingError", "filename": filename}
            )))
            return
            
        except ImportError as e:
            logger.error(f"Import error: {str(e)}")
            print(json.dumps(create_error_response(
                f"Missing dependency: {str(e)}",
                "import",
                {"error_type": "ImportError", "remediation": "Check Python dependencies"}
            )))
            return
            
        except Exception as e:
            # Catch-all for unexpected errors
            stack_trace = traceback.format_exc()
            logger.error(f"Unexpected error: {str(e)}\n{stack_trace}")
            print(json.dumps(create_error_response(
                f"Unexpected error: {str(e)}",
                "unexpected",
                {
                    "error_type": type(e).__name__,
                    "filename": filename,
                    "traceback_available": True
                }
            )))
            return
        
        # Encode result images back to base64 with error handling
        context["step"] = "encoding_results"
        try:
            if result is None or "processed_image" not in result or "mask" not in result:
                raise ValueError("Pipeline did not return expected results")
            
            _, buffer_processed = cv2.imencode(".jpg", result["processed_image"])
            processed_b64 = base64.b64encode(buffer_processed).decode("utf-8")
            
            _, buffer_mask = cv2.imencode(".jpg", result["mask"])
            mask_b64 = base64.b64encode(buffer_mask).decode("utf-8")
            
            logger.info("Results encoded successfully")
            
        except Exception as e:
            logger.error(f"Result encoding failed: {str(e)}")
            print(json.dumps(create_error_response(
                f"Failed to encode results: {str(e)}",
                "result_encoding",
                {"error_type": type(e).__name__}
            )))
            return
        
        # Return structured response
        response = {
            "status": "success",
            "metrics": result.get("metrics", {}),
            "processed_image": f"data:image/jpeg;base64,{processed_b64}",
            "mask_image": f"data:image/jpeg;base64,{mask_b64}",
            "confidence": result.get("confidence_score", 0.0),
            "timestamp": result.get("timestamp", datetime.now().strftime('%Y-%m-%d %H:%M')),
            "context": {
                "processing_time_ms": (datetime.now() - datetime.fromisoformat(context["start_time"])).total_seconds() * 1000,
                "filename": filename,
                "warnings": context.get("warnings", [])
            }
        }
        
        logger.info(f"Response sent successfully (metrics: {result.get('metrics', {}).get('area_ratio', 0):.2f}%)")
        print(json.dumps(response))
        
    except KeyboardInterrupt:
        logger.warning("Process interrupted by user")
        print(json.dumps(create_error_response(
            "Process interrupted",
            "interrupt",
            {"type": "KeyboardInterrupt"}
        )))
        
    except Exception as e:
        # Ultimate catch-all for any unhandled errors
        stack_trace = traceback.format_exc()
        logger.critical(f"Critical unhandled error: {str(e)}\n{stack_trace}")
        print(json.dumps(create_error_response(
            f"Critical system error: {str(e)}",
            "critical",
            {
                "error_type": type(e).__name__,
                "traceback": stack_trace if os.environ.get('DEBUG') else None
            }
        )))

if __name__ == "__main__":
    main()
