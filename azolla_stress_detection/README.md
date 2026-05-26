# Azolla Early Stress Detection System

## Overview
A complete, modular, production-ready Python system for early stress detection in Azolla plants using RGB image analysis combined with experimental tabular data from Excel files.

## Project Structure
```
azolla_stress_detection/
├── src/
│   ├── data/           # Data loading and preprocessing
│   ├── cv/             # Computer vision modules
│   ├── ml/             # Machine learning models
│   └── dashboard/      # Streamlit dashboard
├── configs/            # Configuration files
├── notebooks/          # Jupyter notebooks for exploration
├── data/
│   ├── images/         # Input RGB images
│   ├── excel/          # Excel data files
│   └── processed/      # Processed outputs
├── models/             # Trained model checkpoints
└── docs/               # Documentation
```

## Installation

### Prerequisites
- Python 3.10+
- pip or conda

### Install Dependencies
```bash
pip install -r requirements.txt
```

## Quick Start

### 1. Prepare Your Data
- Place RGB images in `data/images/`
- Place Excel file with treatment data in `data/excel/`

### 2. Run Training Pipeline
```bash
python src/ml/train_model.py --config configs/config.yaml
```

### 3. Launch Dashboard
```bash
streamlit run src/dashboard/app.py
```

## Data Format

### Image Requirements
- Format: RGB (JPEG, PNG, TIFF)
- Naming convention: `{treatment}_{replicate}_{day}.png` (e.g., `K_1_day0.png`)
- Recommended resolution: 640x480 or higher

### Excel Schema
The Excel file should contain the following columns:
- **Metadata**: Grup Kodu, Grup Adı, Tekrar, Deney Süresi (7 gün)
- **Biomass**: Başlangıç Azolla (g), Net Hasat Ağırlığı (g), Mutlak Büyüme (g), Büyüme (%), RGR (g g⁻¹ gün⁻¹)
- **Pigments**: Klorofil a, Klorofil b, Toplam Klorofil, Karotenoid (mg/g FW)
- **Spectral**: Abs470, Abs646, Abs663 (blank-corrected averages)

### Treatment Groups
- K (Control)
- Gd
- Gd+BR10^-7
- Gd+BR10^-8
- Gd+BR10^-9
- BR10^-7
- BR10^-8
- BR10^-9

## Feature Mapping: Excel ↔ RGB

| Excel Metric | RGB Proxy Features |
|-------------|-------------------|
| Chlorophyll a/b | ExG, VARI, Green-Magenta Index |
| Carotenoids | ExR, Yellowness Index, Blue-Yellow Ratio |
| RGR & Growth % | ΔArea, ΔGreenness over time |
| Biomass | Frond area, perimeter |

## Modules

### Image Processing (`src/cv/`)
- Adaptive thresholding segmentation
- Morphological operations
- Feature extraction (ExG, VARI, GLI, LAB, GLCM)

### Machine Learning (`src/ml/`)
- Random Forest / XGBoost classifiers
- Regression heads for RGR prediction
- Model calibration with Excel data

### Dashboard (`src/dashboard/`)
- Image upload and processing
- Real-time stress prediction
- Time-series visualization
- Analysis page with tabular exports

## Configuration
Edit `configs/config.yaml` to customize:
- Image processing parameters
- Model hyperparameters
- Threshold values
- Output paths

## API Usage

```python
from src.cv.segmentation import segment_azolla
from src.cv.features import extract_features
from src.ml.predictor import StressPredictor

# Load and process image
image = load_image("path/to/image.png")
mask = segment_azolla(image)
features = extract_features(image, mask)

# Predict stress
predictor = StressPredictor.load("models/stress_model.pkl")
prediction = predictor.predict(features)
print(f"Stress Score: {prediction['stress_score']}")
print(f"Stress Class: {prediction['stress_class']}")
```

## License
MIT License

## Contact
For questions and support, please open an issue on the repository.

## Runnable Mini Package (Hızlı Başlangıç)

Aşağıdaki komut ile örnek veri üzerinde hızlı analiz alabilirsiniz:

```bash
cd azolla_stress_detection
python -m src.run_mini_package --data data/excel/sample_azolla.csv --out reports/sample_run
```

Üretilen çıktılar:
- `group_summary.csv`
- `anova_rgr.csv`
- `anova_total_chlorophyll.csv`
- `gd_br_pairwise_rgr.csv`
- `report.json`

Kendi verinizi çalıştırmak için `--data` parametresine CSV dosya yolunu verin.
