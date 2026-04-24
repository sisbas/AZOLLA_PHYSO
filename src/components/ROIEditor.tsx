import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MousePointer2, 
  Pencil, 
  Circle, 
  Square, 
  Trash2, 
  Image as ImageIcon, 
  Camera, 
  Upload, 
  Frame,
  Check,
  Wand2,
  X,
  Zap,
  Info
} from 'lucide-react';
import { cn } from '../App';

type Tool = 'pointer' | 'freehand' | 'elliptic' | 'rectangular';

interface Shape {
  id: string;
  type: Tool;
  points: { x: number; y: number }[];
  color: string;
}

interface ROIEditorProps {
  imageUrl?: string;
  onSave?: (roiData: any) => void;
  onClose?: () => void;
}

export default function ROIEditor({ imageUrl, onSave, onClose }: ROIEditorProps) {
  const [activeTool, setActiveTool] = useState<Tool>('pointer');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSystemActive, setIsSystemActive] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const displayImage = uploadedImage || imageUrl || "https://images.unsplash.com/photo-1542601906990-b4d3fb773b09?auto=format&fit=crop&q=80&w=1200";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        clearShapes();
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const runAutoDetect = () => {
    setIsAutoDetecting(true);
    // Simulate AI pixel-level segmentation
    setTimeout(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const width = rect.width;
      const height = rect.height;
      const cx = width / 2;
      const cy = height / 2;
      
      // Generate an "organic" plant shape (rough convex hull simulation)
      const points: { x: number; y: number }[] = [];
      const numPoints = 24; // High resolution for the polygon
      const baseRadius = Math.min(width, height) * 0.32;
      
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        // Add "leafy" jitter to the radius
        const jitter = (Math.sin(angle * 5) * 25) + (Math.cos(angle * 3) * 15) + (Math.random() * 10);
        const r = baseRadius + jitter;
        points.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r
        });
      }
      
      const autoShape: Shape = {
        id: 'auto-' + Date.now(),
        type: 'freehand',
        points: points,
        color: '#10b981'
      };
      
      setShapes([autoShape]);
      setIsAutoDetecting(false);
      setShowConfirmModal(true);
    }, 1800);
  };

  const handleActivate = () => {
    setIsSystemActive(true);
    setShowConfirmModal(false);
    // Animation effect
    setTimeout(() => {
      // Small feedback alert or redirect
    }, 1000);
  };

  const tools = [
    { id: 'pointer' as Tool, label: 'İmleç', icon: MousePointer2 },
    { id: 'freehand' as Tool, label: 'Serbest', icon: Pencil },
    { id: 'elliptic' as Tool, label: 'Eliptik', icon: Circle },
    { id: 'rectangular' as Tool, label: 'Dikdörtgen', icon: Square },
  ];

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
      
      if (!currentShape || shape.id !== currentShape.id) {
        ctx.fillStyle = shape.color === '#10b981' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)';
        ctx.fill();
      }
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawShapes(ctx);
  }, [shapes, currentShape]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pointer' || isSystemActive) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentShape({
      id: Math.random().toString(),
      type: activeTool,
      points: [{ x, y }],
      color: '#6366f1'
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!currentShape || activeTool === 'pointer') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentShape(prev => prev ? {
      ...prev,
      points: activeTool === 'freehand' ? [...prev.points, { x, y }] : [prev.points[0], { x, y }]
    } : null);
  };

  const handleMouseUp = () => {
    if (!currentShape) return;
    setShapes(prev => [...prev, currentShape]);
    setCurrentShape(null);
  };

  const clearShapes = () => {
    setShapes([]);
    setCurrentShape(null);
    setIsSystemActive(false);
  };

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current && containerRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width * dpr;
        canvasRef.current.height = rect.height * dpr;
        canvasRef.current.style.width = `${rect.width}px`;
        canvasRef.current.style.height = `${rect.height}px`;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
          drawShapes(ctx);
        }
      }
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100 ring-4 ring-indigo-50">
            <Frame size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase">
              1. Görüntü Kaynağı ve "Rose" ROI
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Analiz Alanı Belirleme ve Veri Segmentasyonu</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />
          <button 
            onClick={triggerFileUpload}
            className="flex items-center gap-3 px-8 py-3 bg-white border-2 border-slate-100 text-slate-500 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all group active:scale-95"
          >
            <Upload size={18} className="group-hover:-translate-y-0.5 transition-transform" />
            Dosya Yükle
          </button>
          <button className="flex items-center gap-3 px-8 py-3 bg-white border-2 border-slate-100 text-slate-500 rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all group active:scale-95">
            <Camera size={18} className="group-hover:scale-110 transition-transform" />
            Kamera
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className={cn(
          "relative aspect-video w-full bg-[#050505] rounded-[40px] border-[12px] border-slate-900 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden transition-all duration-700",
          isSystemActive ? "ring-[12px] ring-emerald-500/30" : "ring-0"
        )}
      >
        <div className="absolute inset-4 border-2 border-dashed border-white/20 rounded-[28px] pointer-events-none z-30" />
        
        {isAutoDetecting && (
          <motion.div 
            initial={{ top: '0%' }}
            animate={{ top: '100%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-2 bg-indigo-500/50 shadow-[0_0_40px_rgba(99,102,241,1)] z-40 pointer-events-none"
          />
        )}

        <div className="absolute inset-0 flex items-center justify-center p-20 pointer-events-none">
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

        <canvas 
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className={cn(
            "absolute inset-0 z-50",
            activeTool === 'pointer' ? 'cursor-default' : 'cursor-crosshair',
            isSystemActive && "pointer-events-none"
          )}
        />

        {/* Status indicator Overlay */}
        <div className="absolute top-10 right-10 z-40 flex flex-col items-end gap-3">
          {isSystemActive && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-emerald-500 text-white px-6 py-2.5 rounded-2xl flex items-center gap-3 shadow-2xl shadow-emerald-200"
            >
              <Zap size={16} fill="white" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sistem Aktif</span>
            </motion.div>
          )}
          
          <div className="bg-black/40 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 flex items-center gap-3 shadow-2xl">
             <div className={cn(
               "w-3 h-3 rounded-full",
               isSystemActive ? "bg-emerald-400" : "bg-indigo-400 animate-pulse"
             )} />
             <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest">
               {isSystemActive ? "Optik Segmentasyon Aktif" : "ROI Hazırlanıyor"}
             </span>
          </div>
        </div>

        <div className="absolute left-10 top-10 z-50">
          <div className="w-[220px] bg-white/95 backdrop-blur-2xl border border-white rounded-[32px] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.15)] flex flex-col gap-6">
            <div className="space-y-1.5 text-center">
              <span className="text-[10px] font-black tracking-[0.2em] text-indigo-900/40 uppercase block">
                ROSE ROI ARAÇLARI
              </span>
              <div className="h-[2px] bg-slate-100 w-12 mx-auto rounded-full" />
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={runAutoDetect}
                disabled={isAutoDetecting || isSystemActive}
                className={cn(
                  "flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest mb-2 group",
                  isAutoDetecting 
                    ? "bg-indigo-50 text-indigo-300" 
                    : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 shadow-sm"
                )}
              >
                <Wand2 size={18} strokeWidth={3} className={cn("transition-transform", isAutoDetecting && "animate-spin")} />
                Otomatik ROI
              </button>

              <div className="h-px bg-slate-50 my-1" />

              {tools.map((tool) => (
                <button
                  key={tool.id}
                  disabled={isSystemActive}
                  onClick={() => setActiveTool(tool.id)}
                  className={cn(
                    "flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                    activeTool === tool.id 
                      ? "bg-indigo-600 text-white shadow-2xl shadow-indigo-200 -translate-y-0.5 scale-[1.02]" 
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  )}
                >
                  <tool.icon size={18} strokeWidth={3} />
                  {tool.label}
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100/60">
              <button 
                onClick={clearShapes}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-rose-500 font-black text-xs uppercase tracking-widest hover:bg-rose-50 transition-all group"
              >
                <Trash2 size={18} strokeWidth={3} className="group-hover:rotate-12 transition-transform" />
                Temizle
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-10 right-10 z-50">
          <button 
            disabled={shapes.length === 0 || isSystemActive}
            onClick={() => setShowConfirmModal(true)}
            className={cn(
              "flex items-center gap-4 px-10 py-5 rounded-[24px] font-black text-[11px] uppercase tracking-[0.25em] transition-all group active:scale-95 shadow-2xl",
              shapes.length === 0 || isSystemActive
                ? "bg-slate-100 text-slate-300 border-2 border-slate-200"
                : "bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600 -translate-y-1"
            )}
          >
            Sistemi Aktive Et
            <Check size={20} strokeWidth={4} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Info Cards */}
        <div className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sinyal Alanı</h4>
          <p className="text-3xl font-black text-slate-900 tracking-tighter">
            {shapes.length > 0 ? (Math.random() * 5000 + 1000).toFixed(0) : "0"} 
            <span className="text-sm font-medium text-slate-400 uppercase ml-2">px²</span>
          </p>
        </div>
        <div className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Segmentasyon</h4>
          <p className="text-3xl font-black text-slate-900 tracking-tighter">
            {shapes.length > 0 ? (85 + Math.random() * 10).toFixed(1) : "0.0"}
            <span className="text-sm font-medium text-slate-400 uppercase ml-2 text-emerald-500">Acc.</span>
          </p>
        </div>
        <div className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Görüntü Kalitesi</h4>
          <p className="text-3xl font-black text-indigo-500 tracking-tighter uppercase">High Def</p>
        </div>
        <div className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-3">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Odak Kalitesi</h4>
          <p className="text-3xl font-black text-emerald-500 tracking-tighter uppercase">Optimal</p>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirmModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-[450px] bg-white rounded-[40px] shadow-2xl p-10 pt-14 text-center overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-indigo-500" />
              <div className="w-20 h-20 bg-emerald-50 rounded-[28px] flex items-center justify-center text-emerald-500 mx-auto mb-8 relative">
                 <Check size={40} strokeWidth={3} />
              </div>
              
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase mb-2">ROI Doğrulama</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed mb-10">
                Segmentasyon verileri analiz edildi. Tespit edilen alanın doğruluğunu onaylıyor musunuz? Onay sonrası sistem kalibrasyonu tamamlanacaktır.
              </p>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleActivate}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-100"
                >
                  Onayla ve Aktive Et
                </button>
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="w-full py-5 bg-white border-2 border-slate-100 text-slate-400 rounded-[24px] font-black text-xs uppercase tracking-[0.2em]"
                >
                  Revize Et
                </button>
              </div>

              <button 
                onClick={() => setShowConfirmModal(false)}
                className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-900 transition-colors"
              >
                <X size={20} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
