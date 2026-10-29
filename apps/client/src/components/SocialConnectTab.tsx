import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Status {
    missingConfig: string | null;
    account: {
        pageId: string;
        pageName: string;
        pagePictureUrl: string | null;
        igUsername: string | null;
        connectedBy: string | null;
        connectedAt: string;
    } | null;
    usingEnv: boolean;
}

interface Page {
    id: string;
    name: string;
    pictureUrl?: string;
    instagram: { id: string; username?: string } | null;
    canPublish: boolean;
}

const errorText = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;

const MESSAGES: Record<string, string> = {
    cancelado: 'Se canceló en Facebook. Cuando quieras, volvé a intentarlo.',
    facebook: 'Facebook no aceptó el pedido. Probá de nuevo en unos minutos.',
    vencido: 'Pasó demasiado tiempo desde que autorizaste en Facebook. Volvé a conectar.',
};

/** Pestaña "Redes" de Configuración: conecta la página de Facebook (y su Instagram) con un login. */
export function SocialConnectTab() {
    const [status, setStatus] = useState<Status | null>(null);
    const [pages, setPages] = useState<Page[] | null>(null);
    const [state, setState] = useState<string | null>(null);
    const [selected, setSelected] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        api.get('/api/social/connection').then(res => setStatus(res.data)).catch(() => setStatus(null));

        // Vuelta de Facebook: ?redes=elegir&estado=... o un error.
        const params = new URLSearchParams(window.location.search);
        const result = params.get('redes');
        if (!result) return;
        window.history.replaceState(null, '', window.location.pathname);
        if (result === 'elegir' && params.get('estado')) {
            const estado = params.get('estado')!;
            setState(estado);
            api.get('/api/social/connect/pages', { params: { estado } })
                .then(res => {
                    setPages(res.data);
                    setSelected(res.data.find((p: Page) => p.canPublish)?.id ?? '');
                })
                .catch(e => setMessage({ ok: false, text: errorText(e, 'No se pudieron leer las páginas.') }));
        } else if (MESSAGES[result]) {
            setMessage({ ok: false, text: MESSAGES[result] });
        }
    }, []);

    const connect = async () => {
        setBusy(true);
        try {
            const res = await api.post('/api/social/connect/start', { returnTo: `${window.location.origin}/settings?tab=redes` });
            window.location.href = res.data.url;
        } catch (e) {
            setMessage({ ok: false, text: errorText(e, 'No se pudo iniciar la conexión.') });
            setBusy(false);
        }
    };

    const select = async () => {
        if (!state || !selected) return;
        setBusy(true);
        try {
            const res = await api.post('/api/social/connect/select', { estado: state, pageId: selected });
            setStatus(res.data);
            setPages(null);
            setMessage({ ok: true, text: 'La página quedó conectada. Las notas se van a compartir ahí.' });
        } catch (e) {
            setMessage({ ok: false, text: errorText(e, 'No se pudo guardar la conexión.') });
        } finally {
            setBusy(false);
        }
    };

    const disconnect = async () => {
        if (!window.confirm('¿Desconectar la página? Las notas dejan de compartirse en redes.')) return;
        setBusy(true);
        try {
            const res = await api.delete('/api/social/connection');
            setStatus(res.data);
            setMessage({ ok: true, text: 'Se desconectó la página.' });
        } finally {
            setBusy(false);
        }
    };

    const btn = 'px-4 py-2 border border-editorial-text/30 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-40';
    const primary = 'px-4 py-2 bg-editorial-text text-editorial-bg hover:bg-black rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-40';

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h3 className="font-serif text-2xl font-bold text-editorial-text">Redes sociales</h3>
                <p className="text-sm font-sans text-editorial-text/60 mt-1">
                    La página de Facebook (y su Instagram) donde se publican las placas de las notas.
                </p>
            </div>

            {message && (
                <div role={message.ok ? 'status' : 'alert'} className={`p-3 rounded border text-sm font-sans ${message.ok ? 'border-green-600/30 text-green-800 bg-green-50' : 'border-red-400/40 text-red-700 bg-red-50'}`}>
                    {message.text}
                </div>
            )}

            {pages ? (
                <div className="border border-editorial-text/15 bg-white/40 p-5 rounded space-y-4">
                    <p className="text-xs font-sans font-bold uppercase tracking-widest text-editorial-text">Elegí la página</p>
                    {pages.length === 0 && (
                        <p className="text-sm font-sans text-editorial-text/70">Facebook no devolvió ninguna página. Volvé a conectar y marcá la página en Facebook.</p>
                    )}
                    <fieldset className="space-y-2">
                        <legend className="sr-only">Páginas autorizadas</legend>
                        {pages.map(p => (
                            <label key={p.id} className={`flex items-center gap-3 p-3 rounded border border-editorial-text/15 ${p.canPublish ? 'cursor-pointer hover:bg-editorial-text/5' : 'opacity-50'}`}>
                                <input type="radio" name="page" value={p.id} checked={selected === p.id} disabled={!p.canPublish} onChange={() => setSelected(p.id)} />
                                {p.pictureUrl && <img src={p.pictureUrl} alt="" className="w-9 h-9 rounded-full" />}
                                <span className="font-sans text-sm">
                                    <span className="block font-bold text-editorial-text">{p.name}</span>
                                    <span className="block text-editorial-text/60">
                                        {p.instagram ? `Instagram: @${p.instagram.username ?? p.instagram.id}` : 'Sin Instagram vinculado (solo Facebook)'}
                                        {!p.canPublish && ' · sin permiso para publicar'}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                    <div className="flex gap-2">
                        <button type="button" onClick={select} disabled={busy || !selected} className={primary}>Conectar esta página</button>
                        <button type="button" onClick={() => setPages(null)} disabled={busy} className={btn}>Cancelar</button>
                    </div>
                </div>
            ) : status?.account ? (
                <div className="border border-editorial-text/15 bg-white/40 p-5 rounded space-y-4">
                    <div className="flex items-center gap-4">
                        {status.account.pagePictureUrl && <img src={status.account.pagePictureUrl} alt="" className="w-12 h-12 rounded-full" />}
                        <div className="font-sans text-sm">
                            <p className="font-bold text-editorial-text">{status.account.pageName}</p>
                            <p className="text-editorial-text/60">
                                {status.account.igUsername ? `Instagram: @${status.account.igUsername}` : 'Sin Instagram vinculado: se publica solo en Facebook'}
                            </p>
                            <p className="text-editorial-text/50 text-xs">
                                Conectada{status.account.connectedBy ? ` por ${status.account.connectedBy}` : ''} el {new Date(status.account.connectedAt).toLocaleDateString('es-AR')}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {!status.missingConfig && <button type="button" onClick={connect} disabled={busy} className={btn}>Cambiar de página</button>}
                        <button type="button" onClick={disconnect} disabled={busy} className={btn}>Desconectar</button>
                    </div>
                </div>
            ) : (
                <div className="border border-editorial-text/15 bg-white/40 p-5 rounded space-y-4">
                    <p className="text-sm font-sans text-editorial-text/80">
                        Tocá el botón, iniciá sesión en Facebook con una cuenta que administre la página y elegí la página (y su Instagram).
                        No se guarda ninguna contraseña: Facebook da un permiso solo para publicar.
                    </p>
                    {status?.usingEnv && (
                        <p className="text-xs font-sans text-editorial-text/50">Hoy se publica con la página configurada en las variables del servidor (META_*). Si conectás una acá, se usa esta.</p>
                    )}
                    {status?.missingConfig ? (
                        <p className="text-xs font-sans text-editorial-text/60">Para activar el botón faltan estas variables en el servidor: {status.missingConfig}.</p>
                    ) : (
                        <button type="button" onClick={connect} disabled={busy || !status} className={primary}>
                            {busy ? 'Abriendo Facebook…' : 'Conectar con Facebook'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
