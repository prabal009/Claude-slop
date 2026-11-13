import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Printer } from 'lucide-react';
import { usePortal } from '../PortalContext';
import { Button, Empty } from '../components/ui';
import type { Job, StoredDocument } from '../types';

const MAX_BYTES = 20 * 1024 * 1024;
const formats: Record<string, { mime: string; signature: number[]; preview: boolean }> = {
  pdf: { mime: 'application/pdf', signature: [37, 80, 68, 70, 45], preview: true },
  png: { mime: 'image/png', signature: [137, 80, 78, 71, 13, 10, 26, 10], preview: true },
  jpg: { mime: 'image/jpeg', signature: [255, 216, 255], preview: true },
  jpeg: { mime: 'image/jpeg', signature: [255, 216, 255], preview: true },
  doc: { mime: 'application/msword', signature: [208, 207, 17, 224, 161, 177, 26, 225], preview: false },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: [80, 75, 3, 4], preview: false },
};
export interface DocumentQuality { preview: boolean; mime: string; warnings: string[]; }
export async function inspectDocument(file: StoredDocument): Promise<DocumentQuality> {
  if (!(file.blob instanceof Blob) || !file.blob.size || file.blob.size > MAX_BYTES) throw new Error('The file must contain data and be no larger than 20 MiB.');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const format = formats[extension];
  if (!format || (file.mimeType && file.mimeType !== format.mime) || (file.blob.type && file.blob.type !== format.mime)) throw new Error('The file type does not match a supported PDF, Word, JPEG, or PNG file.');
  const head = new Uint8Array(await file.blob.slice(0, 16).arrayBuffer());
  if (!format.signature.every((byte, index) => head[index] === byte)) throw new Error('The file signature does not match its format. Ask for a valid original file.');
  const warnings: string[] = [];
  if (extension === 'pdf') {
    const first = await file.blob.slice(0, Math.min(file.blob.size, 1024 * 1024)).text();
    const tail = await file.blob.slice(Math.max(0, file.blob.size - 65536)).text();
    if (!(await file.blob.slice(Math.max(0, file.blob.size - 1024)).text()).includes('%%EOF')) throw new Error('The PDF may be truncated: its end marker is missing. Ask for a new PDF.');
    warnings.push((first + tail).includes('/Encrypt') ? 'This PDF declares encryption. Ask for an unlocked copy before printing.' : 'No encryption marker was found in sampled PDF data. Password protection and full PDF validity cannot be ruled out.');
  }
  if (extension === 'docx') {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    if (!text.includes('[Content_Types].xml') || !text.includes('word/')) throw new Error('This ZIP file does not contain the expected Word document structure.');
  }
  if (!format.preview) warnings.push('Word files require a trusted local application. Browser preview and conversion are not available.');
  return { preview: format.preview, mime: format.mime, warnings };
}

