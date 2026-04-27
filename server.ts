import express, { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import fs from "fs";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

// Load scientific configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf-8"));

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
    files: 100 // Max 100 files
  }
});

interface MulterRequest extends Request {
  files: Express.Multer.File[];
}

interface Task {
  id: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  results?: any;
  error?: string;
}

const tasks: Record<string, Task> = {};

// Logger helper
const logger = {
  info: (msg: string) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg: string) => process.env.DEBUG ? console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`) : undefined
};

async function startServer() {
  const app = express();
  // Hugging Face Spaces uses PORT environment variable (default 7860)
  const PORT = Number(process.env.PORT) || 7860;

  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ extended: true, limit: '500mb' }));

  // Request logger with more detail
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    });
    next();
  });

  // API Routes
  const apiRouter = express.Router();

  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ready", pipeline: "azolla_v1", gpu: false });
  });

  apiRouter.post("/v1/predict/series", (req, res, next) => {
    console.log("Processing upload request...");
    upload.array("images")(req, res, (err) => {
      if (err) {
        console.error("Multer Error Detail:", err);
        return res.status(400).json({ 
          error: "Dosya yükleme hatası", 
          details: err.message,
          code: (err as any).code
        });
      }
      next();
    });
  }, (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      console.log(`Received ${files?.length || 0} files`);
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const experimentId = req.body.experiment_id || uuidv4();
      const taskId = uuidv4();

      tasks[taskId] = { id: taskId, status: "processing", progress: 0 };

      // Run pipeline in background
      processImages(taskId, files).catch((err) => {
        console.error("Pipeline Error:", err);
        tasks[taskId].status = "failed";
        tasks[taskId].error = err.message;
      });

      res.json({ task_id: taskId, experiment_id: experimentId });
    } catch (err: any) {
      console.error("Route Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.get("/v1/settings", (req, res) => {
    try {
      const data = fs.readFileSync(path.join(process.cwd(), "config.json"), "utf-8");
      res.json(JSON.parse(data));
    } catch (err: any) {
      res.status(500).json({ error: "Could not read settings" });
    }
  });

  apiRouter.post("/v1/settings", (req, res) => {
    try {
      const newConfig = req.body;
      fs.writeFileSync(path.join(process.cwd(), "config.json"), JSON.stringify(newConfig, null, 2));
      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: "Could not save settings" });
    }
  });

  apiRouter.get("/v1/tasks/:id/status", (req, res) => {
    const task = tasks[req.params.id];
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  });

  apiRouter.get("/v1/tasks/:id/results", (req, res) => {
    const task = tasks[req.params.id];
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status !== "completed") return res.status(400).json({ error: "Task not finished" });
    res.json(task.results);
  });

  apiRouter.use((req, res) => {
    console.warn(`API 404: ${req.method} ${req.url}`);
    res.status(404).json({ error: "API endpoint not found", path: req.url });
  });

  app.use("/api", apiRouter);

  // Global Error Handler for whole app
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error("Global Express Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ 
      error: "Sistem hatası", 
      details: err.message,
      path: req.url,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Algorithmic Pipeline Implementation
import { spawn, execSync } from "child_process";

// Development-only fallback: attempt local pip install if explicitly enabled.
if (process.env.NODE_ENV !== "production" && process.env.ENABLE_RUNTIME_PIP === "1") {
  try {
    const libPath = path.join(process.cwd(), "backend", "lib");
    const markerPath = path.join(libPath, ".installed");

    if (!fs.existsSync(markerPath)) {
      console.log("Installing Python dependencies (Local Target)...");
      if (!fs.existsSync(libPath)) {
        fs.mkdirSync(libPath, { recursive: true });
      }
      execSync(`python3 -m pip install --target="${libPath}" opencv-python-headless Pillow exifread numpy`, { stdio: "inherit" });
      fs.writeFileSync(markerPath, new Date().toISOString());
      console.log("Python dependencies installed successfully.");
    } else {
      console.log("Python dependencies already installed (Local Target).");
    }
  } catch (e) {
    console.error("Warning: Python dependencies might be missing or pip failed:", e);
  }
}

async function runPythonPipeline(imageBuffer: Buffer, filename: string): Promise<any> {
  return new Promise((resolve, reject) => {
    logger.info(`Starting Python pipeline for ${filename}`);
    
    // Use explicit python3 path and set working directory for proper module resolution
    const python = spawn("python3", ["backend/bridge.py"], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONPATH: process.cwd() }
    });
    let output = "";
    let errorOutput = "";

    python.on("error", (err) => {
      logger.error(`Failed to start Python process: ${err.message}`);
      reject(new Error(`Python başlatılamadı: ${err.message}`));
    });

    python.stdin.on("error", (err) => {
      logger.error(`Python stdin error: ${err.message}`);
    });

    const base64Image = imageBuffer.toString('base64');
    
    // Get latest config
    const configPath = path.join(process.cwd(), "config.json");
    let processorConfig = {};
    try {
      const currentConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      processorConfig = currentConfig.azolla_processor || {};
    } catch (e) {
      logger.warn("Config read error, using defaults");
    }

    const inputData = JSON.stringify({
      image: base64Image,
      filename: filename,
      config: processorConfig
    });

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.stderr.on("data", (data) => {
      const stderrStr = data.toString();
      errorOutput += stderrStr;
      // Log Python stderr as info (it might just be logging)
      logger.debug(`Python stderr: ${stderrStr.trim()}`);
    });

    python.on("close", (code) => {
      if (code !== 0) {
        const errMsg = errorOutput || `Python script failed with code ${code}`;
        logger.error(`Python error [${filename}]: ${errMsg}`);
        return reject(new Error(errMsg));
      }
      try {
        if (!output.trim()) {
          throw new Error("Python script returned empty output");
        }
        const result = JSON.parse(output);
        if (result.status === "error") {
          logger.error(`Python processing error: ${result.message}`);
          return reject(new Error(result.message));
        }
        logger.info(`Python pipeline completed for ${filename}`);
        resolve(result);
      } catch (e: any) {
        logger.error(`Failed to parse Python output: ${e.message}`);
        logger.error(`Raw output: ${output.substring(0, 500)}`);
        reject(new Error(`Görüntü işleme çıktısı anlaşılamadı: ${output.substring(0, 100)}`));
      }
    });

    try {
      if (python.stdin && python.stdin.writable) {
        python.stdin.write(inputData);
        python.stdin.end();
        logger.debug(`Sent ${inputData.length} bytes to Python process`);
      } else {
        reject(new Error("Python stdin is not writable or already closed"));
      }
    } catch (writeErr: any) {
      logger.error(`Critical write error to python: ${writeErr.message}`);
      reject(new Error(`Python process write failure: ${writeErr.message}`));
    }
  });
}

async function processImages(taskId: string, files: Express.Multer.File[]) {
  const results = [];
  const total = files.length;
  let processingErrors = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      tasks[taskId].progress = Math.round((i / total) * 100);
      
      logger.info(`Processing file ${i+1}/${total}: ${file.originalname}`);
      
      const pythonRes = await runPythonPipeline(file.buffer, file.originalname);
      
      results.push({
        filename: file.originalname,
        timestamp: pythonRes.timestamp,
        status: "optimized",
        method: "AzollaProcessor-v1",
        errors: [],
        metrics: {
          coverage_pct: pythonRes.metrics?.area_ratio || 0,
          mean_stress_score: 1.0 - ((pythonRes.metrics?.g_ratio || 0) / 2.0),
          frond_count: Math.floor((pythonRes.metrics?.area_pixels || 0) / 400),
          early_stress_prob: (pythonRes.confidence || 0) < 0.5 ? 0.8 : 0.1,
          g_ratio: pythonRes.metrics?.g_ratio || 0,
          pixels: pythonRes.metrics?.area_pixels || 0
        },
        decision: {
          status: (pythonRes.metrics?.g_ratio || 0) < 1.2 ? "STRESSED" : "HEALTHY",
          rationale: (pythonRes.metrics?.g_ratio || 0) < 1.2 
            ? "G/R oranı düşük - Azot eksikliği veya stres belirtisi." 
            : "Normal klorofil aktivitesi.",
        },
        image_urls: {
          rgb: pythonRes.processed_image, 
          pseudocolor: pythonRes.mask_image,
          isolated: pythonRes.processed_image,
        },
        confidence: pythonRes.confidence || 0,
        context: pythonRes.context || {}
      });
      
      logger.info(`Successfully processed ${file.originalname}`);
      
    } catch (err: any) {
      logger.error(`Error processing file ${file.originalname}:`, err);
      
      // Add detailed error information
      const errorInfo = {
        filename: file.originalname,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        timestamp: new Date().toISOString()
      };
      
      processingErrors.push(errorInfo);
      
      // Still add a failed result entry
      results.push({
        filename: file.originalname,
        status: "failed",
        error: errorInfo,
        timestamp: new Date().toISOString()
      });
    }

    tasks[taskId].progress = Math.round(((i + 1) / total) * 100);
  }

  // Check if all files failed
  if (results.filter(r => r.status === "failed").length === total && total > 0) {
    tasks[taskId].status = "failed";
    tasks[taskId].error = `Hiçbir görüntü başarıyla işlenemedi (${total} dosya başarısız).`;
    tasks[taskId].results = {
      experiment_id: uuidv4(),
      timeline: results,
      errors: processingErrors,
      summary: {
        total: total,
        successful: 0,
        failed: total
      }
    };
    logger.error(`Task ${taskId} failed: All ${total} files failed processing`);
  } else {
    const successCount = results.filter(r => r.status !== "failed").length;
    const failedCount = results.filter(r => r.status === "failed").length;
    
    tasks[taskId].results = {
      experiment_id: uuidv4(),
      timeline: results,
      errors: processingErrors.length > 0 ? processingErrors : undefined,
      summary: {
        total: total,
        successful: successCount,
        failed: failedCount
      }
    };
    tasks[taskId].status = failedCount > 0 ? "completed_with_errors" : "completed";
    
    logger.info(`Task ${taskId} completed: ${successCount}/${total} successful`);
  }
}

startServer();
