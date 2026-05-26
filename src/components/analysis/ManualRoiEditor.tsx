import React from 'react';

export type RoiPoint = { x: number; y: number };

interface ManualRoiEditorProps {
  imageUrl?: string;
  points: RoiPoint[];
  onChange: (points: RoiPoint[]) => void;
  onSave: (payload: { polygon: RoiPoint[]; coordinate_space: 'pixel' | 'normalized' }) => void;
}

/**
 * Skeleton editor plan:
 * - polygon çizimi (canvas pointer events)
 * - nokta taşıma (drag handles)
 * - temizleme (reset)
 * - kaydetme (polygon payload)
 */
export default function ManualRoiEditor({ imageUrl, points, onChange, onSave }: ManualRoiEditorProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">Manual ROI Editor (Taslak)</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md border border-slate-300"
            onClick={() => onChange([])}
          >
            Temizle
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white"
            onClick={() => onSave({ polygon: points, coordinate_space: 'pixel' })}
          >
            ROI Kaydet
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Çizim yüzeyi ve draggable vertex işlevleri bir sonraki adımda eklenecek.
      </div>

      <div className="h-56 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-500">
        {imageUrl ? 'Canvas overlay placeholder' : 'Önce görüntü seçin'}
      </div>
    </section>
  );
}
