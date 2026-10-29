import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface CmsSocial {
    targetId: string;
    name: string;
    connected?: boolean;
    page?: {
        name: string;
        pictureUrl: string | null;
        instagram: string | null;
        connectedBy: string | null;
        connectedAt: string;
    } | null;
    connectUrl?: string;
    error?: string;
}

/**
 * Pestaña "Redes" de Configuración. En Impacto Castex el que publica en Facebook
 * e Instagram es el CMS (Hermes le manda el copy y la placa), así que la página
 * se conecta allá; acá se ve el estado y se llega con un clic.
 */
export function SocialCmsTab() {
    const [items, setItems] = useState<CmsSocial[] | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStatus = () => api.get('/api/social/cms')
        .then(res => setItems(res.data))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));

    const load = () => {
        setLoading(true);
        fetchStatus();
    };

    useEffect(() => { fetchStatus(); }, []);

    const btn = 'px-4 py-2 border border-editorial-text/30 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors';
    const primary = 'px-4 py-2 bg-editorial-text text-editorial-bg hover:bg-black rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors';

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h3 className="font-serif text-2xl font-bold text-editorial-text">Redes sociales</h3>
                <p className="text-sm font-sans text-editorial-text/60 mt-1">
                    Cuando una nota se publica en el CMS, sale también en Facebook e Instagram con su placa y el copy que se escribe en el Newsroom.
                    La página se conecta en el CMS.
                </p>
            </div>

            {loading && <p className="text-sm font-sans text-editorial-text/50">Consultando el CMS…</p>}

            {!loading && items?.length === 0 && (
                <p className="text-sm font-sans text-editorial-text/60">No hay ningún medio de tipo CMS configurado.</p>
            )}

            {!loading && items?.map(item => (
                <div key={item.targetId} className="border border-editorial-text/15 bg-white/40 p-5 rounded space-y-4">
                    <p className="text-xs font-sans font-bold uppercase tracking-widest text-editorial-text/60">{item.name}</p>

                    {item.error ? (
                        <p role="alert" className="text-sm font-sans text-red-700">{item.error}</p>
                    ) : item.connected && item.page ? (
                        <div className="flex items-center gap-4">
                            {item.page.pictureUrl && <img src={item.page.pictureUrl} alt="" className="w-12 h-12 rounded-full" />}
                            <div className="font-sans text-sm">
                                <p className="font-bold text-editorial-text">{item.page.name}</p>
                                <p className="text-editorial-text/60">
                                    {item.page.instagram ? `Instagram: @${item.page.instagram}` : 'Sin Instagram vinculado: se publica solo en Facebook'}
                                </p>
                                <p className="text-editorial-text/50 text-xs">
                                    Conectada{item.page.connectedBy ? ` por ${item.page.connectedBy}` : ''} el {new Date(item.page.connectedAt).toLocaleDateString('es-AR')}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm font-sans text-editorial-text/70">Todavía no hay una página de Facebook conectada.</p>
                    )}

                    <div className="flex gap-2">
                        {item.connectUrl && (
                            <a href={item.connectUrl} target="_blank" rel="noopener noreferrer" className={item.connected ? btn : primary}>
                                {item.connected ? 'Cambiar de página' : 'Conectar con Facebook'} ↗
                            </a>
                        )}
                        <button type="button" onClick={load} className={btn}>Actualizar</button>
                    </div>
                    {item.connectUrl && (
                        <p className="text-[11px] font-sans text-editorial-text/50">
                            Se abre el panel del CMS: entrá con una cuenta de dirección o administración del diario.
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
