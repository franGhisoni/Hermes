import { useState } from 'react';
import { api } from '../lib/api';

export function FeedbackButton({ kind, articleUrl = '' }: { kind: 'ERROR' | 'SUGGESTION'; articleUrl?: string }) {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [url, setUrl] = useState(articleUrl);
    const [saving, setSaving] = useState(false);
    const label = kind === 'ERROR' ? 'Notificar error' : 'Sugerir cambio';

    const submit = async () => {
        if (!message.trim()) return;
        setSaving(true);
        try {
            await api.post('/api/feedback', { kind, message, articleUrl: url });
            setOpen(false);
            setMessage('');
            alert('Gracias. Tu mensaje quedó registrado.');
        } catch (error: unknown) {
            const detail = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
            alert(detail || 'No se pudo enviar el mensaje.');
        } finally {
            setSaving(false);
        }
    };

    return <>
        <button type="button" onClick={() => { setUrl(articleUrl); setOpen(true); }} className="font-sans text-xs font-bold uppercase tracking-wider hover:underline">{label}</button>
        {open && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
            <div className="w-full max-w-lg bg-editorial-bg text-editorial-text p-6 shadow-xl space-y-4 font-sans">
                <h2 className="font-serif text-2xl font-bold">{label}</h2>
                <label className="block text-sm">Enlace de la nota
                    <input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://..." maxLength={1000} className="mt-1 w-full border p-2 bg-white" />
                </label>
                <label className="block text-sm">{kind === 'ERROR' ? '¿Qué salió mal?' : '¿Qué cambiarías?'}
                    <textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} rows={5} className="mt-1 w-full border p-2 bg-white" />
                </label>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setOpen(false)} className="border px-4 py-2">Cancelar</button>
                    <button type="button" disabled={saving || !message.trim()} onClick={submit} className="bg-editorial-text text-editorial-bg px-4 py-2 disabled:opacity-50">{saving ? 'Enviando...' : 'Enviar'}</button>
                </div>
            </div>
        </div>}
    </>;
}
