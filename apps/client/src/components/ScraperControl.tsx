import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Play, Loader2, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface EffectiveSection {
    id: string;
    name: string;
    path: string;
    scrapeLimit: number | null;
    enabled: boolean;
    hasOverride: boolean;
}

const SCRAPERS = [
    { name: 'Clarín', source: 'Clarin' },
    { name: 'La Nación', source: 'LaNacion' },
    { name: 'Infobae', source: 'Infobae' },
    { name: 'TN', source: 'TN' },
    { name: 'Noticias Argentinas', source: 'NA' },
    { name: 'Ámbito', source: 'Ambito' },
    { name: 'El Cronista', source: 'Cronista' },
];

export function ScraperControl() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [hoveredSource, setHoveredSource] = useState<string | null>(null);
    // Cache effective sections per source so we don't refetch on every hover.
    const [sectionsBySource, setSectionsBySource] = useState<Record<string, EffectiveSection[]>>({});
    const [sectionsLoading, setSectionsLoading] = useState<Record<string, boolean>>({});

    if (!token) return null;

    useEffect(() => {
        if (!hoveredSource) return;
        if (sectionsBySource[hoveredSource] || sectionsLoading[hoveredSource]) return;

        setSectionsLoading(prev => ({ ...prev, [hoveredSource]: true }));
        api.get('/api/config/sections/effective', { params: { source: hoveredSource } })
            .then(res => {
                setSectionsBySource(prev => ({ ...prev, [hoveredSource]: res.data }));
            })
            .catch(err => {
                console.error('Failed to load sections for', hoveredSource, err);
            })
            .finally(() => {
                setSectionsLoading(prev => ({ ...prev, [hoveredSource]: false }));
            });
    }, [hoveredSource]);

    const handleScrape = async (source: string, sectionId?: string, label?: string) => {
        setLoading(true);
        setMessage(`Iniciando ${label || source}...`);
        try {
            const body: { source: string; sectionId?: string } = { source };
            if (sectionId) body.sectionId = sectionId;
            const res = await api.post('/api/scrape', body);
            setMessage(res.data.message || `Scraping iniciado para ${label || source}`);
        } catch (error) {
            setMessage('Error al iniciar el trabajo');
            console.error(error);
        } finally {
            setLoading(false);
            setTimeout(() => setMessage(''), 4000);
        }
    };

    return (
        <div className="relative group flex items-center h-full">
            <button className="font-sans text-sm font-semibold uppercase tracking-wider hover:underline underline-offset-4 flex items-center gap-1">
                Scraper Manual
            </button>
            <div className="absolute top-full right-0 mt-4 hidden group-hover:block bg-editorial-bg backdrop-blur border border-editorial-text/20 p-4 rounded shadow-xl w-64 z-50 before:absolute before:-top-4 before:left-0 before:w-full before:h-4">
                <div className="flex flex-col gap-1">
                    {message && (
                        <div className="bg-editorial-text text-editorial-bg px-3 py-2 rounded mb-2 text-xs font-bold uppercase tracking-widest animate-fade-in text-center">
                            {message}
                        </div>
                    )}
                    {SCRAPERS.map(s => {
                        const sections = sectionsBySource[s.source];
                        const isLoadingSections = sectionsLoading[s.source];
                        return (
                            <div
                                key={s.source}
                                className="relative"
                                onMouseEnter={() => setHoveredSource(s.source)}
                            >
                                <div className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-editorial-text/5 rounded transition-colors text-sm font-serif text-editorial-text">
                                    <button
                                        onClick={() => handleScrape(s.source, undefined, s.name)}
                                        disabled={loading}
                                        className="flex-1 text-left disabled:opacity-50"
                                        title="Scrapear todas las secciones"
                                    >
                                        {s.name}
                                    </button>
                                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3 text-editorial-text/50" />}
                                </div>

                                {/* Submenu: opens to the LEFT of the dropdown (which is anchored to the header's right edge). */}
                                <div
                                    className="absolute top-0 right-full mr-1 bg-editorial-bg border border-editorial-text/20 p-2 rounded shadow-xl w-60 z-50"
                                    style={{ display: hoveredSource === s.source ? 'block' : 'none' }}
                                >
                                    <div className="text-[10px] uppercase tracking-widest font-sans font-bold opacity-60 px-2 py-1 border-b border-editorial-text/10 mb-1">
                                        {s.name}
                                    </div>
                                    <button
                                        onClick={() => handleScrape(s.source, undefined, s.name)}
                                        disabled={loading}
                                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-editorial-text/5 rounded text-xs font-sans font-bold uppercase tracking-wider disabled:opacity-50"
                                    >
                                        <span>Todas las secciones</span>
                                        <Play className="w-3 h-3 text-editorial-text/50" />
                                    </button>
                                    <div className="border-t border-editorial-text/10 my-1" />
                                    {isLoadingSections && (
                                        <div className="text-xs opacity-50 italic px-2 py-2 text-center">Cargando…</div>
                                    )}
                                    {sections && sections.length === 0 && (
                                        <div className="text-xs opacity-50 italic px-2 py-2 text-center">Sin secciones configuradas</div>
                                    )}
                                    {sections && sections.map(sec => (
                                        <button
                                            key={sec.id}
                                            onClick={() => sec.enabled && handleScrape(s.source, sec.id, `${s.name} → ${sec.name}`)}
                                            disabled={loading || !sec.enabled}
                                            className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-sm font-serif ${
                                                sec.enabled
                                                    ? 'hover:bg-editorial-text/5 text-editorial-text'
                                                    : 'text-editorial-text/30 cursor-not-allowed line-through'
                                            } disabled:opacity-50`}
                                            title={sec.enabled ? sec.path : 'Desactivada para este medio'}
                                        >
                                            <span className="flex items-center gap-1 truncate">
                                                {sec.name}
                                                {sec.hasOverride && sec.enabled && (
                                                    <span className="text-[9px] font-sans uppercase tracking-widest opacity-50">·custom</span>
                                                )}
                                            </span>
                                            {sec.enabled && <Play className="w-3 h-3 text-editorial-text/40 flex-shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
