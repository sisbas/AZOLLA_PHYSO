#!/usr/bin/env python3
"""
Training pipeline for Azolla stress detection model.

Usage:
    python train_model.py --config configs/config.yaml
    python train_model.py --images_dir data/images --excel_dir data/excel
"""

import argparse
import logging
import yaml
from pathlib import Path
import sys

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.data.excel_loader import ExcelDataLoader
from src.data.image_loader import ImageDataLoader
from src.cv.pipeline import ImageProcessingPipeline
from src.ml.trainer import ModelTrainer
from src.data.preprocessor import DataPreprocessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_config(config_path: str) -> dict:
    """Load configuration from YAML file."""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser(description="Train Azolla stress detection model")
    parser.add_argument('--config', type=str, default='configs/config.yaml',
                       help='Path to config file')
    parser.add_argument('--images_dir', type=str, default='data/images',
                       help='Directory with images')
    parser.add_argument('--excel_dir', type=str, default='data/excel',
                       help='Directory with Excel files')
    parser.add_argument('--output_dir', type=str, default='models',
                       help='Output directory for trained model')
    parser.add_argument('--create_dummy', action='store_true',
                       help='Create dummy dataset if no images found')
    
    args = parser.parse_args()
    
    # Load config
    if Path(args.config).exists():
        config = load_config(args.config)
        logger.info(f"Loaded config from {args.config}")
    else:
        config = {}
        logger.warning("Config file not found, using defaults")
    
    # Create directories
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)
    Path(args.images_dir).mkdir(parents=True, exist_ok=True)
    Path(args.excel_dir).mkdir(parents=True, exist_ok=True)
    
    # Step 1: Process images
    logger.info("=" * 50)
    logger.info("Step 1: Processing Images")
    logger.info("=" * 50)
    
    pipeline = ImageProcessingPipeline(
        segmentation_method=config.get('segmentation', {}).get('method', 'adaptive')
    )
    
    # Check for images
    image_files = list(Path(args.images_dir).glob('*.png')) + \
                  list(Path(args.images_dir).glob('*.jpg'))
    
    if not image_files and args.create_dummy:
        logger.info("No images found, creating dummy dataset...")
        loader = ImageDataLoader(args.images_dir)
        image_files = loader.create_dummy_dataset(n_images=24)
    
    if image_files:
        results = pipeline.process_batch([str(p) for p in image_files])
        features_df = pipeline.get_features_dataframe()
        logger.info(f"Processed {len(results)} images")
        logger.info(f"Features shape: {features_df.shape}")
    else:
        logger.error("No images found! Use --create_dummy to generate test data")
        return
    
    # Step 2: Load Excel data
    logger.info("=" * 50)
    logger.info("Step 2: Loading Excel Data")
    logger.info("=" * 50)
    
    excel_files = list(Path(args.excel_dir).glob('*.xlsx')) + \
                  list(Path(args.excel_dir).glob('*.xls'))
    
    if excel_files:
        excel_loader = ExcelDataLoader(str(excel_files[0]))
        excel_loader.load().rename_columns().clean_data().compute_derived_metrics()
        excel_df = excel_loader.get_dataframe()
        logger.info(f"Loaded Excel data: {excel_df.shape}")
    else:
        logger.warning("No Excel files found. Creating synthetic labels...")
        # Create synthetic Excel data from image features
        excel_df = features_df[['treatment', 'replicate', 'day']].copy()
        excel_df['group_code'] = excel_df['treatment']
        excel_df['rgr'] = 0.1 + (excel_df['treatment'] == 'K').astype(float) * 0.05
        excel_df['rgr_deviation'] = -(excel_df['treatment'] != 'K').astype(float) * 0.2
        excel_df['total_chlorophyll'] = 2.0 + (excel_df['treatment'] == 'K').astype(float) * 0.5
    
    # Step 3: Prepare data
    logger.info("=" * 50)
    logger.info("Step 3: Preparing Training Data")
    logger.info("=" * 50)
    
    preprocessor = DataPreprocessor(random_state=42)
    
    X, y_class, y_reg, feature_names = preprocessor.prepare_training_data(
        features_df, excel_df
    )
    
    logger.info(f"Feature matrix: {X.shape}")
    logger.info(f"Classification targets: {y_class.shape}")
    logger.info(f"Regression targets: {y_reg.shape}")
    
    # Step 4: Train model
    logger.info("=" * 50)
    logger.info("Step 4: Training Model")
    logger.info("=" * 50)
    
    trainer = ModelTrainer(config=config)
    model = trainer.train(
        X, y_class, y_reg, feature_names,
        model_type=config.get('model', {}).get('type', 'xgboost')
    )
    
    # Step 5: Save model
    logger.info("=" * 50)
    logger.info("Step 5: Saving Model")
    logger.info("=" * 50)
    
    model_path = trainer.save_model(model, args.output_dir)
    logger.info(f"Model saved to: {model_path}")
    
    # Print evaluation results
    logger.info("\n" + "=" * 50)
    logger.info("Evaluation Results")
    logger.info("=" * 50)
    
    eval_results = trainer.evaluation_results
    if 'classification' in eval_results:
        logger.info(f"Accuracy: {eval_results['classification']['accuracy']:.3f}")
    
    logger.info("\nTraining complete!")


if __name__ == "__main__":
    main()
