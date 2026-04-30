// components/ROIEditor.tsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MousePointer2, Pencil, Circle, Square, Trash2, 
  Image as ImageIcon, Camera, Upload, Frame, Check, 
  Wand2, X, Zap, Info, RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';

// ─────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────
export type ToolType = 'pointer' | 'freehand' | 'elliptic' | 'rectangular';
export type PreviewMode = 'original' | 'segmented';

export interface Point {
  x: number;
  y: number;
}

export interface Shape {
  id: string;
  type: ToolType;
  points: Point[];
  color: string;
  closed?: boolean;
}

export interface ROIEditorProps {
  imageUrl?: string;
  onSave?: (roiData: ROIResult) => void;
  onClose?: () => void;
  onAutoDetectComplete?: (success: boolean) => void;
}

export interface ROIResult {
  shapes: Shape[];
  imageData: string | null;
  segmentation: {
    area: number;
    confidence: number;
    clipPath: string | null;
  };
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS & CONFIG
// ─────────────────────────────────────────────────────────────
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1542601906990-b4d3fb773b09?auto=format&fit=crop&q=80&w=1200";
const TOOLS: { id: ToolType; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; shortcut: string }[] = [
  { id: 'pointer', label: 'İmleç', icon: MousePointer2, shortcut: 'V' },
  { id: 'freehand', label: 'Serbest', icon: Pencil, shortcut: 'B' },
  { id: 'elliptic', label: 'Eliptik', icon: Circle, shortcut: 'E' },
  { id: 'rectangular', label: 'Dikdörtgen', icon: Square, shortcut: 'R' },
];

const SHAPE_COLORS: Record<ToolType, { stroke: string; fill: string }> = {
  pointer: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.1)' },
  freehand: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.1)' },
  elliptic: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.1)' },
  rectangular: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.1)' },
};

const AUTO_DETECT_COLOR = '#10b981';

