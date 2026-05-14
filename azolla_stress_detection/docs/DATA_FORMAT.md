# Data Formatting Guide

## Image Requirements

### File Format
- **Supported formats**: PNG, JPG, JPEG, TIFF, BMP
- **Recommended format**: PNG (lossless compression)
- **Color space**: RGB (standard color images)

### Resolution
- **Minimum**: 640x480 pixels
- **Recommended**: 1280x960 or higher
- Images will be automatically resized to 640x480 for processing

### Naming Convention
Images must follow this naming pattern for automatic metadata extraction:

```
{treatment}_{replicate}_day{N}.{ext}
```

**Examples:**
- `K_1_day0.png` - Control group, replicate 1, day 0
- `Gd_2_day3.jpg` - Gd treatment, replicate 2, day 3
- `Gd+BR10^-7_1_day5.png` - Combined treatment, replicate 1, day 5

### Treatment Group Codes
| Code | Description |
|------|-------------|
| K | Control (Kontrol) |
| Gd | Gadolinium treatment |
| Gd+BR10^-7 | Gd + Brassinosteroid 10^-7 M |
| Gd+BR10^-8 | Gd + Brassinosteroid 10^-8 M |
| Gd+BR10^-9 | Gd + Brassinosteroid 10^-9 M |
| BR10^-7 | Brassinosteroid 10^-7 M only |
| BR10^-8 | Brassinosteroid 10^-8 M only |
| BR10^-9 | Brassinosteroid 10^-9 M only |

### Image Quality Guidelines
1. **Lighting**: Consistent, diffuse lighting (avoid harsh shadows)
2. **Background**: High contrast background (white or black recommended)
3. **Focus**: Sharp focus on Azolla fronds
4. **Coverage**: 20-80% of image should contain plant material
5. **Orientation**: Consistent camera angle across all images

---

## Excel Data Format

### Required Columns

#### Metadata Columns
| Column Name (Turkish) | Standard Name | Description |
|----------------------|---------------|-------------|
| Grup Kodu | group_code | Treatment group code (K, Gd, etc.) |
| Grup Adı | group_name | Full treatment name |
| Tekrar | replicate | Replicate number (1, 2, 3...) |
| Deney Süresi | experiment_duration | Experiment duration in days |

#### Biomass Columns
| Column Name (Turkish) | Standard Name | Unit | Description |
|----------------------|---------------|------|-------------|
| Başlangıç Azolla (g) | initial_biomass | grams | Initial wet weight |
| Net Hasat Ağırlığı (g) | net_harvest_weight | grams | Final harvested weight |
| Mutlak Büyüme (g) | absolute_growth | grams | Absolute growth |
| Büyüme (%) | growth_percentage | percent | Growth percentage |
| RGR (g g⁻¹ gün⁻¹) | rgr | g/g/day | Relative Growth Rate |

#### Pigment Columns
| Column Name (Turkish) | Standard Name | Unit | Description |
|----------------------|---------------|------|-------------|
| Klorofil a | chlorophyll_a | mg/g FW | Chlorophyll a content |
| Klorofil b | chlorophyll_b | mg/g FW | Chlorophyll b content |
| Toplam Klorofil | total_chlorophyll | mg/g FW | Total chlorophyll |
| Karotenoid (mg/g FW) | carotenoids | mg/g FW | Carotenoid content |

#### Spectral Columns
| Column Name | Standard Name | Description |
|------------|---------------|-------------|
| Abs470 | absorbance_470 | Absorbance at 470nm |
| Abs646 | absorbance_646 | Absorbance at 646nm |
| Abs663 | absorbance_663 | Absorbance at 663nm |

### Example Excel Structure

```
| Grup Kodu | Grup Adı | Tekrar | Başlangıç Azolla (g) | Net Hasat Ağırlığı (g) | RGR (g g⁻¹ gün⁻¹) | Klorofil a | Klorofil b | Toplam Klorofil | Karotenoid (mg/g FW) |
|-----------|----------|--------|---------------------|----------------------|------------------|------------|------------|-----------------|---------------------|
| K         | Control  | 1      | 5.0                 | 12.5                 | 0.131            | 2.45       | 1.23       | 3.68            | 0.52                |
| K         | Control  | 2      | 5.0                 | 12.8                 | 0.134            | 2.51       | 1.28       | 3.79            | 0.55                |
| Gd        | Gd       | 1      | 5.0                 | 10.2                 | 0.101            | 1.98       | 0.95       | 2.93            | 0.41                |
...
```

### File Location
Place Excel files in: `data/excel/`

---

## Feature Mapping: Excel ↔ RGB

The system maps Excel measurements to RGB-derived features for calibration:

### Chlorophyll Mapping
| Excel Metric | RGB Proxy Features | Correlation |
|-------------|-------------------|-------------|
| Chlorophyll a | ExG, VARI, GMI | High positive |
| Chlorophyll b | ExG, GLI | Moderate positive |
| Total Chlorophyll | ExG + VARI combined | High positive |

### Carotenoid Mapping
| Excel Metric | RGB Proxy Features | Correlation |
|-------------|-------------------|-------------|
| Carotenoids | ExR, YI, BYR | Moderate positive |
| Yellowing | YI increase, ExG decrease | High negative |

### Growth Mapping
| Excel Metric | RGB Proxy Features |
|-------------|-------------------|
| RGR | ΔArea_ratio over time |
| Growth % | ΔGreenness over time |
| Biomass | Area, perimeter |

### Formulas

**ExG (Excess Green Index)**: `2*G - R - B`
- Primary chlorophyll proxy
- Range: -1 to 1 (higher = greener)

**VARI (Visible Atmospherically Resistant Index)**: `(G - R) / (G + R - B)`
- Chlorophyll content indicator
- Range: -1 to 1

**GMI (Green-Magenta Index)**: `G / (R + B)`
- Strong chlorophyll correlation
- Higher values = more chlorophyll

**YI (Yellowness Index)**: `(R + G) / B`
- Carotenoid/senescence indicator
- Higher values = more yellowing

---

## Directory Structure

```
azolla_stress_detection/
├── data/
│   ├── images/           # Place RGB images here
│   │   ├── K_1_day0.png
│   │   ├── K_1_day1.png
│   │   ├── Gd_1_day0.png
│   │   └── ...
│   ├── excel/            # Place Excel files here
│   │   └── treatment_data.xlsx
│   └── processed/        # Output directory
│       └── results.csv
├── models/               # Trained models saved here
└── configs/
    └── config.yaml
```

---

## Quick Start Checklist

1. [ ] Collect RGB images following naming convention
2. [ ] Prepare Excel file with treatment data
3. [ ] Place files in appropriate directories
4. [ ] Run training: `python train_model.py --create_dummy`
5. [ ] Launch dashboard: `streamlit run src/dashboard/app.py`
