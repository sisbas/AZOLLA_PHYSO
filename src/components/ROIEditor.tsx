import React, { useMemo, useState } from 'react';
import { Upload, Image as ImageIcon, CheckCircle2, AlertTriangle, Sparkles, Layers3, Activity, Save } from 'lucide-react';
import { defaultPipelineConfig } from '../features/roi-editor/config/pipelineConfig';
import { getImageDataFromElement } from '../features/roi-editor/core/imageData';
import { runScientificPipeline } from '../features/roi-editor/core/pipeline';

interface ROIEditorProps { onSave?: (data: any) => void; }

const STEPS = [
  '1. Ön-İşleme', '2. ROI İzolasyonu', '3. Görüntü Kaydı (Registration)',
  '4. Işık/Renk Normalizasyonu', '5. Bilimsel Metrik Hesaplama', '6. Raporlama'
];

const cardCls = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

export default function ROIEditor({ onSave }: ROIEditorProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<typeof runScientificPipeline> | null>(null);
  const [working, setWorking] = useState(false);

  const doneSteps = useMemo(() => {
    if (!sourceUrl) return 0;
    if (!referenceUrl) return 1;
    if (!result) return 2;
    return 6;
  }, [sourceUrl, referenceUrl, result]);

  const loadToImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

  const pickFile = (setter: (v: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  const runPipeline = async () => {
    if (!sourceUrl || !referenceUrl) return;
    setWorking(true);
    try {
      const [srcImg, refImg] = await Promise.all([loadToImage(sourceUrl), loadToImage(referenceUrl)]);
      const source = getImageDataFromElement(srcImg);
      const reference = getImageDataFromElement(refImg);
      const out = runScientificPipeline(source, reference, defaultPipelineConfig);
      setResult(out);
      onSave?.(out);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4 p-6 bg-slate-50 min-h-[calc(100vh-64px)]">
      <aside className="col-span-12 lg:col-span-3 space-y-4">
        <div className={`${cardCls} p-4`}>
          <h2 className="text-sm font-bold mb-3">Pipeline Durumu</h2>
          <ul className="space-y-2">
            {STEPS.map((step, i) => <li key={step} className="flex items-center gap-2 text-xs">{i < doneSteps ? <CheckCircle2 size={14} className="text-emerald-600" /> : <div className="w-3 h-3 rounded-full bg-slate-200" />}<span>{step}</span></li>)}
          </ul>
        </div>
        <div className={`${cardCls} p-4 text-xs`}>
          <p className="font-semibold mb-2">Kritik Sıra</p>
          <p>Registration → Normalizasyon sırası zorunlu tutuldu.</p>
        </div>
      </aside>

      <section className="col-span-12 lg:col-span-6 space-y-4">
        <div className={`${cardCls} p-4`}>
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><ImageIcon size={16} /> Batch Girdisi</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="p-3 border rounded-xl bg-slate-50">Kaynak RGB
              <input className="mt-2 block w-full" type="file" accept="image/*" onChange={pickFile((v) => setSourceUrl(v))} />
            </label>
            <label className="p-3 border rounded-xl bg-slate-50">Referans RGB
              <input className="mt-2 block w-full" type="file" accept="image/*" onChange={pickFile((v) => setReferenceUrl(v))} />
            </label>
          </div>
          <button disabled={!sourceUrl || !referenceUrl || working} onClick={runPipeline} className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs disabled:opacity-40 inline-flex items-center gap-2"><Upload size={14} /> {working ? 'Çalışıyor...' : 'Pipeline Çalıştır'}</button>
        </div>
      </section>

      <aside className="col-span-12 lg:col-span-3 space-y-4">
        <div className={`${cardCls} p-4 text-xs space-y-2`}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Activity size={15} /> Registration / Normalizasyon</h3>
          <p>inlier_ratio: {result?.registration.inlierRatio.toFixed(3) ?? '-'}</p>
          <p>shift_x/y: {result ? `${result.registration.shiftX}, ${result.registration.shiftY}` : '-'}</p>
          <p>ROI coverage: {result ? `${(result.roiMaskCoverage * 100).toFixed(1)}%` : '-'}</p>
        </div>
        <div className={`${cardCls} p-4 text-xs space-y-2`}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Layers3 size={15} /> Bilimsel Metrikler</h3>
          <p>SSIM: {result?.metrics.ssim.toFixed(3) ?? '-'}</p>
          <p>PSNR: {result?.metrics.psnr.toFixed(2) ?? '-'}</p>
          <p>ΔRGB: {result ? `${result.metrics.deltaRGB.R.toFixed(1)} / ${result.metrics.deltaRGB.G.toFixed(1)} / ${result.metrics.deltaRGB.B.toFixed(1)}` : '-'}</p>
          <p>ΔLuminance: {result?.metrics.deltaLuminance.toFixed(2) ?? '-'}</p>
        </div>
        <div className={`${cardCls} p-4 text-xs space-y-2`}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles size={15} /> Kalite Uyarıları</h3>
          {result?.qualityWarnings.length ? result.qualityWarnings.map((w) => <p key={w} className="flex gap-1"><AlertTriangle size={13} /> {w}</p>) : <p>Uyarı yok.</p>}
          <button onClick={() => onSave?.(result)} className="w-full mt-2 bg-emerald-600 text-white rounded-lg py-2 font-semibold inline-flex items-center justify-center gap-2"><Save size={14} /> Sonucu Kaydet</button>
        </div>
      </aside>
    </div>
  );
}
