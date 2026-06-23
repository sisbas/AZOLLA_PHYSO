import React, { useState } from 'react';
import { Upload, FileCode, CheckCircle2, Loader2, AlertTriangle, AlertCircle, Database, CalendarDays, Lightbulb } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../App';

interface UploadPanelProps {
  onComplete: (taskId: string) => void;
}

type Timepoint = 'before' | 'after' | 'unknown';

interface ParsedExperimentMeta {
  groupName: string;
  timepoint: Timepoint;
  confidence: 'high' | 'low';
  errorLabel?: string;
}

interface UploadFileModel {
  file: File;
  groupName: string;
  timepoint: Timepoint;
  parsedMeta: ParsedExperimentMeta;
}

interface ProcessingFileError {
  filename?: string;
  error?: string;
  step?: string;
  details?: unknown;
  remediation?: string;
}

const toIsoTimestamp = (date: Date) => date.toISOString();

const parseExperimentMetaFromFilename = (filename: string): ParsedExperimentMeta => {
  const normalized = filename
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9çğıöşü]+/gi, '_');

  const groupMatch = normalized.match(/(kontrol\d+|control\d+|group\d+|grup\d+|[a-zçğıöşü]+\d*)/i);
  const beforeMatch = /(?:oncesi|once|before)/i.test(normalized);
  const afterMatch = /(?:sonrasi|sonra|after)/i.test(normalized);

  if (groupMatch && (beforeMatch || afterMatch)) {
    return {
      groupName: groupMatch[1].toLowerCase(),
      timepoint: beforeMatch ? 'before' : 'after',
      confidence: 'high',
    };
  }

  return {
    groupName: 'unassigned',
    timepoint: 'unknown',
    confidence: 'low',
    errorLabel: 'otomatik eşleşmedi',
  };
};

