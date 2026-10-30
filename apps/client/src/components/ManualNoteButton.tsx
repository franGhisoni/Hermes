import { useState } from 'react';
import { FilePlus2, ImagePlus, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { EditorialModal } from './EditorialModal';

type ManualMode = 'WRITER' | 'POLICE';

const MODES: Array<{ key: ManualMode; label: string; hint: string; placeholder: string }> = [
    {
        key: 'WRITER',
        label: 'Redactor',
        hint: 'Pegá una nota, un borrador o la idea de una nota. La IA la redacta con el estilo del portal.',
        placeholder: 'Pegá acá la nota, los apuntes o la idea...'
    },
    {
        key: 'POLICE',
        label: 'Parte policial',
        hint: 'Pegá el parte o comunicado oficial. La IA lo traduce a nota periodística y marca los puntos a revisar.',
        placeholder: 'Pegá acá el parte policial completo...'
    }
];

// Shrinks the photo before upload so the request stays small.
function resizeImage(file: File, maxSide = 1600): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
            img.onload = () => {
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });
}

export function ManualNoteButton() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<ManualMode>('WRITER');
    const [text, setText] = useState('');
    const [title, setTitle] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageData, setImageData] = useState('');
    const [instructions, setInstructions] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const current = MODES.find(item => item.key === mode)!;

    const close = () => {
        if (submitting) return;
        setOpen(false);
        setError('');
    };

    const submit = async () => {
        setSubmitting(true);
        setError('');
        try {
            const res = await api.post('/api/articles/manual', { mode, text, title, imageUrl: imageData ? '' : imageUrl, imageData, instructions });
            setText('');
            setTitle('');
            setImageUrl('');
            setImageData('');
            setInstructions('');
            setOpen(false);
            navigate(`/newsroom/${res.data.id}`);
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
            setError(detail || 'No se pudo generar la nota.');
        } finally {
            setSubmitting(false);
        }
    };

    const pickFile = async (file?: File) => {
        if (!file) return;
        setError('');
        try {
            setImageData(await resizeImage(file));
            setImageUrl('');
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const preview = imageData || (imageUrl.trim().startsWith('http') ? imageUrl.trim() : '');

    const inputClass = 'w-full border border-editorial-text/15 bg-white px-3 py-2 text-sm outline-none focus:border-editorial-text';

    return <>
        <button type="button" onClick={() => setOpen(true)} title="Subir nota manual" className="inline-flex items-center gap-1.5 border border-editorial-text bg-editorial-text px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-editorial-bg transition-opacity hover:opacity-85">
            <FilePlus2 size={14} /><span>Nota manual</span>
        </button>
        {open && <EditorialModal title="Subir nota manual" eyebrow="Redacción" onClose={close} wide>
            <div role="tablist" aria-label="Tipo de nota" className="grid grid-cols-2 border border-editorial-text/20">
                {MODES.map(item => (
                    <button key={item.key} type="button" role="tab" aria-selected={mode === item.key} disabled={submitting} onClick={() => setMode(item.key)}
                        className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${mode === item.key ? 'bg-editorial-text text-editorial-bg' : 'text-editorial-text/60 hover:bg-editorial-text/5'}`}>
                        {item.label}
                    </button>
                ))}
            </div>
            <p className="text-sm leading-relaxed text-editorial-text/65">{current.hint}</p>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={12} placeholder={current.placeholder} aria-label="Texto de la nota" disabled={submitting} className={`${inputClass} resize-y leading-relaxed`} />
            <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-editorial-text/50">
                <span>Título sugerido (opcional)</span>
                <input value={title} onChange={e => setTitle(e.target.value)} disabled={submitting} className={`${inputClass} font-normal normal-case tracking-normal`} />
            </label>
            <div className="space-y-1">
                <p id="manual-note-photo" className="text-[10px] font-bold uppercase tracking-wider text-editorial-text/50">Foto de la nota (opcional: si no elegís, se busca una)</p>
                {preview ? (
                    <div className="relative w-full max-w-xs">
                        <img src={preview} alt="Foto elegida" className="aspect-[4/3] w-full border border-editorial-text/15 object-cover" />
                        <button type="button" onClick={() => { setImageData(''); setImageUrl(''); }} disabled={submitting} aria-label="Quitar foto"
                            className="absolute right-2 top-2 rounded-full border border-editorial-text/20 bg-editorial-bg p-1.5 hover:border-editorial-text"><X size={14} /></button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <label className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 border border-editorial-text/30 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-editorial-text/5 ${submitting ? 'pointer-events-none opacity-40' : ''}`}>
                            <ImagePlus size={14} /> Subir foto
                            <input type="file" accept="image/*" className="sr-only" aria-describedby="manual-note-photo" disabled={submitting} onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} aria-label="URL de la foto" placeholder="o pegá la URL de una imagen" disabled={submitting} className={inputClass} />
                    </div>
                )}
            </div>
            <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-editorial-text/50">
                <span>Indicaciones para la IA (opcional)</span>
                <input value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Ej: hacé foco en la víctima, no nombres al comisario" disabled={submitting} className={`${inputClass} font-normal normal-case tracking-normal`} />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex items-center justify-end gap-4">
                {submitting && <span role="status" className="text-xs text-editorial-text/55">Redactando y buscando imagen, puede tardar un minuto...</span>}
                <button type="button" onClick={() => void submit()} disabled={submitting || text.trim().length < 20}
                    className="inline-flex items-center gap-2 border border-editorial-text bg-editorial-text px-4 py-2 text-xs font-bold uppercase tracking-wider text-editorial-bg disabled:opacity-40">
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Generar nota
                </button>
            </div>
        </EditorialModal>}
    </>;
}
