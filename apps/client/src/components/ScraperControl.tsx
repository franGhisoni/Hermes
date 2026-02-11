import { useState } from 'react';
import { api } from '../lib/api';
import { Play, Loader2 } from 'lucide-react';

export function ScraperControl() {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const scrapers = [
        { name: 'Clarín', source: 'Clarin', url: 'https://www.clarin.com/politica' },
        { name: 'La Nación', source: 'LaNacion', url: 'https://www.lanacion.com.ar/politica' },
        { name: 'Infobae', source: 'Infobae', url: 'https://www.infobae.com/politica/' },
        { name: 'TN', source: 'TN', url: 'https://tn.com.ar/politica/' },
        { name: 'Noticias Argentinas', source: 'NA', url: 'https://noticiasargentinas.com/politica' },
    ];

    const handleScrape = async (source: string, url: string) => {
        setLoading(true);
        setMessage(`Starting ${source}...`);
        try {
            await api.post('/api/scrape', { source, url });
            setMessage(`Job added for ${source}`);
        } catch (error) {
            setMessage('Error starting job');
            console.error(error);
        } finally {
            setLoading(false);
            setTimeout(() => setMessage(''), 3000);
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
                <h3 className="text-xs font-bold uppercase tracking-widest text-editorial-text/50 mb-3">Manual Scraper</h3>
                <div className="flex flex-col gap-2">
                    {scrapers.map(s => (
                        <button
                            key={s.source}
                            onClick={() => handleScrape(s.source, s.url)}
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
