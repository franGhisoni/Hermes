import { useState } from 'react';
import { AlertCircle, Lightbulb } from 'lucide-react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { EditorialModal } from './EditorialModal';

export function FeedbackButton({ kind, articleUrl = '' }: { kind: 'ERROR' | 'SUGGESTION'; articleUrl?: string }) {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [url, setUrl] = useState(articleUrl);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState('');
    const label = kind === 'ERROR' ? 'Notificar error' : 'Sugerir cambio';
    const Icon = kind === 'ERROR' ? AlertCircle : Lightbulb;

    const submit = async () => {
        if (!message.trim() || (kind === 'ERROR' && !url.trim())) return;
        setSaving(true);
        setNotice('');
        try {
            await api.post('/api/feedback', { kind, message: message.trim(), ...(kind === 'ERROR' ? { articleUrl: url.trim() } : {}) });
            setOpen(false);
            setMessage('');
            setNotice('Mensaje enviado');
            window.setTimeout(() => setNotice(''), 4000);
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
            setNotice(detail || 'No se pudo enviar el mensaje.');
        } finally {
            setSaving(false);
        }
    };

    return <>
        <button type="button" onClick={() => { setUrl(articleUrl); setNotice(''); setOpen(true); }} aria-label={label} className="inline-flex items-center gap-1.5 rounded border border-editorial-text/15 px-2.5 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-editorial-text/75 transition-colors hover:border-editorial-text/50 hover:bg-editorial-text/5 hover:text-editorial-text" title={label}><Icon size={14} /><span className="hidden xl:inline">{label}</span></button>
        {notice && !open && createPortal(<span role="status" className="fixed bottom-6 right-6 z-[110] border border-editorial-text/15 bg-editorial-bg px-4 py-3 font-sans text-xs shadow-lg">{notice}</span>, document.body)}
        {open && <EditorialModal title={label} eyebrow="Tu opinión" onClose={() => setOpen(false)}>
            <p className="text-sm leading-relaxed text-editorial-text/65">{kind === 'ERROR' ? 'Contanos qué falló para que podamos revisarlo.' : 'Contanos qué mejorarías en el sistema.'}</p>
            {kind === 'ERROR' && <label className="block space-y-2 text-xs font-bold uppercase tracking-widest">Enlace de la nota
                <input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://..." maxLength={1000} className="w-full border border-editorial-text/20 bg-white px-3 py-3 font-sans text-sm font-normal normal-case tracking-normal outline-none focus:border-editorial-text" />
            </label>}
            <label className="block space-y-2 text-xs font-bold uppercase tracking-widest">{kind === 'ERROR' ? '¿Qué salió mal?' : '¿Qué cambiarías?'}
                <textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} rows={5} autoFocus placeholder={kind === 'ERROR' ? 'Describí el error...' : 'Describí tu sugerencia...'} className="w-full resize-y border border-editorial-text/20 bg-white px-3 py-3 font-sans text-sm font-normal normal-case tracking-normal outline-none focus:border-editorial-text" />
            </label>
            {notice && <p role="alert" className="text-sm text-red-700">{notice}</p>}
            <div className="flex justify-end gap-3 border-t border-editorial-text/10 pt-5">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-editorial-text/60 hover:text-editorial-text">Cancelar</button>
                <button type="button" disabled={saving || !message.trim() || (kind === 'ERROR' && !url.trim())} onClick={submit} className="bg-editorial-text px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-editorial-bg transition-opacity hover:opacity-85 disabled:opacity-40">{saving ? 'Enviando...' : 'Enviar'}</button>
            </div>
        </EditorialModal>}
    </>;
}
