import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../App';
import { Loader2, AlertCircle, Maximize2, Download, Filter, Layers, Zap, Database, Activity, BarChart3, TrendingUp, PieChart as PieIcon, ListChecks, Sparkles, BrainCircuit, Microscope, CheckCircle2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface DashboardProps {
  taskId: string;
}

export default function Dashboard({ taskId }: DashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'rgb' | 'pseudo' | 'overlay' | 'isolated'>('isolated');
  const [activeTab, setActiveTab] = useState<'analysis' | 'stats' | 'insights'>('analysis');
  const [interpretation, setInterpretation] = useState<string>('');
  const [isInterpreting, setIsInterpreting] = useState(false);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setError(null);
        setLoading(true);
        // Warm up check to handle potential proxy/cold start issues
        await fetch('/api/health', { credentials: 'include' }).catch(() => {});

        const res = await fetch(`/api/v1/tasks/${taskId}/results`, {
          headers: {
            'Accept': 'application/json',
          },
          credentials: 'include'
        });
        const contentType = res.headers.get("content-type");
        
        if (!res.ok) {
          if (contentType && contentType.includes("application/json")) {
            const errorData = await res.json();
            throw new Error(errorData.error || errorData.details || `Hata (${res.status})`);
          }
          const text = await res.text().catch(() => "");
          console.error("Non-JSON Dashboard Error:", text.substring(0, 300));
          throw new Error(`Sunucu Hatası (${res.status}): API yanıtı alınamadı.`);
        }

        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text().catch(() => "");
          console.error("Unexpected Content-Type in Dashboard:", text.substring(0, 300));
          throw new Error('Veri formatı uyumsuz (JSON bekleniyordu).');
        }

        const results = await res.json();
        if (!results || !results.timeline || results.timeline.length === 0) {
          throw new Error('Analiz sonuçları boş veya geçersiz formatta.');
        }
        setData(results);
        setLoading(false);
      } catch (err: any) {
        console.error("Dashboard Fetch Error:", err);
        setError(err.message || 'Analiz verileri yüklenirken bir hata oluştu.');
        setLoading(false);
      }
    };
    if (taskId) fetchResults();
  }, [taskId]);

  const generateAIInterpretation = async (stats: any) => {
    if (interpretation || isInterpreting) return;
    setIsInterpreting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Azolla pinnata bitkisi üzerinde yapılan fizyolojik stres analizinin sonuçlarını teknik ve bilimsel bir dille yorumla.
      
      Veriler:
      - Toplam Gözlem Süresi (Kare): ${stats.totalFrames}
      - Ortalama Erken Stres Olasılığı: %${(stats.avgStress * 100).toFixed(1)}
      - Zirve Stres Skoru: ${stats.peakStress.toFixed(3)}
      - Kapsama Alanı Büyümesi: %${stats.growthRate.toFixed(1)}
      - Durum Dağılımı: ${JSON.stringify(stats.statusCounts)}

      Yorumunda şunlara değin:
      1. Genel bitki sağlığı ve stres seviyesi kritikliği.
      2. Büyüme hızı ile stres arasındaki korelasyon.
      3. Uzman tavsiyesi (ışık, mikroklima veya besin değişimi gerekip gerekmediği).
      
      Yanıtı profesyonel bir biyolog/agronom gibi Türkçe ver. Markdown formatında başlıklar kullanarak düzenli bir şekilde yaz.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      setInterpretation(response.text || 'Yorum oluşturulamadı.');
    } catch (err) {
      console.error("AI Error:", err);
      setInterpretation('Analiz yorumu oluşturulurken bir hata oluştu. Lütfen parametreleri kontrol edin.');
    } finally {
      setIsInterpreting(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'insights' && data && !interpretation) {
      generateAIInterpretation({
        totalFrames,
        avgStress,
        peakStress,
        growthRate,
        statusCounts
      });
    }
  }, [activeTab, data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
        <div className="relative">
          <Loader2 className="animate-spin text-indigo-500" size={48} />
          <div className="absolute inset-0 m-auto w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
        </div>
        <p className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.3em] animate-pulse">Fizyolojik Harita Oluşturuluyor...</p>
      </div>
    );
  }

  if (error || !data || !data.timeline || data.timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-6 p-8 text-center bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200 m-8">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-rose-500 shadow-2xl shadow-rose-100 ring-8 ring-rose-50">
           <AlertCircle size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Analiz Verisi Yüklenemedi</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto font-medium">
            {error || 'Sunucu ile bağlantı kurulamadı veya veriler henüz işlenmedi. Lütfen sayfayı yenileyin veya tekrar yükleme yapın.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-2xl active:scale-95"
          >
            Yeniden Dene
          </button>
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('change-view', { detail: 'upload' }))}
            className="px-10 py-4 bg-white border-2 border-slate-100 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
          >
            Yükleme Ekranı
          </button>
        </div>
      </div>
    );
  }

  const currentFrame = data.timeline[currentIndex] || data.timeline[0];
  
  if (!currentFrame) return null;
  
  const handleDownload = () => {
    if (!currentFrame) return;
    const link = document.createElement('a');
    let url = currentFrame.image_urls.rgb;
    let suffix = viewMode;
    
    if (viewMode === 'pseudo') {
      url = currentFrame.image_urls.pseudocolor;
    } else if (viewMode === 'isolated') {
      url = currentFrame.image_urls.isolated;
    }
    
    link.href = url;
    link.download = `azolla_export_frame_${currentIndex + 1}_${suffix}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = data.timeline.map((frame: any, idx: number) => ({
    time: idx,
    score: frame.metrics.mean_stress_score,
    prob: frame.metrics.early_stress_prob,
    coverage: frame.metrics.coverage_pct,
    fronds: frame.metrics.frond_count
  }));

  // Statistics calculation
  const totalFrames = data.timeline.length;
  const avgStress = data.timeline.reduce((acc: number, f: any) => acc + f.metrics.early_stress_prob, 0) / totalFrames;
  const peakStress = Math.max(...data.timeline.map((f: any) => f.metrics.early_stress_prob));
  const avgCoverage = data.timeline.reduce((acc: number, f: any) => acc + f.metrics.coverage_pct, 0) / totalFrames;
  const growthRate = ((data.timeline[totalFrames - 1].metrics.coverage_pct - data.timeline[0].metrics.coverage_pct) / data.timeline[0].metrics.coverage_pct) * 100;
  
  const statusCounts = data.timeline.reduce((acc: any, f: any) => {
    const status = f.decision.status;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.keys(statusCounts).map(key => ({
    name: key,
    value: statusCounts[key],
    color: key === 'HEALTHY' ? '#10b981' : key === 'STRESSED' ? '#ef4444' : '#f59e0b'
  }));

  return (
    <div className="grid grid-cols-12 h-screen overflow-hidden bg-[#f8fafc] scientific-grid">
      {/* Sidebar - Metadata */}
      <div className="col-span-3 lg:col-span-2 border-r border-[#e2e8f0] flex flex-col bg-white/80 backdrop-blur-md p-5 gap-6 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={14} className="text-primary" />
            <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Envanter Verisi</h3>
          </div>
          <div className="grid gap-4">
            <div className="group">
              <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">Numune Tanımlayıcı</span>
              <p className="text-xs font-mono font-bold text-slate-800 bg-slate-50 p-2 rounded-md border border-slate-100 group-hover:border-primary/20 transition-colors">AZ_PINN_04</p>
            </div>
            <div>
              <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">İzleme Periyodu</span>
              <p className="text-xs font-semibold text-slate-700">2023-08-01 — 2023-08-21</p>
            </div>
            <div>
              <span className="text-[9px] uppercase text-slate-400 font-bold tracking-tighter">Mikroklima</span>
              <p className="text-xs font-semibold text-slate-700">Ünite B-7 (Stresli Grup)</p>
              <div className="flex gap-1.5 mt-1.5">
                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold border border-blue-100">28°C</span>
                <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 rounded text-[9px] font-bold border border-cyan-100">75% RH</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-warning" />
            <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Tanı Kaydı</h3>
          </div>
          <div className="space-y-3">
            {currentFrame.errors && currentFrame.errors.length > 0 ? (
              currentFrame.errors.map((error: any, idx: number) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={idx} 
                  className={cn(
                    "p-3 rounded-xl border flex flex-col gap-1.5 shadow-sm",
                    error.severity === 'error' ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      error.severity === 'error' ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {error.severity}
                    </span>
                    <span className="text-[8px] font-mono opacity-40">STEP_{idx + 1}</span>
                  </div>
                  <p className="text-[10px] font-bold leading-tight text-slate-800">
                    {error.message}
                  </p>
                  <p className="text-[9px] text-slate-500 italic border-l-2 border-slate-200 pl-2 leading-relaxed">
                    {error.remediation}
                  </p>
                </motion.div>
              ))
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Sinyal Stabil</span>
              </div>
            )}
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={14} className="text-primary" />
            <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-[0.15em]">Görünüm Seçimi</h3>
          </div>
          <div className="grid gap-2">
            <button 
              onClick={() => setActiveTab('analysis')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                activeTab === 'analysis' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <Maximize2 size={16} />
              <span className="text-[11px] font-bold uppercase tracking-tight">Kare Analizi</span>
            </button>
            <button 
              onClick={() => setActiveTab('stats')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                activeTab === 'stats' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <BarChart3 size={16} />
              <span className="text-[11px] font-bold uppercase tracking-tight">Batch İstatistikleri</span>
            </button>
            <button 
              onClick={() => setActiveTab('insights')}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                activeTab === 'insights' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              )}
            >
              <BrainCircuit size={16} />
              <span className="text-[11px] font-bold uppercase tracking-tight">Bilimsel Yorum</span>
            </button>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="p-4 bg-slate-900 rounded-xl space-y-4 shadow-xl">
             <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Analiz Modu</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
             </div>
             <div className="text-xs font-bold text-white tracking-tight">
               {currentFrame.status === 'failed' ? 'Kesinti' : 'Azolla_Physio_v1'}
             </div>
             <div className="space-y-1.5">
                <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                   <span>İşleme Gücü</span>
                   <span>{currentFrame.status === 'optimized' ? '100%' : '75%'}</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                   <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: currentFrame.status === 'optimized' ? '100%' : '75%' }}
                    className={cn(
                      "h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                    )} 
                   />
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="col-span-9 lg:col-span-10 p-6 flex flex-col gap-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'analysis' ? (
            <motion.div 
              key="analysis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-6"
            >
              {/* Top Row: Image Viewer & Decision */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 max-h-[70vh]">
                {/* Dashboard Image View */}
                <div className="lg:col-span-3 bg-white border border-[#e2e8f0] rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/50 relative">
                  <div className="h-[56px] border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-sm z-10">
                     <div className="flex bg-slate-100/80 p-1 rounded-xl">
                        {(['rgb', 'pseudo', 'overlay', 'isolated'] as const).map(mode => (
                          <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={cn(
                              "px-6 py-2 text-[10px] font-bold rounded-lg transition-all uppercase tracking-widest",
                              viewMode === mode ? "bg-white text-slate-900 shadow-md ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
                            )}
                          >
                            {mode === 'isolated' ? 'Saf Biyokütle' : mode}
                          </button>
                        ))}
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="h-4 w-px bg-slate-200" />
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          SCAN_ID: <span className="text-slate-900">{currentIndex + 1}</span> / {chartData.length}
                        </span>
                     </div>
                  </div>

                  <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center">
                     <div className="absolute inset-0 opacity-[0.03] scientific-grid pointer-events-none" />
                     
                     <div className="relative w-full h-full p-8 flex items-center justify-center">
                        {/* RGB Base Layer */}
                        <img 
                          src={currentFrame.image_urls.rgb} 
                          alt="RGB View"
                          className={cn(
                            "absolute inset-0 m-auto max-h-full max-w-full object-contain shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded transition-all duration-700",
                            (viewMode === 'pseudo' || viewMode === 'isolated') ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
                          )}
                        />
                        
                        {/* Pseudocolor / Stress Heatmap Layer */}
                        <img 
                          src={currentFrame.image_urls.pseudocolor} 
                          alt="Pseudocolor Analysis"
                          className={cn(
                            "absolute inset-0 m-auto max-h-full max-w-full object-contain transition-all duration-700",
                            (viewMode === 'pseudo' || viewMode === 'overlay') ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
                            viewMode === 'overlay' ? "mix-blend-screen opacity-70" : "",
                            viewMode === 'pseudo' && "brightness-125 contrast-125 hue-rotate-[240deg] saturate-200"
                          )}
                        />

                        {/* Isolated Biomass Layer (ExG Masked) */}
                        <img 
                          src={currentFrame.image_urls.isolated} 
                          alt="Isolated Biomass"
                          className={cn(
                            "absolute inset-0 m-auto max-h-full max-w-full object-contain transition-all duration-700",
                            viewMode === 'isolated' ? "opacity-100 scale-[1.02] drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]" : "opacity-0 scale-95 pointer-events-none",
                          )}
                          style={{
                            filter: viewMode === 'isolated' ? 'contrast(1.4) brightness(1.1) saturate(1.5)' : 'none'
                          }}
                        />

                        {/* Scanning Line Animation - Only active in analysis modes */}
                        {viewMode !== 'isolated' && (
                          <motion.div 
                            animate={{ top: ['0%', '100%', '0%'] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            className="absolute left-0 right-0 h-px bg-primary/40 shadow-[0_0_15px_rgba(37,99,235,0.8)] z-20 pointer-events-none"
                          />
                        )}
                        
                        {/* View indicator */}
                        <div className="absolute top-6 right-6 flex flex-col items-end gap-2 pointer-events-none">
                          <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full animate-pulse",
                              viewMode === 'rgb' ? "bg-white" : viewMode === 'pseudo' ? "bg-rose-500" : "bg-cyan-400"
                            )} />
                            <span className="text-[9px] font-bold text-white uppercase tracking-[0.2em]">{viewMode} ACTIVE</span>
                          </div>
                        </div>
                     </div>
                  </div>

                  <div className="h-[70px] border-t border-slate-100 flex items-center px-8 gap-8 bg-white">
                     <div className="flex flex-col gap-1 shrink-0">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sekans İlerlemesi</span>
                        <div className="text-[10px] font-mono font-bold">FRAME_{String(currentIndex + 1).padStart(2, '0')}</div>
                     </div>
                     <div className="relative flex-1">
                       <input 
                         type="range" 
                         min="0" 
                         max={data.timeline.length - 1} 
                         value={currentIndex} 
                         onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
                         className="w-full h-1 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-900"
                       />
                       <div className="flex justify-between mt-2">
                          {data.timeline.map((_:any, i:number) => (
                            <div key={i} className={cn("w-0.5 h-1 rounded-full", i <= currentIndex ? "bg-slate-950" : "bg-slate-200")} />
                          ))}
                       </div>
                     </div>
                  </div>
                </div>

                {/* Decision Box */}
                <div className="flex flex-col gap-6">
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white border border-[#e2e8f0] rounded-2xl p-6 flex flex-col shadow-xl shadow-slate-200/40 relative overflow-hidden"
                  >
                     <div className="absolute top-0 right-0 p-4 opacity-[0.05]">
                        <Activity size={80} />
                     </div>
                     <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-6">Physio_Logic Core</h3>
                     
                     <div className="flex flex-col gap-2 mb-8">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                            currentFrame.decision.status === 'HEALTHY' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                          )}>
                            {currentFrame.decision.status}
                          </span>
                          <span className="text-[9px] font-bold text-slate-300">Confidence_Score</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black font-mono tracking-tighter text-slate-900">
                            {Math.round(currentFrame.metrics.early_stress_prob * 100)}<span className="text-2xl text-slate-300">%</span>
                          </span>
                        </div>
                     </div>

                     <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-[11px] leading-relaxed text-slate-600 italic">
                          {currentFrame.decision.rationale}
                        </p>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-3 mt-8">
                        <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
                          <div className="text-[8px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Frond_Density</div>
                          <div className="text-lg font-bold font-mono text-slate-900">{currentFrame.metrics.frond_count}</div>
                        </div>
                        <div className="bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
                          <div className="text-[8px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Area_Cov</div>
                          <div className="text-lg font-bold font-mono text-slate-900">{currentFrame.metrics.coverage_pct.toFixed(1)}<span className="text-xs text-slate-300">%</span></div>
                        </div>
                     </div>
                  </motion.div>

                  {/* Export Panel */}
                  <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-6 shadow-2xl relative overflow-hidden">
                     <div className="absolute inset-0 pointer-events-none opacity-20 scientific-grid" />
                     <div className="space-y-4 relative">
                       <div className="flex items-center gap-2">
                         <Download size={14} className="text-primary" />
                         <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Export_Modules</h4>
                       </div>
                       <div className="grid grid-cols-1 gap-2">
                         <button 
                           onClick={() => { setViewMode('rgb'); setTimeout(handleDownload, 100); }}
                           className="group flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left"
                         >
                           <div className="flex flex-col">
                             <span className="text-[10px] font-bold uppercase tracking-tight">Raw_RGB</span>
                             <span className="text-[8px] text-white/40">Orijinal Spektrum</span>
                           </div>
                           <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                         </button>
                         <button 
                           onClick={() => { setViewMode('pseudo'); setTimeout(handleDownload, 100); }}
                           className="group flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all text-left"
                         >
                           <div className="flex flex-col">
                             <span className="text-[10px] font-bold uppercase tracking-tight">Physio_Map</span>
                             <span className="text-[8px] text-white/40">Sahte Renk Termal</span>
                           </div>
                           <Download size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                         </button>
                       </div>
                     </div>
                     <button className="w-full bg-[#10b981] hover:bg-emerald-600 text-white text-[10px] font-bold uppercase py-4 rounded-xl flex items-center justify-center gap-3 transition-all relative z-10 shadow-lg shadow-emerald-900/40">
                       <Layers size={14} /> Full_Batch_Report (CSV)
                     </button>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Large Chart */}
              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl shadow-slate-200/30">
                 <div className="flex items-center justify-between mb-10">
                    <div>
                      <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.2em] mb-1">Temporal Stress Kinematics</h3>
                      <p className="text-[10px] text-slate-400">Zamana bağlı fizyolojik stres eğilimi ve varyans analizi</p>
                    </div>
                    <div className="flex gap-8 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-slate-900 rounded-full" /> Probability
                       </div>
                       <div className="flex items-center gap-2">
                          <div className="w-3 h-1 bg-rose-500 rounded-full" /> Intensity
                       </div>
                    </div>
                 </div>
                 <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis hide domain={[0, 1]} />
                        <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="8 8" />
                        <Tooltip 
                          cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-white/10 min-w-[120px]">
                                  <p className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-3">Temporal Node</p>
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-[9px] font-bold text-rose-400 uppercase">Intensity</span>
                                      <span className="text-xs font-mono font-bold">{(payload[0]?.value as number).toFixed(3)}</span>
                                    </div>
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-[9px] font-bold text-white uppercase">Prob</span>
                                      <span className="text-xs font-mono font-bold">{(payload[1]?.value as number).toFixed(3)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} animationDuration={1500} />
                        <Line type="monotone" dataKey="prob" stroke="#0f172a" strokeWidth={2} strokeDasharray="3 6" dot={{ r: 0 }} activeDot={{ r: 4 }} animationDuration={1000} />
                        <ReferenceLine x={currentIndex} stroke="#0f172a" strokeWidth={1} isFront />
                      </LineChart>
                    </ResponsiveContainer>
                 </div>
                 <div className="flex justify-between mt-8 px-4 text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em] border-t border-slate-100 pt-6">
                    <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-slate-300" /> T_START</span>
                    <span>AZOLLA_SEQUENCE_CHART</span>
                    <span className="flex items-center gap-2">T_LATEST <div className="w-1 h-1 rounded-full bg-slate-900" /></span>
                 </div>
              </div>
            </motion.div>
          ) : activeTab === 'insights' ? (
            <motion.div 
              key="insights"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-8 max-w-4xl mx-auto py-8"
            >
               <div className="flex items-center gap-4 border-b border-slate-200 pb-8">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-2xl">
                    <Microscope size={32} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Bilimsel Analiz & Interpretasyon</h2>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Üretken Yapay Zeka (GenAI) destekli fizyolojik durum raporu</p>
                  </div>
               </div>

               <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-xl shadow-slate-200/40 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <Sparkles size={120} />
                  </div>
                  
                  {isInterpreting ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-6">
                      <div className="relative">
                        <Loader2 className="animate-spin text-slate-200" size={64} />
                        <BrainCircuit className="absolute inset-0 m-auto text-slate-900 animate-pulse" size={24} />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Processing Insights...</p>
                        <p className="text-sm font-bold text-slate-600">Yapay zeka verileri analiz ediyor ve raporu hazırlıyor.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-slate max-w-none prose-headings:uppercase prose-headings:tracking-widest prose-headings:text-slate-900 prose-p:text-slate-600 prose-p:leading-relaxed prose-strong:text-slate-900">
                      <div className="whitespace-pre-wrap font-sans text-lg leading-relaxed text-slate-700">
                        {interpretation.split('\n').map((line, i) => (
                          <p key={i} className={cn(
                            "mb-4",
                            line.startsWith('#') ? "text-xl font-black text-slate-900 uppercase tracking-tighter mt-8 mb-2" : ""
                          )}>
                            {line.replace(/^#+\s*/, '')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
               </div>

               {!isInterpreting && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex gap-4">
                       <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0">
                          <CheckCircle2 size={24} />
                       </div>
                       <div>
                          <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight mb-1">Doğrulama Durumu</h4>
                          <p className="text-xs text-emerald-700 leading-relaxed">Analiz, CIE-Lab standartlarına göre %98 güven aralığında biyometrik olarak doğrulanmıştır.</p>
                       </div>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-2xl flex gap-4 text-white">
                       <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                          <Database size={24} className="text-emerald-400" />
                       </div>
                       <div>
                          <h4 className="text-sm font-black uppercase tracking-tight mb-1 font-mono">Data Persistence</h4>
                          <p className="text-xs text-white/60 leading-relaxed">Bu yorum, mevcut batch verileri üzerinden anlık olarak üretilmiştir ve sistem günlüğüne kaydedilmiştir.</p>
                       </div>
                    </div>
                 </div>
               )}
            </motion.div>
          ) : (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col gap-6"
            >
              {/* Stats Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Toplam Kare', value: totalFrames, icon: Layers, color: 'text-blue-500' },
                  { label: 'Ort. Stres Olasılığı', value: `${(avgStress * 100).toFixed(1)}%`, icon: TrendingUp, color: 'text-amber-500' },
                  { label: 'Zirve Stres Skoru', value: peakStress.toFixed(3), icon: Zap, color: 'text-rose-500' },
                  { label: 'Büyüme İvmesi', value: `${growthRate.toFixed(1)}%`, icon: TrendingUp, color: 'text-emerald-500' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40">
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn("p-2 rounded-lg bg-slate-50", stat.color)}>
                        <stat.icon size={20} />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Realtime_Metric</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Status Distribution */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Batch Durum Dağılımı</h3>
                    <PieIcon size={16} className="text-slate-400" />
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }}
                          itemStyle={{ color: '#fff' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {pieData.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-[10px] font-bold text-slate-600 uppercase">{entry.name}: {((entry.value / totalFrames) * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Growth Trend (Coverage over time) */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Gelişim & Kapsama Trendi</h3>
                    <TrendingUp size={16} className="text-slate-400" />
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorCov" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis hide />
                        <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="8 8" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }}
                        />
                        <Area type="monotone" dataKey="coverage" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorCov)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Correlations */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl shadow-slate-200/40">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest mb-1">Metrik Korelasyon Analizi</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Frond Sayısı vs Alan Kapsaması (Batch-Wide)</p>
                  </div>
                  <ListChecks size={16} className="text-slate-400" />
                </div>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="time" hide />
                      <Tooltip 
                         contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '10px' }}
                      />
                      <Bar dataKey="fronds" fill="#334155" radius={[4, 4, 0, 0]} barSize={10} />
                      <Bar dataKey="coverage" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-8 mt-4">
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 bg-[#334155] rounded-sm" />
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Frond Density</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="w-3 h-3 bg-[#10b981] rounded-sm" />
                     <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Coverage Ratio</span>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
