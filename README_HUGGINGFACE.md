# Azolla Early Stress Detection System

An AI-powered system for early detection of stress in Azolla plants using computer vision and machine learning.

## Features

- **Image Processing**: Advanced segmentation and analysis of Azolla fronds
- **Stress Detection**: Early warning system for nutrient deficiency and environmental stress
- **Time Series Analysis**: Track plant health over time with multi-image support
- **Interactive Dashboard**: Real-time visualization of metrics and results

## Architecture

This application consists of:
- **Frontend**: React + Vite + TypeScript with TailwindCSS
- **Backend API**: Node.js/Express server with Python integration
- **Processing Pipeline**: Computer vision algorithms using OpenCV, scikit-image, and Cellpose

## Deployment on Hugging Face Spaces

This repository is configured for deployment on Hugging Face Spaces using Docker.

### Prerequisites

1. A Hugging Face account
2. Git LFS installed (`git lfs install`)

### Deployment Steps

1. Create a new Space on Hugging Face (https://huggingface.co/spaces)
   - Choose "Docker" as the SDK
   - Select your preferred hardware (CPU or GPU)

2. Clone your new Space repository:
   ```bash
   git clone https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME
   cd YOUR_SPACE_NAME
   ```

3. Copy all files from this repository to your Space:
   ```bash
   cp -r /path/to/this/repo/* /path/to/your/space/
   ```

4. Push to Hugging Face:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push
   ```

5. Your Space will automatically build and deploy!

### One-command deploy helper

From this repository root, you can push directly to your Space with:

```bash
bash scripts/deploy_to_hf_space.sh YOUR_USERNAME/YOUR_SPACE_NAME main
```

This avoids the common issue where files are committed locally but never pushed to the Space repo.

### Troubleshooting: "No application file"

If your Space shows **"No application file"** and there are no build logs:

1. Confirm these files are in the Space repo root on `main`:
   - `README.md` with YAML header containing `sdk: docker`
   - `Dockerfile`
2. Confirm YAML includes:
   - `app_port: 7860`
   - `app_file: Dockerfile`
3. Push directly to the Space remote and verify the latest commit appears in the **Files** tab.
4. If the Space was created with another SDK previously, set SDK to Docker again from Space settings (or recreate the Space as Docker).
5. Trigger a rebuild from **Settings → Factory reboot**.
6. If you see YAML parse errors, check `README.md` for unresolved merge markers like `<<<<<<<`, `=======`, `>>>>>>>` and remove them.

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.10+
- pip

### Installation

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Install Python dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:3000`

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/v1/predict/series` - Submit images for analysis
- `GET /api/v1/tasks/:id/status` - Check task status
- `GET /api/v1/tasks/:id/results` - Get analysis results
- `GET /api/v1/settings` - Get configuration
- `POST /api/v1/settings` - Update configuration

## Configuration

Edit `config.json` to customize processing parameters:
- Segmentation thresholds
- Color analysis settings
- Decision criteria for stress detection

Advanced configuration is available in `backend/config.yaml`.

## Project Structure

```
├── src/                  # Frontend React components
├── backend/              # Python processing pipeline
│   ├── main.py          # FastAPI server (alternative)
│   ├── bridge.py        # Python-Node.js bridge
│   ├── azolla_processor.py  # Core image processing
│   └── config.yaml      # Detailed configuration
├── server.ts            # Main Node.js server
├── config.json          # Application settings
└── Dockerfile           # Docker deployment config
```

## License

MIT

## Acknowledgments

Built with Google AI Studio and deployed on Hugging Face Spaces.
