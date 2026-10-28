import { useState } from 'react';
import { FilePlus2, Loader2 } from 'lucide-react';
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

export function ManualNoteButton() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<ManualMode>('WRITER');
    const [text, setText] = useState('');
    const [title, setTitle] = useState('');
    const [imageUrl, setImageUrl] = useState('');
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
            const res = await api.post('/api/articles/manual', { mode, text, title, imageUrl, instructions });
            setText('');
            setTitle('');
            setImageUrl('');
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
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-editorial-text/50">
                    <span>Título sugerido (opcional)</span>
                    <input value={title} onChange={e => setTitle(e.target.value)} disabled={submitting} className={`${inputClass} font-normal normal-case tracking-normal`} />
                </label>
                <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-editorial-text/50">
                    <span>URL de imagen (opcional)</span>
                    <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Si queda vacío, se busca una" disabled={submitting} className={`${inputClass} font-normal normal-case tracking-normal`} />
                </label>
            </div>
            <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-editorial-text/50">
                <span>Indicaciones para la IA (opcional)</span>
                <input value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Ej: hacé foco en la víctima, no nombres al comisario" disabled={submitting} className={`${inputClass} font-normal normal-case tracking-normal`} />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex items-center justify-end gap-4">
                {submitting && <span className="text-xs text-editorial-text/55">Redactando y buscando imagen, puede tardar un minuto...</span>}
                <button type="button" onClick={() => void submit()} disabled={submitting || text.trim().length < 20}
                    className="inline-flex items-center gap-2 border border-editorial-text bg-editorial-text px-4 py-2 text-xs font-bold uppercase tracking-wider text-editorial-bg disabled:opacity-40">
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Generar nota
                </button>
            </div>
        </EditorialModal>}
    </>;
}
