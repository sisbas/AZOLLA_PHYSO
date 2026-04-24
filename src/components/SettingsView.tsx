import React, { useState, useEffect } from 'react';
import { Save, RefreshCcw, Sliders, ShieldCheck, Microscope, Database, Loader2, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../App';

export default function SettingsView() {
  const [config, setConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/settings');
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to fetch settings', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateParam = (section: string, key: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="animate-spin text-[#0f172a]" size={32} />
        <p className="text-sm font-medium text-[#64748b] animate-pulse">Yapılandırma yükleniyor...</p>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-10 pb-20"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-[#1e293b]">Sistem Yapılandırması</h2>
          <p className="text-sm text-[#64748b]">Analiz boru hattı parametrelerini ve eşik değerlerini optimize edin.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#0f172a] text-white px-8 py-3 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-[#1e293b] transition-all shadow-xl shadow-black/10 flex items-center gap-3 disabled:opacity-50"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Uygula'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Segmentation Settings */}
        <section className="bg-white border border-[#cbd5e1] rounded-2xl p-8 space-y-8 shadow-sm">
          <div className="flex items-center gap-4 border-b border-[#f1f5f9] pb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Microscope size={20} />
            </div>
            <div>
              <h3 className="font-bold text-[#1e293b]">Segmentasyon</h3>
              <p className="text-[10px] text-[#64748b] uppercase font-bold tracking-wider">Görüntü İşleme Parametreleri</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#1e293b]">Otsu Güvenlik Faktörü</label>
                <span className="text-xs font-mono bg-[#f8fafc] px-2 py-1 rounded border border-[#e2e8f0]">{config.segmentation.otsu_safety_factor}</span>
              </div>
              <input 
                type="range" min="0.5" max="2.0" step="0.1"
                value={config.segmentation.otsu_safety_factor}
                onChange={(e) => updateParam('segmentation', 'otsu_safety_factor', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#f1f5f9] rounded-full appearance-none cursor-pointer accent-[#0f172a]"
              />
              <p className="text-[10px] text-[#94a3b8]">Eşikleme hassasiyetini ayarlar. Yüksek değerler daha az gürültü ama daha az biyokütle yakalar.</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#1e293b]">Kapsama Eşiği (%)</label>
                <span className="text-xs font-mono bg-[#f8fafc] px-2 py-1 rounded border border-[#e2e8f0]">{config.segmentation.coverage_threshold * 100}%</span>
              </div>
              <input 
                type="range" min="0.01" max="0.5" step="0.01"
                value={config.segmentation.coverage_threshold}
                onChange={(e) => updateParam('segmentation', 'coverage_threshold', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#f1f5f9] rounded-full appearance-none cursor-pointer accent-[#0f172a]"
              />
            </div>
          </div>
        </section>

        {/* Decision Engine Settings */}
        <section className="bg-white border border-[#cbd5e1] rounded-2xl p-8 space-y-8 shadow-sm">
          <div className="flex items-center gap-4 border-b border-[#f1f5f9] pb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-[#1e293b]">Karar Mekanizması</h3>
              <p className="text-[10px] text-[#64748b] uppercase font-bold tracking-wider">İstatistiksel Eşik Değerleri</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#1e293b]">Z-Skoru Eşiği</label>
                <span className="text-xs font-mono bg-[#f8fafc] px-2 py-1 rounded border border-[#e2e8f0]">{config.decision.z_score_threshold}</span>
              </div>
              <input 
                type="range" min="1.0" max="4.0" step="0.1"
                value={config.decision.z_score_threshold}
                onChange={(e) => updateParam('decision', 'z_score_threshold', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#f1f5f9] rounded-full appearance-none cursor-pointer accent-[#0f172a]"
              />
              <p className="text-[10px] text-[#94a3b8]">Stres tespiti için gerekli standart sapma. 2.0 standarttır.</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#1e293b]">FDR Alpha (Hatalı Keşif Oranı)</label>
                <span className="text-xs font-mono bg-[#f8fafc] px-2 py-1 rounded border border-[#e2e8f0]">{config.decision.fdr_alpha}</span>
              </div>
              <input 
                type="range" min="0.01" max="0.1" step="0.01"
                value={config.decision.fdr_alpha}
                onChange={(e) => updateParam('decision', 'fdr_alpha', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#f1f5f9] rounded-full appearance-none cursor-pointer accent-[#0f172a]"
              />
            </div>
          </div>
        </section>

        {/* Morphological Settings */}
        <section className="bg-white border border-[#cbd5e1] rounded-2xl p-8 space-y-8 shadow-sm">
          <div className="flex items-center gap-4 border-b border-[#f1f5f9] pb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <Sliders size={20} />
            </div>
            <div>
              <h3 className="font-bold text-[#1e293b]">Morfoloji</h3>
              <p className="text-[10px] text-[#64748b] uppercase font-bold tracking-wider">Frond Ayıklama Ayarları</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#1e293b]">Watershed Kompaktlığı</label>
                <span className="text-xs font-mono bg-[#f8fafc] px-2 py-1 rounded border border-[#e2e8f0]">{config.frond_segmenter.watershed_compactness}</span>
              </div>
              <input 
                type="range" min="0.0001" max="0.1" step="0.0001"
                value={config.frond_segmenter.watershed_compactness}
                onChange={(e) => updateParam('frond_segmenter', 'watershed_compactness', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#f1f5f9] rounded-full appearance-none cursor-pointer accent-[#0f172a]"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#1e293b]">Min. Frond Alanı (px)</label>
                <span className="text-xs font-mono bg-[#f8fafc] px-2 py-1 rounded border border-[#e2e8f0]">{config.frond_segmenter.min_frond_area_px}</span>
              </div>
              <input 
                type="number"
                value={config.frond_segmenter.min_frond_area_px}
                onChange={(e) => updateParam('frond_segmenter', 'min_frond_area_px', parseInt(e.target.value))}
                className="w-full bg-[#f8fafc] border border-[#cbd5e1] rounded-lg p-2 text-sm font-mono text-[#1e293b]"
              />
            </div>
          </div>
        </section>

        {/* ML Fallback Settings */}
        <section className="bg-white border border-[#cbd5e1] rounded-2xl p-8 space-y-8 shadow-sm">
          <div className="flex items-center gap-4 border-b border-[#f1f5f9] pb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Database size={20} />
            </div>
            <div>
              <h3 className="font-bold text-[#1e293b]">Makine Öğrenmesi</h3>
              <p className="text-[10px] text-[#64748b] uppercase font-bold tracking-wider">DL Fallback Yapılandırması</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1e293b]">DL Fallback Etkin</label>
              <button 
                onClick={() => updateParam('dl_fallback', 'enabled', !config.dl_fallback.enabled)}
                className={cn(
                  "w-12 h-6 rounded-full transition-all relative",
                  config.dl_fallback.enabled ? "bg-[#22c55e]" : "bg-[#cbd5e1]"
                )}
              >
                <div className={cn(
                   "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                   config.dl_fallback.enabled ? "left-7" : "left-1"
                )} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#1e293b]">Model Eşiği</label>
                <span className="text-xs font-mono bg-[#f8fafc] px-2 py-1 rounded border border-[#e2e8f0]">{config.dl_fallback.threshold}</span>
              </div>
              <input 
                type="range" min="0.1" max="0.9" step="0.05"
                value={config.dl_fallback.threshold}
                onChange={(e) => updateParam('dl_fallback', 'threshold', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#f1f5f9] rounded-full appearance-none cursor-pointer accent-[#0f172a]"
              />
            </div>
          </div>
        </section>
      </div>

      {saveStatus === 'success' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 text-green-700 shadow-sm"
        >
          <CheckCircle2 size={18} />
          <span className="text-sm font-bold">Yapılandırma başarıyla güncellendi. Boru hattı bir sonraki analizde yeni değerleri kullanacaktır.</span>
        </motion.div>
      )}

      <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl flex gap-4 text-amber-900 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center shrink-0 shadow-sm">
          <RefreshCcw size={20} className="text-amber-500" />
        </div>
        <div className="text-xs leading-relaxed">
          <p className="font-bold mb-1">Dikkat: Bilimsel Validasyon</p>
          Değişiklikler sunucu tarafındaki boru hattını anında etkiler. Parametrelerdeki radikal değişiklikler hatalı negatif veya pozitif stres tespitlerine yol açabilir. Her değişiklik sonrası referans veri setleri ile doğrulama yapılması önerilir.
        </div>
      </div>
    </motion.div>
  );
}
