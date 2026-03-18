import { useState } from 'react';
import { api } from '../lib/api';
import { Play, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function ScraperControl() {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);

    if (!token) return null;
    const [message, setMessage] = useState('');

    const scrapers = [
        { name: 'Clarín', source: 'Clarin' },
        { name: 'La Nación', source: 'LaNacion' },
        { name: 'Infobae', source: 'Infobae' },
        { name: 'TN', source: 'TN' },
        { name: 'Noticias Argentinas', source: 'NA' },
    ];

    const handleScrape = async (source: string) => {
        setLoading(true);
        setMessage(`Iniciando ${source}...`);
        try {
            const res = await api.post('/api/scrape', { source });
            setMessage(res.data.message || `Scraping iniciado para ${source}`);
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
                    {scrapers.map(s => (
                        <button
                            key={s.source}
                            onClick={() => handleScrape(s.source)}
                            disabled={loading}
                            className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-editorial-text/5 rounded transition-colors text-sm font-serif text-editorial-text disabled:opacity-50"
                        >
                            <span>{s.name}</span>
                            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-editorial-text/50" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