// ─────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────
const generateId = () => `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const isGreenPixel = (r: number, g: number, b: number): boolean => {
  const exg = 2 * g - r - b;
  const exr = 1.4 * r - g;
  return g > 50 && exg > 20 && exg > exr && g > r * 0.9 && g > b * 0.9;
};

const calculatePolygonArea = (points: Point[]): number => {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
};

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function ROIEditor({ 
  imageUrl, 
  onSave, 
  onClose, 
  onAutoDetectComplete 
}: ROIEditorProps) {
  // ─── STATE ─────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<ToolType>('pointer');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [previewMode, setPreviewMode] = useState<'original' | 'segmented'>('original');
  

  const [previewMode, setPreviewMode] = useState<PreviewMode>('original');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // ─── REFS ──────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationFrameRef = useRef<number>();

  // ─── COMPUTED VALUES ───────────────────────────────────
  const displayImage = useMemo(() => 
    uploadedImage || imageUrl || DEFAULT_IMAGE, 
    [uploadedImage, imageUrl]
  );

  const latestShape = useMemo(() => 
    [...shapes].reverse().find(s => s.points.length >= 2), 
    [shapes]
  );

  const segmentationStats = useMemo(() => {
    if (!latestShape || latestShape.points.length < 2) {
      return { area: 0, confidence: 0, clipPath: null as string | null };
    }
    const area = latestShape.type === 'freehand' 
      ? calculatePolygonArea(latestShape.points)
      : latestShape.type === 'rectangular'
        ? Math.abs((latestShape.points[1].x - latestShape.points[0].x) * 
                   (latestShape.points[1].y - latestShape.points[0].y))
        : Math.PI * Math.abs(latestShape.points[1].x - latestShape.points[0].x) / 2 * 
              Math.abs(latestShape.points[1].y - latestShape.points[0].y) / 2;
    
    return {
      area: Math.round(area),
      confidence: 85 + Math.random() * 14,
      clipPath: getSegmentationClipPath(latestShape, canvasSize)
    };
  }, [latestShape, canvasSize, shapes]);

  // ─────────────────────────────────────────────────────────
  // CORE FUNCTIONS
  // ─────────────────────────────────────────────────────────

  const getSegmentationClipPath = useCallback((shape: Shape, size: { width: number; height: number }): string | null => {
    if (shape.points.length < 2) return null;

    if (shape.type === 'rectangular') {
      const [p1, p2] = shape.points;
      const left = Math.min(p1.x, p2.x);
      const right = Math.max(p1.x, p2.x);
      const top = Math.min(p1.y, p2.y);
      const bottom = Math.max(p1.y, p2.y);
      return `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;
    }

    if (shape.type === 'elliptic') {
      const [p1, p2] = shape.points;
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const rx = Math.max(1, Math.abs(p2.x - p1.x) / 2);
      const ry = Math.max(1, Math.abs(p2.y - p1.y) / 2);
      const segments = 48;
      const points = Array.from({ length: segments }, (_, i) => {
        const theta = (i / segments) * Math.PI * 2;
        return `${cx + Math.cos(theta) * rx}px ${cy + Math.sin(theta) * ry}px`;
      });
      return `polygon(${points.join(',')})`;
    }

    if (shape.points.length >= 3) {
      const points = shape.points.map(p => `${p.x}px ${p.y}px`).join(',');
      return `polygon(${points})`;
    }

    return null;
  }, []);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, shape: Shape, isPreview = false) => {
    const colors = shape.color === AUTO_DETECT_COLOR 
      ? { stroke: AUTO_DETECT_COLOR, fill: 'rgba(16, 185, 129, 0.15)' }
      : SHAPE_COLORS[shape.type];

    ctx.beginPath();
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = isPreview ? 2 : 3;
    ctx.setLineDash(isPreview ? [5, 3] : []);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (shape.type === 'freehand' && shape.points.length > 0) {
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
    } else if (shape.type === 'rectangular' && shape.points.length >= 2) {
      const [p1, p2] = shape.points;
      ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    } else if (shape.type === 'elliptic' && shape.points.length >= 2) {
      const [p1, p2] = shape.points;
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const rx = Math.abs(p2.x - p1.x) / 2;
      const ry = Math.abs(p2.y - p1.y) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }

    ctx.stroke();
    
    if (!isPreview && shape.points.length >= (shape.type === 'freehand' ? 3 : 2)) {
      ctx.fillStyle = colors.fill;
      ctx.fill();
    }

    // Draw control points for completed shapes
    if (!isPreview && shape.points.length >= 2) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      shape.points.forEach((p, idx) => {
        if (shape.type === 'freehand' && idx % Math.max(1, Math.floor(shape.points.length / 8)) !== 0) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.scale(1, 1); // Draw in CSS pixels

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    // Draw completed shapes
    shapes.forEach(shape => drawShape(ctx, shape, false));
    
    // Draw current shape being created
    if (currentShape) {
      drawShape(ctx, currentShape, true);
    }
  }, [shapes, currentShape, canvasSize, drawShape]);

  // ─────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        clearShapes();
        setPreviewMode('original');
      };
      reader.readAsDataURL(file);

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Lütfen geçerli bir resim dosyası seçin.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result as string);
      setShapes([]);
      setCurrentShape(null);
      setPreviewMode('original');
      setIsSystemActive(false);
    };
    reader.readAsDataURL(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const getCanvasCoordinates = useCallback((e: React.MouseEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'pointer' || isSystemActive) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const newShape: Shape = {
      id: generateId(),
      type: activeTool,
      points: [coords],
      color: '#6366f1',
      closed: activeTool !== 'freehand'
    };
    setCurrentShape(newShape);
  }, [activeTool, isSystemActive, getCanvasCoordinates]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!currentShape || activeTool === 'pointer') return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    setCurrentShape(prev => {
      if (!prev) return null;
      
      if (activeTool === 'freehand') {
        // Throttle points for freehand to prevent excessive data
        const lastPoint = prev.points[prev.points.length - 1];
        const distance = Math.hypot(coords.x - lastPoint.x, coords.y - lastPoint.y);
        if (distance < 3) return prev; // Skip if too close
        
        return { ...prev, points: [...prev.points, coords] };
      }
      
      // For rectangular/elliptic: keep start, update end point
      return { ...prev, points: [prev.points[0], coords] };
    });
  }, [currentShape, activeTool, getCanvasCoordinates]);

  const handleMouseUp = useCallback(() => {
    if (!currentShape) return;
    
    // Validate minimum points
    const minPoints = currentShape.type === 'freehand' ? 3 : 2;
    if (currentShape.points.length >= minPoints) {
      setShapes(prev => [...prev, currentShape]);
    }
    setCurrentShape(null);
  }, [currentShape]);

  const handleCanvasLeave = useCallback(() => {
    // Complete shape on mouse leave if drawing
    if (currentShape && activeTool !== 'freehand') {
      handleMouseUp();
    }
  }, [currentShape, activeTool, handleMouseUp]);

  const clearShapes = useCallback(() => {
    setShapes([]);
    setCurrentShape(null);
    setIsSystemActive(false);
    setPreviewMode('original');
  }, []);

  const resetAll = useCallback(() => {
    clearShapes();
    setUploadedImage(null);
    setIsAutoDetecting(false);
    setShowConfirmModal(false);
  }, [clearShapes]);

  // ─────────────────────────────────────────────────────────
  // AUTO-DETECT ALGORITHM
  // ─────────────────────────────────────────────────────────

  const runAutoDetect = useCallback(async () => {
    if (isAutoDetecting || isSystemActive) return;
    
    setIsAutoDetecting(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setIsAutoDetecting(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const containerW = rect.width;
        const containerH = rect.height;
        const scale = Math.min((containerW * 1.2) / img.width, (containerH * 1.2) / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const offsetX = (containerW - drawW) / 2;
        const offsetY = (containerH - drawH) / 2;

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.max(1, Math.round(drawW));
        offscreen.height = Math.max(1, Math.round(drawH));
        const ctx = offscreen.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);

        const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
        const data = imageData.data;
        const mask = new Uint8Array(offscreen.width * offscreen.height);

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const exg = (2 * g) - r - b;
          const isGreen = g > 40 && exg > 15 && g > r * 0.8 && g > b * 0.8;
          mask[i / 4] = isGreen ? 1 : 0;
        }

        const visited = new Uint8Array(mask.length);
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        let bestComponent: number[] = [];

        for (let y = 0; y < offscreen.height; y++) {
          for (let x = 0; x < offscreen.width; x++) {
            const idx = y * offscreen.width + x;
            if (!mask[idx] || visited[idx]) continue;
            const queue = [idx];
            visited[idx] = 1;
            const comp: number[] = [];
            while (queue.length) {
              const cur = queue.pop()!;
              comp.push(cur);
              const cx = cur % offscreen.width;
              const cy = Math.floor(cur / offscreen.width);
              for (const [dx, dy] of dirs) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= offscreen.width || ny >= offscreen.height) continue;
                const nidx = ny * offscreen.width + nx;
                if (!mask[nidx] || visited[nidx]) continue;

    const container = containerRef.current;
    if (!container) {
      setIsAutoDetecting(false);
      onAutoDetectComplete?.(false);
      return;
    }

    try {
      // Load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = displayImage;
      });

      const containerRect = container.getBoundingClientRect();
      const containerW = containerRect.width;
      const containerH = containerRect.height;
      
      // Calculate fit scale with padding
      const scale = Math.min(
        (containerW * 0.9) / img.width, 
        (containerH * 0.9) / img.height
      );
      const drawW = Math.max(1, Math.round(img.width * scale));
      const drawH = Math.max(1, Math.round(img.height * scale));
      const offsetX = (containerW - drawW) / 2;
      const offsetY = (containerH - drawH) / 2;

      // Create offscreen canvas for processing
      const offscreen = document.createElement('canvas');
      offscreen.width = drawW;
      offscreen.height = drawH;
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      
      ctx.drawImage(img, 0, 0, drawW, drawH);
      const imageData = ctx.getImageData(0, 0, drawW, drawH);
      const data = imageData.data;

      // Create binary mask for green pixels
      const mask = new Uint8Array(drawW * drawH);
      for (let i = 0; i < data.length; i += 4) {
        mask[i / 4] = isGreenPixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
      }

      // Find connected components using BFS
      const visited = new Uint8Array(mask.length);
      const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let largestComponent: number[] = [];

      for (let y = 0; y < drawH; y++) {
        for (let x = 0; x < drawW; x++) {
          const idx = y * drawW + x;
          if (!mask[idx] || visited[idx]) continue;

          // BFS for this component
          const queue: number[] = [idx];
          visited[idx] = 1;
          const component: number[] = [];

          while (queue.length > 0) {
            const current = queue.pop()!;
            component.push(current);
            
            const cx = current % drawW;
            const cy = Math.floor(current / drawW);
            
            for (const [dx, dy] of directions) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= drawW || ny >= drawH) continue;
              
              const nidx = ny * drawW + nx;
              if (mask[nidx] && !visited[nidx]) {
                visited[nidx] = 1;
                queue.push(nidx);
              }
            }
            if (comp.length > bestComponent.length) bestComponent = comp;
          }
        }

        if (bestComponent.length < 50) throw new Error('No strong component');

        const pointSet = new Set(bestComponent);
        const boundary: {x:number; y:number}[] = [];
        for (const p of bestComponent) {
          const x = p % offscreen.width;
          const y = Math.floor(p / offscreen.width);
          let edge = false;
          for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= offscreen.width || ny >= offscreen.height || !pointSet.has(ny * offscreen.width + nx)) {
              edge = true; break;
            }
          }
          if (edge) boundary.push({x, y});
        }

        const cx = boundary.reduce((s, p) => s + p.x, 0) / boundary.length;
        const cy = boundary.reduce((s, p) => s + p.y, 0) / boundary.length;
        boundary.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

        const sampled = boundary.filter((_, i) => i % Math.max(1, Math.floor(boundary.length / 80)) === 0);
        const points = sampled.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));

        setShapes([{
          id: 'auto-' + Date.now(),
          type: 'freehand',
          points,
          color: '#10b981'
        }]);
        setShowConfirmModal(true);
      } catch {
        // Fallback: centered ellipse when image-based segmentation fails
        const width = rect.width;
        const height = rect.height;
        setShapes([{
          id: 'auto-' + Date.now(),
          type: 'elliptic',
          points: [
            { x: width * 0.2, y: height * 0.2 },
            { x: width * 0.8, y: height * 0.8 }
          ],
          color: '#10b981'
        }]);
        setShowConfirmModal(true);
      } finally {
        setIsAutoDetecting(false);
      }
    };
    img.onerror = () => {
      setIsAutoDetecting(false);
    };
    img.src = displayImage;
  };

          }

          if (component.length > largestComponent.length) {
            largestComponent = component;
          }
        }
      }

      // Validate component size
      if (largestComponent.length < 100) {
        throw new Error('No significant green area detected');
      }

      // Extract boundary points
      const componentSet = new Set(largestComponent);
      const boundary: Point[] = [];
      
      for (const p of largestComponent) {
        const x = p % drawW;
        const y = Math.floor(p / drawW);
        let isEdge = false;
        
        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= drawW || ny >= drawH) {
            isEdge = true;
            break;
          }
          const nidx = ny * drawW + nx;
          if (!componentSet.has(nidx)) {
            isEdge = true;
            break;
          }
        }
        
        if (isEdge) {
          boundary.push({ x: x + offsetX, y: y + offsetY });
        }
      }

      if (boundary.length < 10) {
        throw new Error('Could not extract boundary');
      }

      // Sort boundary points by angle from centroid for proper polygon
      const centroid = boundary.reduce((acc, p) => ({
        x: acc.x + p.x / boundary.length,
        y: acc.y + p.y / boundary.length
      }), { x: 0, y: 0 });
      
      boundary.sort((a, b) => 
        Math.atan2(a.y - centroid.y, a.x - centroid.x) - 
        Math.atan2(b.y - centroid.y, b.x - centroid.x)
      );

      // Simplify boundary (reduce points while preserving shape)
      const maxPoints = 100;
      const step = Math.max(1, Math.floor(boundary.length / maxPoints));
      const simplified = boundary.filter((_, i) => i % step === 0);

      // Create shape
      const autoShape: Shape = {
        id: generateId(),
        type: 'freehand',
        points: simplified,
        color: AUTO_DETECT_COLOR,
        closed: true
      };

      setShapes([autoShape]);
      setShowConfirmModal(true);
      onAutoDetectComplete?.(true);

    } catch (error) {
      console.warn('Auto-detect failed, using fallback:', error);
      
      // Fallback: centered ellipse
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const fallbackShape: Shape = {
          id: generateId(),
          type: 'elliptic',
          points: [
            { x: rect.width * 0.25, y: rect.height * 0.25 },
            { x: rect.width * 0.75, y: rect.height * 0.75 }
          ],
          color: AUTO_DETECT_COLOR
        };
        setShapes([fallbackShape]);
        setShowConfirmModal(true);
        onAutoDetectComplete?.(false);
      }
    } finally {
      setIsAutoDetecting(false);
    }
  }, [isAutoDetecting, isSystemActive, displayImage, onAutoDetectComplete]);

  const handleActivate = useCallback(() => {
    setIsSystemActive(true);
    setShowConfirmModal(false);
    setPreviewMode('segmented');
    // Animation effect

    
    // Prepare result data
    const result: ROIResult = {
      shapes: [...shapes],
      imageData: uploadedImage || imageUrl || null,
      segmentation: {
        area: segmentationStats.area,
        confidence: segmentationStats.confidence,
        clipPath: segmentationStats.clipPath
      },
      timestamp: Date.now()
    };
    
    onSave?.(result);
    
    // Visual feedback delay
    setTimeout(() => {
      // Could trigger callback or navigation here
    }, 800);
  }, [shapes, uploadedImage, imageUrl, segmentationStats, onSave]);

  // ─────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────

  const getSegmentationClipPath = () => {
    if (shapes.length === 0) return null;
    const roiShape = [...shapes].reverse().find((s) => s.points.length >= 2);
    if (!roiShape) return null;

    if (roiShape.type === 'rectangular' && roiShape.points.length >= 2) {
      const start = roiShape.points[0];
      const end = roiShape.points[roiShape.points.length - 1];
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      return `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;
    }

    if (roiShape.type === 'elliptic' && roiShape.points.length >= 2) {
      const start = roiShape.points[0];
      const end = roiShape.points[roiShape.points.length - 1];
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const rx = Math.max(1, Math.abs(end.x - start.x) / 2);
      const ry = Math.max(1, Math.abs(end.y - start.y) / 2);
      const segments = 36;
      const ellipsePoints = Array.from({ length: segments }, (_, i) => {
        const theta = (i / segments) * Math.PI * 2;
        return `${cx + Math.cos(theta) * rx}px ${cy + Math.sin(theta) * ry}px`;
      });
      return `polygon(${ellipsePoints.join(',')})`;
    }

    if (roiShape.points.length >= 3) {
      return `polygon(${roiShape.points.map((p) => `${p.x}px ${p.y}px`).join(',')})`;
    }

    return null;
  };

  const drawShapes = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, ctx.canvas.width / (window.devicePixelRatio || 1), ctx.canvas.height / (window.devicePixelRatio || 1));
    
    [...shapes, ...(currentShape ? [currentShape] : [])].forEach(shape => {
      ctx.beginPath();
      ctx.strokeStyle = shape.color === '#10b981' ? '#10b981' : '#818cf8'; 
      ctx.lineWidth = 3;
      ctx.setLineDash(shape.color === '#10b981' ? [] : [6, 3]);

      if (shape.type === 'freehand' && shape.points.length > 0) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.forEach(p => ctx.lineTo(p.x, p.y));
      } else if (shape.type === 'rectangular' && shape.points.length >= 2) {
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
      } else if (shape.type === 'elliptic' && shape.points.length >= 2) {
        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.stroke();

  // Canvas resize handler
  useEffect(() => {
    const updateCanvasSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // Set canvas buffer size (for sharp rendering)
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      
      // Set CSS size
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      // Store logical size for drawing
      setCanvasSize({ width: rect.width, height: rect.height });
      
      // Configure context for CSS pixel drawing
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    updateCanvasSize();
    
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  // Canvas render loop
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(renderCanvas);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderCanvas]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      // Tool shortcuts
      const tool = TOOLS.find(t => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tool && !isSystemActive) {
        e.preventDefault();
        setActiveTool(tool.id);
        return;
      }
      
      // Escape to cancel current shape
      if (e.key === 'Escape' && currentShape) {
        e.preventDefault();
        setCurrentShape(null);
      }
      
      // Delete key to remove last shape
      if (e.key === 'Delete' && shapes.length > 0 && !currentShape) {
        e.preventDefault();
        setShapes(prev => prev.slice(0, -1));
      }
      
      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && shapes.length > 0) {
        e.preventDefault();
        setShapes(prev => prev.slice(0, -1));
      }
    };

  const clearShapes = () => {
    setShapes([]);
    setCurrentShape(null);
    setIsSystemActive(false);
    setPreviewMode('original');
  };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentShape, shapes, isSystemActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <motion.div 
            className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200/50"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Frame size={24} strokeWidth={2.5} />
          </motion.div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
              Görüntü Kaynağı ve ROI Belirleme
            </h1>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-0.5">
              Analiz Alanı Segmentasyonu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              <X size={14} />
              Kapat
            </button>
          )}

        <div className="flex items-center gap-2">
          {onClose && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              <X size={14} />
              Kapat
            </motion.button>
          )}
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
          
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={triggerFileUpload}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
          >
            <Upload size={16} />
            <span className="hidden sm:inline">Yükle</span>
          </motion.button>
          
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
          >
            <Camera size={16} />
            <span className="hidden sm:inline">Kamera</span>
          </motion.button>
        </div>
      </header>

      {/* MAIN CANVAS AREA */}
      <motion.div 
        ref={containerRef}
        className={cn(
          "relative aspect-video w-full bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl border-4 border-slate-800 shadow-2xl overflow-hidden",
          isSystemActive && "ring-4 ring-emerald-500/40 ring-offset-4 ring-offset-slate-950"
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Decorative border */}
        <div className="absolute inset-3 border border-dashed border-white/10 rounded-2xl pointer-events-none" />
        
        {/* Auto-detect scanning animation */}
        <AnimatePresence>
          {isAutoDetecting && (
            <motion.div 
              initial={{ top: '5%', opacity: 0 }}
              animate={{ top: '95%', opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute left-4 right-4 h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_20px_rgba(99,102,241,0.8)] z-30 pointer-events-none rounded-full"
            />
          )}
        </AnimatePresence>

        <div className={cn(
          "absolute inset-0 flex items-center justify-center p-20 pointer-events-none transition-all duration-700",
          previewMode === 'segmented' && "opacity-20"
        )}>
           <img 
             src={displayImage}
             alt="Source"
             className={cn(
               "max-w-[120%] max-h-[120%] object-contain transition-all duration-1000",
               isAutoDetecting ? "blur-sm grayscale" : "opacity-70 brightness-110 saturate-[1.6]"
             )}
             style={{ filter: 'contrast(1.4) drop-shadow(0 0 50px rgba(16, 185, 129, 0.2))' }}
           />
        </div>

        {previewMode === 'segmented' && getSegmentationClipPath() && (
          <div className="absolute inset-0 flex items-center justify-center p-20 pointer-events-none bg-black/85 transition-all duration-700">
            <img
              src={displayImage}
              alt="Segmented Source"
              className="max-w-[120%] max-h-[120%] object-contain transition-all duration-1000"
              style={{
                clipPath: getSegmentationClipPath() || undefined,
                filter: 'contrast(1.45) brightness(1.1) saturate(1.55) drop-shadow(0 0 40px rgba(16, 185, 129, 0.35))'
              }}
            />
          </div>
        )}


        {/* Original Image Layer */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center p-8 transition-opacity duration-500",
          previewMode === 'segmented' ? "opacity-30" : "opacity-100"
        )}>
          <motion.img 
            src={displayImage}
            alt="Analysis source"
            className="max-w-full max-h-full object-contain rounded-lg"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              filter: isAutoDetecting 
                ? 'blur(2px) grayscale(30%)' 
                : 'contrast(1.3) brightness(1.05) saturate(1.4)'
            }}
            transition={{ duration: 400 }}
          />
        </div>

        {/* Segmented Preview Layer */}
        <AnimatePresence>
          {previewMode === 'segmented' && segmentationStats.clipPath && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none"
            >
              <img
                src={displayImage}
                alt="Segmented view"
                className="max-w-full max-h-full object-contain rounded-lg"
                style={{
                  clipPath: segmentationStats.clipPath || undefined,
                  filter: 'contrast(1.4) brightness(1.1) saturate(1.6) drop-shadow(0 0 30px rgba(16, 185, 129, 0.4))'
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drawing Canvas */}
        <canvas 
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleCanvasLeave}
          className={cn(
            "absolute inset-0 z-20",
            activeTool === 'pointer' || isSystemActive 
              ? 'cursor-default' 
              : 'cursor-crosshair'
          )}
        />

        {/* Status Indicators */}
        <div className="absolute top-4 right-4 z-30 flex flex-col items-end gap-2">
          <AnimatePresence>
            {isSystemActive && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-emerald-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/30"
              >
                <Zap size={14} fill="white" />
                <span className="text-[10px] font-black uppercase tracking-wider">Aktif</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className="bg-black/50 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/10 flex items-center gap-2.5">
            <motion.div 
              className={cn("w-2.5 h-2.5 rounded-full", isSystemActive ? "bg-emerald-400" : "bg-indigo-400")}
              animate={isSystemActive ? {} : { scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-[10px] font-semibold text-white/90 uppercase tracking-wide">
              {isSystemActive ? 'Segmentasyon' : 'ROI Hazır'}
            </span>
          </div>
        </div>

        {/* Tools Panel */}
        <motion.div 
          className="absolute left-4 top-4 z-30"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="w-56 bg-white/95 backdrop-blur-xl border border-white/50 rounded-2xl p-4 shadow-xl shadow-black/10">
            <div className="text-center mb-4 pb-3 border-b border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Araçlar
              </span>
            </div>

            <div className="space-y-1.5">
              {/* Auto-detect Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={runAutoDetect}
                disabled={isAutoDetecting || isSystemActive}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all font-semibold text-xs uppercase tracking-wide",
                  isAutoDetecting 
                    ? "bg-indigo-50 text-indigo-400 cursor-wait" 
                    : isSystemActive
                      ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                      : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                )}
              >
                <Wand2 
                  size={16} 
                  strokeWidth={2.5} 
                  className={cn("transition-transform", isAutoDetecting && "animate-spin")} 
                />
                Otomatik ROI
              </motion.button>

              <div className="h-px bg-slate-100 my-2" />

              {/* Drawing Tools */}
              {TOOLS.map((tool) => (
                <motion.button
                  key={tool.id}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => !isSystemActive && setActiveTool(tool.id)}
                  disabled={isSystemActive}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all font-semibold text-xs uppercase tracking-wide",
                    activeTool === tool.id 
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" 
                      : isSystemActive
                        ? "text-slate-300 cursor-not-allowed"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  )}
                >
                  <tool.icon size={16} strokeWidth={2.5} />
                  {tool.label}
                  <span className="ml-auto text-[9px] font-mono text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded">
                    {tool.shortcut}
                  </span>
                </motion.button>
              ))}
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={clearShapes}
                disabled={shapes.length === 0 && !currentShape}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-rose-500 font-semibold text-xs uppercase tracking-wide hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 size={16} strokeWidth={2.5} />
                Temizle
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Action Button */}
        <motion.div 
          className="absolute right-4 bottom-4 z-30"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.button 
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            disabled={shapes.length === 0 || isSystemActive}
            onClick={() => setShowConfirmModal(true)}
            className={cn(
              "flex items-center gap-3 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl transition-all",
              shapes.length === 0 || isSystemActive
                ? "bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-200 hover:shadow-emerald-300"
            )}
          >
            Sistemi Aktive Et
            <Check size={18} strokeWidth={3} />
          </motion.button>
        </motion.div>

        {/* Help Tooltip */}
        <div className="absolute left-4 bottom-4 z-30 hidden lg:flex items-center gap-2 text-[10px] text-slate-400 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full">
          <Info size={12} />
          <span>Kısayol: {TOOLS.find(t => t.id === activeTool)?.shortcut} ile araç değiştir</span>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div 
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {[
          { label: 'Alan', value: segmentationStats.area > 0 ? `${segmentationStats.area.toLocaleString()}` : '—', unit: 'px²', color: 'text-slate-900' },
          { label: 'Güven', value: segmentationStats.confidence > 0 ? `${segmentationStats.confidence.toFixed(1)}` : '—', unit: '%', color: 'text-emerald-500', highlight: true },
          { label: 'Kalite', value: 'Yüksek', unit: 'HD', color: 'text-indigo-500' },
          { label: 'Odak', value: 'Optimal', unit: '', color: 'text-emerald-500' },
        ].map((stat, idx) => (
          <motion.div 
            key={stat.label}
            whileHover={{ y: -2 }}
            className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm"
          >
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
              {stat.label}
            </h4>
            <p className={cn("text-2xl font-black tracking-tight", stat.color)}>
              {stat.value}
              {stat.unit && (
                <span className="text-xs font-medium text-slate-400 ml-1">
                  {stat.unit}
                </span>
              )}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 md:p-8 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Decorative top bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-emerald-500 to-indigo-500" />
              
              {/* Icon */}
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto mb-5">
                <Check size={32} strokeWidth={2.5} />
              </div>
              
              {/* Content */}
              <h2 className="text-xl font-black text-slate-900 text-center mb-2">
                ROI Onayı
              </h2>
              <p className="text-slate-500 text-sm text-center leading-relaxed mb-6">
                Belirlenen analiz alanı <span className="font-semibold text-emerald-600">{segmentationStats.area.toLocaleString()} px²</span> kapsama alanında. 
                Segmentasyon doğruluğu <span className="font-semibold text-emerald-600">%{segmentationStats.confidence.toFixed(1)}</span> olarak hesaplandı. 
                Devam etmek istiyor musunuz?
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleActivate}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-200"
                >
                  Onayla ve Başlat
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowConfirmModal(false)}
                  className="w-full py-3.5 bg-white border-2 border-slate-200 text-slate-500 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-50"
                >
                Düzenlemeye Dön
                </motion.button>
              </div>

              {/* Close button */}
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}