const timestampFromFilename = (filename: string): string | null => {
  const patterns: RegExp[] = [
    /(20\d{2})[-_\. ]?(0[1-9]|1[0-2])[-_\. ]?([0-2]\d|3[01])(?:[Tt_\- ]?([01]\d|2[0-3])[-_\. ]?([0-5]\d)(?:[-_\. ]?([0-5]\d))?)?/,
    /([0-2]\d|3[01])[-_\. ](0[1-9]|1[0-2])[-_\. ](20\d{2})(?:[Tt_\- ]?([01]\d|2[0-3])[-_\. ]?([0-5]\d)(?:[-_\. ]?([0-5]\d))?)?/,
  ];

  for (const [index, pattern] of patterns.entries()) {
    const match = filename.match(pattern);
    if (!match) continue;

    const [, first, second, third, hour = '00', minute = '00', secondPart = '00'] = match;
    const year = index === 0 ? first : third;
    const month = index === 0 ? second : second;
    const day = index === 0 ? third : first;
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${secondPart}.000Z`);

    if (!Number.isNaN(date.getTime())) {
      return toIsoTimestamp(date);
    }
  }

  return null;
};


const formatDetectedDate = (timestamp: string) => timestamp.slice(0, 10);

const suggestedDatedFilename = (filename: string) => {
  const lastDotIndex = filename.lastIndexOf('.');
  const baseName = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
  const extension = lastDotIndex > 0 ? filename.slice(lastDotIndex) : '';

  return `${baseName}_YYYY-MM-DD${extension}`;
};

const defaultProcessingRemediation = 'Verify image contrast and sample density in the uploaded series.';

const dataTransferRemediation = 'Görüntü verisi aktarımı/formatı kontrol edilmeli; dosya adını kısaltın, dosyanın bozulmadığını ve desteklenen TIFF/PNG/JPG formatında yeniden aktarıldığını doğrulayın.';

const isDataTransferFailure = (fileError?: ProcessingFileError) => {
  if (!fileError) return false;

  return fileError.step === 'critical' || /file name too long/i.test(fileError.error ?? '');
};

const remediationForFileError = (fileError?: ProcessingFileError) => {
  if (fileError?.remediation) return fileError.remediation;

  return isDataTransferFailure(fileError) ? dataTransferRemediation : defaultProcessingRemediation;
};

const fileDateMetadata = (file: File) => {
  const detectedTimestamp = timestampFromFilename(file.name);

  return detectedTimestamp
    ? { detectedDate: formatDetectedDate(detectedTimestamp), suggestion: null }
    : { detectedDate: null, suggestion: suggestedDatedFilename(file.name) };
};

const timestampForFile = (file: File) => {
  const filenameTimestamp = timestampFromFilename(file.name);
  if (filenameTimestamp) return filenameTimestamp;

  const lastModified = new Date(file.lastModified);
  if (!Number.isNaN(lastModified.getTime())) {
    return toIsoTimestamp(lastModified);
  }

  return toIsoTimestamp(new Date(0));
};

export default function UploadPanel({ onComplete }: UploadPanelProps) {
  type SegmentationActionState = 'idle' | 'loading' | 'success' | 'error';
  const [firstDateFiles, setFirstDateFiles] = useState<File[]>([]);
  const [secondDateFiles, setSecondDateFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pipelineStage, setPipelineStage] = useState<string>('queued');
  const [currentFile, setCurrentFile] = useState<string>('');
  const [error, setError] = useState<{ message: string; remediation?: string; fileErrors?: ProcessingFileError[] } | null>(null);
  const [actionState, setActionState] = useState<SegmentationActionState>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [manualMetaOverrides, setManualMetaOverrides] = useState<Record<string, { groupName: string; timepoint: Timepoint }>>({});

  const getFileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;

  const uploadModels: UploadFileModel[] = [
    ...firstDateFiles.map((file) => {
      const parsedMeta = parseExperimentMetaFromFilename(file.name);
      const manualOverride = manualMetaOverrides[getFileKey(file)];
      return {
        file,
        groupName: manualOverride?.groupName ?? parsedMeta.groupName,
        timepoint: manualOverride?.timepoint ?? parsedMeta.timepoint,
        parsedMeta,
      };
    }),
    ...secondDateFiles.map((file) => {
      const parsedMeta = parseExperimentMetaFromFilename(file.name);
      const manualOverride = manualMetaOverrides[getFileKey(file)];
      return {
        file,
        groupName: manualOverride?.groupName ?? parsedMeta.groupName,
        timepoint: manualOverride?.timepoint ?? parsedMeta.timepoint,
        parsedMeta,
      };
    }),
  ];

  const updateUploadModel = (file: File, patch: Partial<Pick<UploadFileModel, 'groupName' | 'timepoint'>>) => {
    const key = getFileKey(file);
    setManualMetaOverrides((prev) => {
      const base = prev[key] ?? { groupName: parseExperimentMetaFromFilename(file.name).groupName, timepoint: parseExperimentMetaFromFilename(file.name).timepoint };
      return {
        ...prev,
        [key]: {
          groupName: patch.groupName ?? base.groupName,
          timepoint: patch.timepoint ?? base.timepoint,
        },
      };
    });
  };

  const handleFileChange = (target: 'first' | 'second') => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const selectedFiles = Array.from(e.target.files);
    if (target === 'first') {
      setFirstDateFiles(selectedFiles);
    } else {
      setSecondDateFiles(selectedFiles);
    }
    setManualMetaOverrides({});
    setError(null);
  };

  const uploadFiles = async () => {
    if (firstDateFiles.length === 0 || secondDateFiles.length === 0) return;
    setIsUploading(true);
    setActionState('loading');
    setError(null);
    setToastMessage(null);
    
    // Warm up connection to ensure session cookies are set
    try {
      await fetch('/api/health', { credentials: 'include' });
    } catch (e) {
      console.warn("Warming check failed, continuing anyway...");
    }
    
    const formData = new FormData();
    const orderedFiles = uploadModels
      .map((model, fileIndex) => ({ ...model, fileIndex }))
      .sort((a, b) => timestampForFile(a.file).localeCompare(timestampForFile(b.file)));

    orderedFiles.forEach(({ file, fileIndex, groupName, timepoint }) => {
      formData.append('images', file);
      formData.append('timestamps', timestampForFile(file));
      formData.append('groups', timepoint === 'before' ? 'first_date' : timepoint === 'after' ? 'second_date' : 'unknown');
      formData.append('group_name[]', groupName);
      formData.append('timepoint[]', timepoint);
      formData.append('file_index[]', String(fileIndex));
    });
    formData.append('experiment_id', `EXP-${Date.now()}`);
    const parsedPoolArea = 16.0;
    formData.append('pool_area_m2', String(parsedPoolArea));

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
          setPipelineStage(statusData.stage || 'processing');
          setCurrentFile(statusData.current_file || '');
          
          if (statusData.status === 'completed' || statusData.status === 'completed_with_errors') {
            clearInterval(poll);
            onComplete(data.task_id);
            setIsUploading(false);
            setActionState('success');
            setLastUpdatedAt(new Date().toISOString());
            setToastMessage('Segmentasyon işlemi başarıyla tamamlandı.');
          } else if (statusData.status === 'failed') {
            clearInterval(poll);
            const fileErrors: ProcessingFileError[] = Array.isArray(statusData.results?.errors) ? statusData.results.errors : [];
            const firstFileError = fileErrors[0];
            const firstFileRemediation = remediationForFileError(firstFileError);

            setError({
              message: statusData.error || firstFileError?.error || 'Pipeline execution failed.',
              remediation: firstFileRemediation,
              fileErrors
            });
            setIsUploading(false);
            setActionState('error');
          }
        } catch (pollErr: any) {
          clearInterval(poll);
          setError({
            message: 'Polling failed.',
            remediation: 'The server may be overloaded. Try a smaller batch of images.'
          });
          setIsUploading(false);
          setActionState('error');
        }
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setError({
        message: err.message || 'Network error during upload.',
        remediation: 'Check your connection or ensure files are valid TIFF/PNG formats.'
      });
      setIsUploading(false);
      setActionState('error');
    }
  };

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
    uploadFiles();
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
        </div>
        <p className="text-sm text-slate-500 font-medium">İki farklı tarihte toplanan doku örneklerini yükleyerek biyolojik progresyonu karşılaştırın.</p>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-white p-2 text-emerald-600 shadow-sm">
            <Lightbulb size={18} />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">İyi veri için ipuçları</p>
              <p className="mt-1 text-xs font-medium text-emerald-900/80">Analiz tutarlılığı için çekim koşullarını her ölçümde aynı tutun.</p>
            </div>
            <ul className="grid gap-2 text-xs font-semibold text-emerald-900 sm:grid-cols-2">
              <li>• Kamerayı sabit konumda kullanın.</li>
              <li>• Homojen ışık sağlayın.</li>
              <li>• Her çekimde aynı havuz alanını kadraja alın.</li>
              <li>• Dosya adında tarihi belirtin: YYYY-MM-DD.</li>
              <li>• Bulanık görüntülerden kaçının.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className={cn(
        "bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl p-8 md:p-12 transition-all shadow-xl shadow-slate-200/50 group relative overflow-hidden",
        firstDateFiles.length > 0 || secondDateFiles.length > 0 ? "ring-2 ring-slate-900 border-transparent" : "hover:border-primary/50"
      )}>
        <div className="absolute inset-0 opacity-[0.03] scientific-grid pointer-events-none" />
        <div className="grid gap-6 md:grid-cols-2">
          {[
            { key: 'first', label: 'İlk tarih doku örneği', sub: 'Referans başlangıç ölçümü', id: 'first-date-upload' },
            { key: 'second', label: 'İkinci tarih doku örneği', sub: 'Takip ölçümü (stres progresyonu)', id: 'second-date-upload' },
          ].map((slot) => (
            <label key={slot.id} htmlFor={slot.id} className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 flex flex-col items-center gap-5 hover:border-emerald-300 transition-colors">
              <input
                type="file"
                multiple
                onChange={handleFileChange(slot.key as 'first' | 'second')}
                className="hidden"
                id={slot.id}
                disabled={isUploading}
              />
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm">
                <Upload size={28} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-800 tracking-tight">{slot.label}</p>
                <p className="text-xs text-slate-500 mt-1">{slot.sub}</p>
              </div>
              <div className="text-[10px] font-semibold text-slate-500">TIFF/RAW · PNG/JPG</div>
            </label>
          ))}
        </div>
      </div>

      {(firstDateFiles.length > 0 || secondDateFiles.length > 0) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden"
        >
          <div className="flex items-center justify-between pb-6 border-b border-slate-50">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Batch Meta</span>
              <span className="font-black text-sm text-slate-900 uppercase tracking-tighter">{firstDateFiles.length + secondDateFiles.length} Kayıt Sırada</span>
            </div>
            {isUploading ? (
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white rounded-xl shadow-lg shadow-black/10 transition-all">
                <Loader2 size={16} className="animate-spin text-emerald-400" />
                <span className="font-mono text-xs font-bold leading-none">PROCESS_{progress}%</span>
              </div>
            ) : (
              <button 
                onClick={uploadFiles}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    uploadFiles();
                  }
                }}
                disabled={isUploading}
                aria-label="Segmentasyon karşılaştırmasını başlat"
                className={cn(
                  'group relative bg-[#10b981] text-white px-8 py-3 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all shadow-xl shadow-emerald-200 overflow-hidden focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300',
                  isUploading ? 'cursor-not-allowed opacity-70' : 'hover:bg-emerald-600'
                )}
              >
                <span className="relative z-10 flex items-center gap-3">
                  {actionState === 'loading' ? (
                    <>
                      Segmentasyon Çalışıyor <Loader2 size={16} className="animate-spin" />
                    </>
                  ) : actionState === 'success' ? (
                    <>
                      Segmentasyon Tamamlandı <CheckCircle2 size={16} />
                    </>
                  ) : actionState === 'error' ? (
                    <>
                      Segmentasyon Hatası <AlertCircle size={16} />
                    </>
                  ) : (
                    <>
                      Tarihsel Doku Karşılaştırmasını Başlat <CheckCircle2 size={16} />
                    </>
                  )}
                </span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform" />
              </button>
            )}
          </div>
          {lastUpdatedAt && (
            <p className="text-[11px] text-emerald-700 font-semibold">
              Son güncelleme: {new Date(lastUpdatedAt).toLocaleString('tr-TR')}
            </p>
          )}
          
          <div className="space-y-2 max-h-56 overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-slate-200">
            {uploadModels.map(({ file, groupName, timepoint, parsedMeta }, i) => {
              const dateMetadata = fileDateMetadata(file);

              return (
                <div key={i} className="flex flex-col gap-3 py-3 px-4 rounded-xl bg-slate-50 border border-slate-100/50 group hover:bg-white hover:shadow-md hover:border-slate-200 transition-all sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="p-1.5 bg-white rounded-lg border border-slate-100 shadow-sm text-slate-400">
                      <FileCode size={14} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">{groupName}</span>
                      <span className="block truncate text-xs font-bold text-slate-700 sm:max-w-[240px]">{file.name}</span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700">
                        Zaman: {timepoint}
                      </span>
                      {parsedMeta.confidence === 'low' && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                          {parsedMeta.errorLabel}
                        </span>
                      )}
                      {dateMetadata.detectedDate ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                          <CalendarDays size={10} /> Tarih: {dateMetadata.detectedDate}
                        </span>
                      ) : (
                        <span className="block text-[9px] font-semibold leading-relaxed text-amber-600">
                          Tarih algılanmadı. Öneri: <span className="font-mono">{dateMetadata.suggestion}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:justify-end">
                    <span className="text-slate-300 font-mono text-[9px] uppercase">Image/Series</span>
                    <span className="text-slate-900 font-mono text-[10px] font-bold leading-none shrink-0">{(file.size / 1024 / 1024).toFixed(2)}<span className="text-slate-300 ml-0.5">MB</span></span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Grup Eşleme</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">Dosya adı</th>
                    <th className="py-2 pr-3">Otomatik Grup</th>
                    <th className="py-2 pr-3">Zaman Noktası</th>
                    <th className="py-2">Manuel Düzeltme</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadModels.map((model, index) => (
                    <tr key={`${model.file.name}-${index}`} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3 font-semibold text-slate-700">{model.file.name}</td>
                      <td className="py-2 pr-3">
                        <span className="font-mono">{model.parsedMeta.groupName}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-mono">{model.parsedMeta.timepoint}</span>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <select
                            className="rounded-md border border-slate-300 bg-white px-2 py-1"
                            value={model.groupName}
                            onChange={(e) => updateUploadModel(model.file, { groupName: e.target.value })}
                          >
                            {[model.groupName, 'kontrol1', 'kontrol2', 'unassigned'].filter((value, idx, arr) => arr.indexOf(value) === idx).map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                          <select
                            className="rounded-md border border-slate-300 bg-white px-2 py-1"
                            value={model.timepoint}
                            onChange={(e) => updateUploadModel(model.file, { timepoint: e.target.value as Timepoint })}
                          >
                            <option value="before">before</option>
                            <option value="after">after</option>
                            <option value="unknown">unknown</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {isUploading && (
            <div className="space-y-2">
               <div className="flex justify-between text-[9px] font-bold uppercase text-slate-400 tracking-widest">
                  <span>Pipeline Sync</span>
                  <span>{progress === 100 ? 'COMPLETE' : 'STREAMING...'}</span>
               </div>
               <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>Stage: {pipelineStage}</span>
                  <span className="truncate max-w-[220px] text-right">{currentFile || 'Hazırlanıyor'}</span>
               </div>
               <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-300" 
                />
               </div>
               {progress < 10 && (
                <div className="grid grid-cols-3 gap-2 animate-pulse pt-2" aria-label="İşlem hazırlanıyor, içerik yükleniyor">
                  <div className="h-3 rounded bg-slate-200" />
                  <div className="h-3 rounded bg-slate-200" />
                  <div className="h-3 rounded bg-slate-200" />
                </div>
               )}
            </div>
          )}
        </motion.div>
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 top-6 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 shadow-lg"
        >
          {toastMessage}
        </div>
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
            {error.fileErrors && error.fileErrors.length > 0 && (
              <ul className="mt-3 space-y-2 text-left text-xs">
                {error.fileErrors.map((fileError, index) => (
                  <li key={`${fileError.filename || 'file'}-${index}`} className="rounded-xl bg-white/70 p-3 text-rose-950 ring-1 ring-rose-100">
                    <span className="font-black">{fileError.filename || `Dosya ${index + 1}`}</span>
                    <span className="block opacity-80">{fileError.error || 'Bilinmeyen hata'}</span>
                    {fileError.step && <span className="block opacity-60">Adım: {fileError.step}</span>}
                    <span className="block italic opacity-70">{remediationForFileError(fileError)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={handleRetry}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRetry();
                }
              }}
              aria-label="Segmentasyon işlemini tekrar dene"
              className="mt-2 w-fit rounded-lg border border-rose-300 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-700 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200"
            >
              Tekrar dene {retryCount > 0 ? `(${retryCount})` : ''}
            </button>
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
