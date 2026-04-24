import React, { useState } from 'react';
import { Upload, FileCode, CheckCircle2, Loader2, AlertTriangle, AlertCircle, Database, Frame } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../App';

interface UploadPanelProps {
  onComplete: (taskId: string) => void;
}

export default function UploadPanel({ onComplete }: UploadPanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ message: string; remediation?: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setError(null);
    }
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    
    // Warm up connection to ensure session cookies are set
    try {
      await fetch('/api/health', { credentials: 'include' });
    } catch (e) {
      console.warn("Warming check failed, continuing anyway...");
    }
    
    const formData = new FormData();
    files.forEach(f => formData.append('images', f));
    formData.append('experiment_id', `EXP-${Date.now()}`);

    try {
      const response = await fetch('/api/v1/predict/series', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: formData,
        credentials: 'include',
      });
      
      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        if (contentType && contentType.includes("application/json")) {
           const errorData = await response.json();
           throw new Error(errorData.error || errorData.details || `Sistem Hatası (${response.status})`);
        }
        
        // If it's not JSON, it's likely an infrastructure error (Nginx/Proxy)
        const text = await response.text().catch(() => "");
        console.error("Non-JSON Error Response:", text.substring(0, 500));
        
        if (response.status === 413) {
          throw new Error('Dosya grubu çok büyük (413 Payload Too Large). Daha az dosya seçmeyi deneyin.');
        }
        throw new Error(`Sunucu Hatası (${response.status}): Beklenmedik format (HTML/Text).`);
      }
      
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text().catch(() => "");
        console.error("Unexpected Content-Type Response:", text.substring(0, 500));
        throw new Error('Sunucu JSON beklerken farklı bir yanıt formatı gönderdi. Ağ bağlantınızı veya proxy ayarlarınızı kontrol edin.');
      }

      const data = await response.json();
      
      const poll = setInterval(async () => {
        try {
          const res = await fetch(`/api/v1/tasks/${data.task_id}/status`, {
            headers: {
              'Accept': 'application/json',
            },
            credentials: 'include'
          });
          const pollContentType = res.headers.get("content-type");
          
          if (!res.ok || !pollContentType || !pollContentType.includes("application/json")) {
            throw new Error('İşleme birimi ile bağlantı koptu veya geçersiz yanıt alındı.');
          }
          
          const statusData = await res.json();
          setProgress(statusData.progress);
          
          if (statusData.status === 'completed') {
            clearInterval(poll);
            onComplete(data.task_id);
          } else if (statusData.status === 'failed') {
            clearInterval(poll);
            setError({
              message: statusData.error || 'Pipeline execution failed.',
              remediation: 'Verify image contrast and sample density in the uploaded series.'
            });
            setIsUploading(false);
          }
        } catch (pollErr: any) {
          clearInterval(poll);
          setError({
            message: 'Polling failed.',
            remediation: 'The server may be overloaded. Try a smaller batch of images.'
          });
          setIsUploading(false);
        }
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setError({
        message: err.message || 'Network error during upload.',
        remediation: 'Check your connection or ensure files are valid TIFF/PNG formats.'
      });
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-10">
      <div className="space-y-3 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 rounded-lg text-white shadow-lg">
              <Database size={24} />
            </div>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Veri Giriş Portalı</h2>
          </div>
          
          <button 
            onClick={() => window.dispatchEvent(new CustomEvent('change-view', { detail: 'roi' }))}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all hover:text-slate-900"
          >
            <Frame size={14} />
            ROI Editör'e Git
          </button>
        </div>
        <p className="text-sm text-slate-500 font-medium">Fizyolojik stres analizi için RGB zaman serisini (Z-Stack) sisteme aktarın.</p>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className={cn(
        "bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center gap-8 transition-all shadow-xl shadow-slate-200/50 group relative overflow-hidden",
        files.length > 0 ? "ring-2 ring-slate-900 border-transparent" : "hover:border-primary/50"
      )}>
        <div className="absolute inset-0 opacity-[0.03] scientific-grid pointer-events-none" />
        <input 
          type="file" 
          multiple 
          onChange={handleFileChange} 
          className="hidden" 
          id="file-upload" 
          disabled={isUploading}
        />
        <label 
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center gap-6"
        >
          <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-sm">
            <Upload size={32} />
          </div>
          <div className="text-center space-y-2">
            <span className="text-sm font-bold text-slate-800 tracking-tight block">Dataset Seçimi İçin Buraya Tıklayın</span>
            <div className="flex gap-2 justify-center">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase">TIFF/RAW</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold uppercase">PNG/JPG</span>
            </div>
          </div>
        </label>
      </div>

      {files.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden"
        >
          <div className="flex items-center justify-between pb-6 border-b border-slate-50">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Batch Meta</span>
              <span className="font-black text-sm text-slate-900 uppercase tracking-tighter">{files.length} Kayıt Sırada</span>
            </div>
            {isUploading ? (
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white rounded-xl shadow-lg shadow-black/10 transition-all">
                <Loader2 size={16} className="animate-spin text-emerald-400" />
                <span className="font-mono text-xs font-bold leading-none">PROCESS_{progress}%</span>
              </div>
            ) : (
              <button 
                onClick={uploadFiles}
                className="group relative bg-[#10b981] text-white px-8 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-200 overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-3">
                  Sekans Analizini Başlat <CheckCircle2 size={16} />
                </span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>
            )}
          </div>
          
          <div className="space-y-2 max-h-56 overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-slate-200">
            {files.map((file, i) => (
              <div key={i} className="flex items-center justify-between py-3 px-4 rounded-xl bg-slate-50 border border-slate-100/50 group hover:bg-white hover:shadow-md hover:border-slate-200 transition-all">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="p-1.5 bg-white rounded-lg border border-slate-100 shadow-sm text-slate-400">
                    <FileCode size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-700 truncate max-w-[200px]">{file.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300 font-mono text-[9px] uppercase">Image/Series</span>
                  <span className="text-slate-900 font-mono text-[10px] font-bold leading-none shrink-0">{(file.size / 1024 / 1024).toFixed(2)}<span className="text-slate-300 ml-0.5">MB</span></span>
                </div>
              </div>
            ))}
          </div>

          {isUploading && (
            <div className="space-y-2">
               <div className="flex justify-between text-[9px] font-bold uppercase text-slate-400 tracking-widest">
                  <span>Pipeline Sync</span>
                  <span>{progress === 100 ? 'COMPLETE' : 'STREAMING...'}</span>
               </div>
               <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-300" 
                />
               </div>
            </div>
          )}
        </motion.div>
      )}

      {error && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-6 bg-rose-50 border-l-4 border-rose-500 rounded-r-2xl flex gap-5 text-rose-900 shadow-xl shadow-rose-100/50"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <AlertCircle size={24} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-black uppercase tracking-tight">{error.message}</p>
            <p className="text-xs opacity-70 leading-relaxed italic">{error.remediation}</p>
          </div>
        </motion.div>
      )}

      {/* QC Warning Banner */}
      <div className="p-6 bg-slate-900 text-white rounded-2xl flex gap-6 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 opacity-10 scientific-grid pointer-events-none" />
        <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
          <AlertTriangle size={28} />
        </div>
        <div className="space-y-2 relative">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 leading-none">Pre-Processing Protocol</p>
          <p className="text-xs leading-relaxed font-medium">
            Görüntüler otomatik olarak <span className="text-emerald-400 font-bold underline">CIE-Lab standardizasyonu</span> ve <span className="text-emerald-400 font-bold underline">ExG segmentasyonu</span>na tabi tutulacaktır. Maksimum doğruluk için homojen ışıklandırma koşullarını kontrol edin.
          </p>
        </div>
      </div>
    </div>
  );
}
