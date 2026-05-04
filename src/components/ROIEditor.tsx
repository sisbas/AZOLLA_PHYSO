import React, { useMemo, useState } from 'react';
import { Upload, Image as ImageIcon, CheckCircle2, AlertTriangle, Sparkles, Layers3, Activity, Save } from 'lucide-react';
import { defaultPipelineConfig } from '../features/roi-editor/config/pipelineConfig';
import { getImageDataFromElement } from '../features/roi-editor/core/imageData';
import { runScientificPipeline } from '../features/roi-editor/core/pipeline';

interface ROIEditorProps { onSave?: (data: any) => void; }

const STEPS = [
  '1. Ön-İşleme', '2. ROI İzolasyonu', '3. Görüntü Kaydı (Registration)',
  '4. Işık/Renk Normalizasyonu', '5. Bilimsel Metrik Hesaplama', '6. Raporlama'

import { Upload, Image as ImageIcon, CheckCircle2, AlertTriangle, Sparkles, Ruler, Layers3, Activity, Save } from 'lucide-react';

interface ROIEditorProps {
  onSave?: (data: WorkflowOutput) => void;
}

type StageStatus = 'pending' | 'ready' | 'done';

interface Metadata {
  date: string;
  group: 'kontrol' | 'stres';
  repeat: string;
  camera: string;
}

interface WorkflowOutput {
  growthDifference: number;
  normalizedColorDifference: number;
  stressProbability: number;
  qualityWarning: string;
}

const STEPS = [
  '1. Görüntü yükleme',
  '2. Metadata okuma',
  '3. ROI / kap izolasyonu',
  '4. Referans alan tespiti',
  '5. Işık analizi',
  '6. Işık normalizasyonu',
  '7. Ölçek / uzaklık analizi',
  '8. Geometrik normalizasyon',
  '9. Azolla segmentasyonu',
  '10. Alan ve kaplama analizi',
  '11. Renk/stres analizi',
  '12. Zaman serisi karşılaştırması',
  '13. Çıktı'
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

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Metadata>({
    date: new Date().toISOString().slice(0, 10),
    group: 'kontrol',
    repeat: 'R1',
    camera: 'Telefon / Otomatik'
  });
  const [pxPerCm, setPxPerCm] = useState(38);
  const [potDiameterCm, setPotDiameterCm] = useState(8.5);

  const stageStatuses = useMemo<StageStatus[]>(() => {
    const ready = imageUrl ? 13 : 1;
    return STEPS.map((_, i) => (i < ready ? 'done' : i === ready ? 'ready' : 'pending'));
  }, [imageUrl]);

  const mock = useMemo(() => {
    if (!imageUrl) {
      return {
        rgb: [0, 0, 0], brightness: 0, deltaE: 0, histogramQuality: 0,
        plantAreaPx: 0, plantAreaCm2: 0, coverageRatio: 0,
        exg: 0, gli: 0, ngrdi: 0, redness: 0, yellowing: 0,
        growthDiff: 0, colorDiff: 0, stressProb: 0, qualityWarning: 'Görüntü bekleniyor.'
      };
    }

    const plantAreaPx = Math.round(Math.PI * Math.pow((potDiameterCm * pxPerCm) / 2, 2) * 0.62);
    const plantAreaCm2 = +(plantAreaPx / (pxPerCm * pxPerCm)).toFixed(2);
    const coverageRatio = +(plantAreaPx / (Math.PI * Math.pow((potDiameterCm * pxPerCm) / 2, 2))).toFixed(3);
    const stressProb = metadata.group === 'stres' ? 0.71 : 0.24;

    return {
      rgb: [96, 142, 88],
      brightness: 121,
      deltaE: metadata.group === 'stres' ? 8.3 : 3.1,
      histogramQuality: 0.88,
      plantAreaPx,
      plantAreaCm2,
      coverageRatio,
      exg: 0.36,
      gli: 0.22,
      ngrdi: 0.19,
      redness: metadata.group === 'stres' ? 0.31 : 0.11,
      yellowing: metadata.group === 'stres' ? 0.29 : 0.08,
      growthDiff: metadata.group === 'stres' ? -13.7 : 6.4,
      colorDiff: metadata.group === 'stres' ? 11.2 : 2.9,
      stressProb,
      qualityWarning: pxPerCm < 20 ? 'Ölçek güveni düşük: cetvel/kap referansı yeniden ayarlayın.' : 'Kalite uygun.'
    };
  }, [imageUrl, metadata.group, potDiameterCm, pxPerCm]);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const saveOutput = () => {
    onSave?.({
      growthDifference: mock.growthDiff,
      normalizedColorDifference: mock.colorDiff,
      stressProbability: mock.stressProb,
      qualityWarning: mock.qualityWarning
    });
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

          <h2 className="text-sm font-bold mb-3">Akış Durumu</h2>
          <ul className="space-y-2">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2 text-xs">
                {stageStatuses[i] === 'done' ? <CheckCircle2 size={14} className="text-emerald-600" /> : <div className="w-3 h-3 rounded-full bg-slate-200" />}
                <span className={stageStatuses[i] === 'done' ? 'text-slate-800 font-semibold' : 'text-slate-500'}>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${cardCls} p-4`}>
          <h3 className="font-semibold text-sm mb-3">Metadata</h3>
          <div className="space-y-2 text-xs">
            <input className="w-full border rounded-lg px-2 py-1" type="date" value={metadata.date} onChange={(e) => setMetadata({ ...metadata, date: e.target.value })} />
            <select className="w-full border rounded-lg px-2 py-1" value={metadata.group} onChange={(e) => setMetadata({ ...metadata, group: e.target.value as Metadata['group'] })}>
              <option value="kontrol">Kontrol Grubu</option>
              <option value="stres">Stres Grubu</option>
            </select>
            <input className="w-full border rounded-lg px-2 py-1" value={metadata.repeat} onChange={(e) => setMetadata({ ...metadata, repeat: e.target.value })} placeholder="Tekrar" />
            <input className="w-full border rounded-lg px-2 py-1" value={metadata.camera} onChange={(e) => setMetadata({ ...metadata, camera: e.target.value })} placeholder="Kamera bilgisi" />
          </div>
        </div>
      </aside>

      <section className="col-span-12 lg:col-span-6 space-y-4">
        <div className={`${cardCls} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><ImageIcon size={16} /> ROI / Segmentasyon Paneli</h3>
            <label className="text-xs px-3 py-1 bg-slate-900 text-white rounded-lg cursor-pointer inline-flex items-center gap-2">
              <Upload size={14} /> Görüntü Seç
              <input className="hidden" type="file" accept="image/*" onChange={handleUpload} />
            </label>
          </div>
          <div className="aspect-video rounded-xl border border-dashed bg-slate-100 flex items-center justify-center overflow-hidden">
            {imageUrl ? <img src={imageUrl} className="w-full h-full object-contain" /> : <p className="text-slate-500 text-sm">Görüntü yükleyin</p>}
          </div>
        </div>

        <div className={`${cardCls} p-4 grid grid-cols-2 gap-3 text-xs`}>
          <label>px/cm<input type="number" className="w-full border rounded-lg px-2 py-1 mt-1" value={pxPerCm} onChange={(e) => setPxPerCm(Number(e.target.value))} /></label>
          <label>Kap çapı (cm)<input type="number" className="w-full border rounded-lg px-2 py-1 mt-1" value={potDiameterCm} onChange={(e) => setPotDiameterCm(Number(e.target.value))} /></label>
        </div>
      </section>

      <aside className="col-span-12 lg:col-span-3 space-y-4">
        <div className={`${cardCls} p-4 text-xs space-y-2`}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Activity size={15} /> Işık / Referans Analizi</h3>
          <p>RGB ort.: {mock.rgb.join(', ')}</p>
          <p>Parlaklık: {mock.brightness}</p>
          <p>Histogram kalite: {(mock.histogramQuality * 100).toFixed(1)}%</p>
          <p>LAB ΔE: {mock.deltaE}</p>
        </div>
        <div className={`${cardCls} p-4 text-xs space-y-2`}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Layers3 size={15} /> Alan / Renk / Stres</h3>
          <p>plant_area_px: {mock.plantAreaPx}</p>
          <p>plant_area_cm²: {mock.plantAreaCm2}</p>
          <p>coverage_ratio: {mock.coverageRatio}</p>
          <p>ExG: {mock.exg} | GLI: {mock.gli}</p>
          <p>NGRDI: {mock.ngrdi}</p>
          <p>RednessIndex: {mock.redness}</p>
          <p>YellowingIndex: {mock.yellowing}</p>
        </div>
        <div className={`${cardCls} p-4 text-xs space-y-2`}>
          <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles size={15} /> Nihai Çıktı</h3>
          <p>Büyüme farkı: {mock.growthDiff}%</p>
          <p>Normalize renk farkı: {mock.colorDiff}</p>
          <p>Stres olasılığı: {(mock.stressProb * 100).toFixed(1)}%</p>
          <p className="flex items-start gap-1"><AlertTriangle size={13} className="mt-0.5" /> {mock.qualityWarning}</p>
          <button onClick={saveOutput} className="w-full mt-2 bg-emerald-600 text-white rounded-lg py-2 font-semibold inline-flex items-center justify-center gap-2"><Save size={14} /> Kaydet</button>
        </div>
      </aside>
    </div>
  );
}
