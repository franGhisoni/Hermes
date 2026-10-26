import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Template = 'banda' | 'degradado' | 'panel' | 'clasico';
type Network = 'facebook' | 'instagram';
interface NetworkResult { ok: boolean; id?: string; permalink?: string; error?: string }

const TEMPLATES: { value: Template; label: string }[] = [
    { value: 'banda', label: 'Banda de color' },
    { value: 'degradado', label: 'Foto con degradé' },
    { value: 'panel', label: 'Panel oscuro' },
    { value: 'clasico', label: 'Diario clásico' },
];

interface Props {
    articleId: string;
    isDemo: boolean;
    headline: string;
    kicker: string;
    onHeadlineChange: (value: string) => void;
    onKickerChange: (value: string) => void;
    facebook: string;
    instagram: string;
    /** Guarda el borrador antes de publicar para que el servidor use lo último. */
    onBeforePublish: () => Promise<unknown>;
}

export function SocialCardPanel(props: Props) {
    const [template, setTemplate] = useState<Template | ''>('');
    const [status, setStatus] = useState<{ configured: boolean; instagram: boolean; autoPublish: boolean } | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [rendering, setRendering] = useState(false);
    const [publishing, setPublishing] = useState<Network[] | null>(null);
    const [results, setResults] = useState<Partial<Record<Network, NetworkResult>> | null>(null);

    useEffect(() => {
        api.get('/api/social/status').then(res => {
            setStatus(res.data);
            setTemplate(prev => prev || res.data.template);
        }).catch(() => setStatus(null));
    }, []);

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const renderPreview = async () => {
        setRendering(true);
        try {
            const res = await api.get(`/api/articles/${props.articleId}/social-card`, {
                params: { headline: props.headline, kicker: props.kicker, template: template || undefined },
                responseType: 'blob',
            });
            setPreviewUrl(URL.createObjectURL(res.data));
        } catch {
            alert('No se pudo generar la placa.');
        } finally {
            setRendering(false);
        }
    };

    const publish = async (networks: Network[]) => {
        const names = networks.map(n => (n === 'facebook' ? 'Facebook' : 'Instagram')).join(' e ');
        if (!window.confirm(`¿Publicar la placa y el copy en ${names}? Queda visible para todos los seguidores.`)) return;
        setPublishing(networks);
        setResults(null);
        try {
            await props.onBeforePublish();
            const res = await api.post(`/api/articles/${props.articleId}/publish-social`, {
                networks,
                headline: props.headline,
                kicker: props.kicker,
                template: template || undefined,
                facebook: props.facebook,
                instagram: props.instagram,
            });
            setResults(res.data);
        } catch (e: any) {
            alert(`Error publicando en redes: ${e?.response?.data?.error || e?.message}`);
        } finally {
            setPublishing(null);
        }
    };

    const canPublish = !props.isDemo && status?.configured && !publishing;
    const label = 'block text-[10px] font-sans font-bold uppercase tracking-widest text-editorial-text/60 mb-1';
    const btn = 'px-3.5 py-1.5 border border-editorial-text/30 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-40';

    return (
        <div className="border border-editorial-text/15 bg-white/40 p-4 rounded">
            <div className="flex justify-between items-center mb-3 font-sans">
                <span className="text-xs font-bold uppercase tracking-widest text-editorial-text">Placa para Facebook e Instagram</span>
                {status && !status.configured && (
                    <span className="text-[10px] text-editorial-text/50">Falta configurar la cuenta de Meta en el servidor</span>
                )}
                {status?.autoPublish && (
                    <span className="text-[10px] text-editorial-text/50">Se publica sola al salir la nota en el sitio</span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
                <div className="space-y-3">
                    <div>
                        <label className={label} htmlFor="card-kicker">Volanta de la placa</label>
                        <input
                            id="card-kicker"
                            value={props.kicker}
                            onChange={e => props.onKickerChange(e.target.value)}
                            className="w-full bg-transparent border-b border-editorial-text/20 font-sans text-sm py-1 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className={label} htmlFor="card-headline">Titular de la placa (*resaltado*)</label>
                        <textarea
                            id="card-headline"
                            value={props.headline}
                            onChange={e => props.onHeadlineChange(e.target.value)}
                            rows={3}
                            className="w-full bg-transparent border border-editorial-text/20 rounded p-2 font-sans text-sm focus:outline-none resize-none"
                        />
                        <p className="text-[10px] text-editorial-text/50 mt-1">Las palabras entre asteriscos salen en el color de acento.</p>
                    </div>
                    <div>
                        <label className={label} htmlFor="card-template">Diseño</label>
                        <select
                            id="card-template"
                            value={template}
                            onChange={e => setTemplate(e.target.value as Template)}
                            className="bg-transparent border border-editorial-text/20 rounded px-2 py-1 font-sans text-sm"
                        >
                            {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        <button type="button" onClick={renderPreview} disabled={rendering} className={btn}>
                            {rendering ? 'Generando…' : previewUrl ? '↻ Actualizar placa' : 'Ver placa'}
                        </button>
                        <button type="button" onClick={() => publish(['facebook'])} disabled={!canPublish} className={btn}>
                            Facebook
                        </button>
                        <button type="button" onClick={() => publish(['instagram'])} disabled={!canPublish || !status?.instagram} className={btn}>
                            Instagram
                        </button>
                        <button
                            type="button"
                            onClick={() => publish(['facebook', 'instagram'])}
                            disabled={!canPublish || !status?.instagram}
                            className="px-3.5 py-1.5 bg-editorial-text text-editorial-bg hover:bg-black rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-40"
                        >
                            {publishing ? 'Publicando…' : 'Publicar en ambas'}
                        </button>
                    </div>
                    {results && (
                        <ul className="text-xs font-sans space-y-1 pt-2" aria-live="polite">
                            {(Object.entries(results) as [Network, NetworkResult][]).map(([network, r]) => (
                                <li key={network} className={r.ok ? 'text-green-700' : 'text-red-600'}>
                                    {network === 'facebook' ? 'Facebook' : 'Instagram'}: {r.ok
                                        ? (r.permalink ? <a href={r.permalink} target="_blank" rel="noreferrer" className="underline">publicado</a> : 'publicado')
                                        : r.error}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="aspect-[4/5] border border-dashed border-editorial-text/20 rounded flex items-center justify-center overflow-hidden bg-editorial-text/[0.03]">
                    {previewUrl
                        ? <img src={previewUrl} alt={`Placa: ${props.headline.replace(/\*/g, '')}`} className="w-full h-full object-contain" />
                        : <span className="text-[11px] text-editorial-text/40 px-4 text-center">Tocá "Ver placa" para generar la vista previa</span>}
                </div>
            </div>
        </div>
    );
}