export function DocumentPanel({ job }: { job: Job }) {
  const { service, notify, t } = usePortal();
  const [file, setFile] = useState<StoredDocument | null>(null);
  const [quality, setQuality] = useState<DocumentQuality | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [printOnLoad, setPrintOnLoad] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl = ''; let image: HTMLImageElement | null = null;
    setFile(null); setQuality(null); setUrl(''); setError(''); setPreview(false); setPreviewError(false); setDimensions(null); setFrameReady(false); setPrintOnLoad(false);
    if (!job.documentId) { setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const document = await service.getDocument(job.documentId!);
        if (document.id !== job.documentId) throw new Error('The attached file does not match this job.');
        const inspection = await inspectDocument(document);
        if (!active) return;
        objectUrl = URL.createObjectURL(document.blob);
        setFile(document); setQuality(inspection); setUrl(objectUrl);
        if (inspection.mime.startsWith('image/')) {
          image = new Image();
          image.onload = () => { if (active) setDimensions({ width: image!.naturalWidth, height: image!.naturalHeight }); };
          image.onerror = () => { if (active) setError('The image could not be decoded. Ask for a new image before printing.'); };
          image.src = objectUrl;
        }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'The attached file could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; if (image) { image.onload = null; image.onerror = null; image.src = ''; } if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [job.documentId, service]);
  function printFile() {
    if (!quality?.preview || !url || error) return;
    if (!preview || !frameReady) { setPrintOnLoad(true); setPreview(true); return; }
    try {
      if (!frame.current?.contentWindow) throw new Error('Preview unavailable');
      frame.current.contentWindow.focus(); frame.current.contentWindow.print();
    } catch { notify('The browser blocked embedded printing. Open the file and use the browser print command.', 'info'); }
  }
  const preferencesValid = Number.isInteger(job.pageCount) && job.pageCount > 0 && job.pageCount <= 1000 && Number.isInteger(job.copies) && job.copies > 0 && job.copies <= 100 && ['bw', 'colour'].includes(job.colorMode) && ['A4', 'A3'].includes(job.paperSize) && typeof job.duplex === 'boolean';
  const lowResolution = dimensions && (Math.min(dimensions.width, dimensions.height) < (job.paperSize === 'A3' ? 1754 : 1240) || Math.max(dimensions.width, dimensions.height) < (job.paperSize === 'A3' ? 2480 : 1754));
  return <section className="stack" aria-label={t('Document and quality checks')}>
    <div className="row"><FileText size={18} /><h3>{t('Document and quality checks')}</h3></div>
    <dl className="job-meta"><div><dt>{t('Document')}</dt><dd>{job.documentName}</dd></div><div><dt>{t('Original filename')}</dt><dd>{file?.name ?? job.originalFileName ?? t('Not attached')}</dd></div><div><dt>{t('File type')}</dt><dd>{file?.mimeType ?? job.mimeType ?? t('Unavailable')}</dd></div><div><dt>{t('File size')}</dt><dd>{file ? `${(file.blob.size / 1024).toFixed(1)} ${t('KiB')}` : job.fileSize !== null ? `${(job.fileSize / 1024).toFixed(1)} ${t('KiB')}` : t('Unavailable')}</dd></div><div><dt>{t('Job token')}</dt><dd>{job.token}</dd></div><div><dt>{t('Print preferences')}</dt><dd>{job.pageCount} {t('pages')} · {job.copies} {t('copies')} · {t(job.colorMode === 'bw' ? 'B&W' : 'Colour')} · {t(job.duplex ? 'Double-sided' : 'Single-sided')} · {job.paperSize}</dd></div></dl>
    {!preferencesValid && <p className="notice notice-error" role="alert">{t('Page count or print preferences are invalid. Correct the job before printing.')}</p>}
    {!job.documentId && <Empty title={t('Document information available — no file attached.')} description={t('Ask for the original file or attach a file to a new demo job in settings.')} />}
    {loading && <p role="status">{t('Loading file and checking format…')}</p>}
    {error && <p className="notice notice-error" role="alert">{t(error)}</p>}
    {quality && <><p className="notice notice-success">{t('File content, size, supported type, and format signature checked.')}</p>{quality.warnings.map(warning => <p key={warning} className="notice notice-warning">{t(warning)}</p>)}</>}
    {dimensions && <p className={lowResolution ? 'notice notice-warning' : 'muted'}>{dimensions.width} × {dimensions.height} {t('pixels')}. {t(lowResolution ? 'Resolution may be too low for 150 dpi full-page printing at the selected paper size. Check a proof before printing.' : 'Image dimensions meet the approximate 150 dpi full-page threshold. Inspect the preview before printing.')}</p>}
    {url && file && quality && !error && <div className="toolbar wrap">
      {quality.preview && <Button variant="secondary" onClick={() => { setPreview(value => !value); setPreviewError(false); setFrameReady(false); setPrintOnLoad(false); }}>{t(preview ? 'Hide preview' : 'Preview file')}</Button>}
      <a className="button secondary" href={url} download={file.name}><Download size={16} />{t('Download original')}</a>
      {quality.preview && <><a className="button secondary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{t('Open file')}</a><Button variant="secondary" disabled={!preferencesValid || previewError} onClick={printFile}><Printer size={16} />{t('Print document')}</Button></>}
    </div>}
    {preview && url && quality?.preview && !error && <div className="stack">
      <p className="small muted">{t('If the browser cannot display this preview, open or download the original file.')}</p>
      {previewError && <p className="notice notice-warning" role="alert">{t('The browser could not display this preview. Open or download the original file to view or print it in a supported application.')}</p>}
      <iframe ref={frame} src={url} title={t('Document preview')} sandbox="allow-same-origin allow-modals" style={{ width: '100%', height: 440, border: '1px solid #dde1eb', borderRadius: 6 }} onErrorCapture={() => { setPreviewError(true); setFrameReady(false); setPrintOnLoad(false); }} onLoad={() => { setFrameReady(true); if (printOnLoad && !previewError) { setPrintOnLoad(false); try { frame.current?.contentWindow?.print(); } catch { notify('The browser blocked embedded printing. Open the file and use the browser print command.', 'info'); } } }} />
    </div>}
    <p className="small muted">{t('These are basic file checks, not malware scanning or guaranteed print quality. Browser printing is separate from queue status and does not mark the job ready.')}</p>
  </section>;
}
