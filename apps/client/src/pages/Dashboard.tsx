import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Article } from '../types';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchArticles = async () => {
        try {
            const res = await api.get('/api/articles');
            setArticles(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const triggerScrape = async () => {
        try {
            await api.post('/api/scrape', {
                source: 'Clarin', // Default for now, ideally selectable
                url: 'https://www.clarin.com'
                // limit is now handled by backend default if omitted
            });
            alert('Scrape job started');
        } catch (error) {
            alert('Failed to start scrape');
        }
    };

    useEffect(() => {
        fetchArticles();
        const interval = setInterval(fetchArticles, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-editorial-bg text-editorial-text font-serif">
            {/* Navigation Bar */}
            <nav className="border-b border-editorial-text/10 px-8 py-6 flex justify-between items-center sticky top-0 bg-editorial-bg/95 backdrop-blur z-10">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="Hermes Logo" className="h-12 w-auto mix-blend-multiply opacity-90" />
                    <h1 className="text-4xl font-black tracking-tight italic">Publisher.</h1>
                    <div className="h-6 w-px bg-editorial-text/20 mx-2"></div>
                    <span className="text-sm font-sans uppercase tracking-widest text-editorial-text/60">PLATAFORMA AUTOMATICA DE NOTICIAS</span>
                </div>
                <div className="flex gap-4 items-center">
                    <Link to="/settings" className="font-sans text-sm font-semibold uppercase tracking-wider hover:underline underline-offset-4">Configuración</Link>

                    <button onClick={triggerScrape} className="font-sans text-sm font-semibold uppercase tracking-wider bg-editorial-text text-editorial-bg px-4 py-2 hover:bg-editorial-text/80 transition-colors">
                        Ejecutar Scrapper
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="p-8 max-w-[1600px] mx-auto">
                <div className="flex items-baseline justify-between mb-8">
                    <h2 className="text-2xl font-bold border-b-2 border-editorial-text pb-2">Noticias Procesadas</h2>
                    <span className="font-sans text-sm text-editorial-text/50">{articles.length} Articulos Procesados</span>
                </div>

                {loading ? (
                    <div className="text-center py-20 opacity-50 font-sans animate-pulse">Gathering intelligence...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
                        {articles.map(article => (
                            <article key={article.id} className="group flex flex-col h-full">
                                {article.originalImageUrl && (
                                    <div className="aspect-[4/3] overflow-hidden mb-4 border border-editorial-text/10 relative">
                                        <div className="absolute top-2 right-2 bg-editorial-bg px-2 py-1 font-sans text-xs font-bold border border-editorial-text/20 z-10">
                                            Score: {article.interestScore || '-'}
                                        </div>
                                        <img
                                            src={article.originalImageUrl}
                                            alt=""
                                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                                        />
                                    </div>
                                )}

                                <div className="flex items-center justify-between mb-3 font-sans text-xs uppercase tracking-widest text-editorial-text/60">
                                    <div className="flex items-center gap-2">
                                        <span>{article.source?.name}</span>
                                        {article.section && (
                                            <span className="font-bold text-editorial-text/80 opacity-70 border-l border-editorial-text/20 pl-2">
                                                {article.section}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`px-2 py-0.5 border ${article.status === 'PUBLISHED' ? 'bg-editorial-text text-editorial-bg border-editorial-text' : 'border-editorial-text/20'
                                        }`}>
                                        {article.status}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold leading-tight mb-3 group-hover:underline underline-offset-4 decoration-2">
                                    <Link to={`/newsroom/${article.id}`}>
                                        {article.rewrittenTitle || article.originalTitle}
                                    </Link>
                                </h3>

                                <p className="text-sm text-editorial-text/80 leading-relaxed line-clamp-4 font-sans mb-4 flex-1">
                                    {article.rewrittenContent || article.originalContent}
                                </p>

                                <div className="pt-4 border-t border-editorial-text/10 flex justify-between items-center font-sans text-xs">
                                    <span className="text-editorial-text/50">{new Date(article.createdAt).toLocaleDateString()}</span>
                                    <Link to={`/newsroom/${article.id}`} className="font-bold hover:translate-x-1 transition-transform">
                                        Read & Edit →
                                    </Link>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
