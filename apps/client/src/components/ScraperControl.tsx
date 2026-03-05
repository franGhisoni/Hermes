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
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
            {message && (
                <div className="bg-editorial-text text-editorial-bg px-4 py-2 rounded shadow-lg text-xs font-bold uppercase tracking-widest animate-fade-in">
                    {message}
                </div>
            )}
            <div className="bg-white/90 backdrop-blur border border-editorial-text/10 p-4 rounded-lg shadow-xl">
                <h3 className="text-xs font-bold uppercase tracking-widest text-editorial-text/50 mb-3">Scraper Manual</h3>
                <div className="flex flex-col gap-2">
                    {scrapers.map(s => (
                        <button
                            key={s.source}
                            onClick={() => handleScrape(s.source)}
                            disabled={loading}
                            className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-editorial-text/5 rounded transition-colors text-sm font-serif text-editorial-text disabled:opacity-50"
                        >
                            <span>{s.name}</span>
                            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 opacity-50" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
