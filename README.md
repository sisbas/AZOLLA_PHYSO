---
title: Azolla Early Stress Detection
emoji: 🌱
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
app_file: Dockerfile

codex/kontrol-et-huggingspace-yaplandrmasn-o6w4zt
app_file: Dockerfile

main

pinned: false
license: mit
---

# Azolla Early Stress Detection System

An AI-powered system for early detection of stress in Azolla plants using computer vision and machine learning.

## Features

- **Image Processing**: Advanced segmentation and analysis of Azolla fronds
- **Stress Detection**: Early warning system for nutrient deficiency and environmental stress
- **Time Series Analysis**: Track plant health over time with multi-image support
- **Interactive Dashboard**: Real-time visualization of metrics and results

## How to Use

1. Upload images of Azolla plants (single or multiple for time series)
2. The system will analyze the images using computer vision algorithms
3. View detailed metrics including:
   - Coverage percentage
   - Mean stress score
   - Frond count
   - Early stress probability
   - G/R ratio (Green/Red chlorophyll indicator)

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/v1/predict/series` - Submit images for analysis
- `GET /api/v1/tasks/:id/status` - Check task status
- `GET /api/v1/tasks/:id/results` - Get analysis results

## Configuration

Edit `config.json` to customize processing parameters directly from the UI.

## Local Development

See [README_HUGGINGFACE.md](README_HUGGINGFACE.md) for detailed deployment instructions.

## License

MIT
