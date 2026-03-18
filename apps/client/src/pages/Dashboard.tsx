import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import type { Article } from '../types';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ScraperControl } from '../components/ScraperControl';

export default function Dashboard() {
    const { user, logout } = useAuth();
    const [articles, setArticles] = useState<Article[]>([]);
    const [configSections, setConfigSections] = useState<{ name: string, path: string }[]>([]);
    const [loading, setLoading] = useState(true);

    const [filterSource, setFilterSource] = useState<string>('all');
    const [filterSection, setFilterSection] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'date' | 'score'>('date');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
    const [groupBy, setGroupBy] = useState<'none' | 'source' | 'section'>('none');

    const sources = Array.from(new Set(articles.map(a => a.source?.name).filter(Boolean))) as string[];
    const statuses = Array.from(new Set(articles.map(a => a.status).filter(Boolean))) as string[];

    const processedArticles = useMemo(() => {
        let result = [...articles];

        if (filterSource !== 'all') result = result.filter(a => a.source?.name === filterSource);
        if (filterSection !== 'all') {
            result = result.filter(a => {
                if (!a.section) return false;
                // Match exact section or if the section URL/string contains the name
                return a.section === filterSection || a.section.toLowerCase().includes(filterSection.toLowerCase());
            });
        }
        if (filterStatus !== 'all') result = result.filter(a => a.status === filterStatus);

        result.sort((a, b) => {
            let valA = 0, valB = 0;
            if (sortBy === 'date') {
                valA = new Date(a.createdAt).getTime();
                valB = new Date(b.createdAt).getTime();
            } else if (sortBy === 'score') {
                valA = a.interestScore || 0;
                valB = b.interestScore || 0;
            }
            if (valA < valB) return sortOrder === 'desc' ? 1 : -1;
            if (valA > valB) return sortOrder === 'desc' ? -1 : 1;
            return 0;
        });

        return result;
    }, [articles, filterSource, filterSection, filterStatus, sortBy, sortOrder]);

    const groupedArticles = useMemo(() => {
        if (groupBy === 'none') return null;
        const groups: Record<string, Article[]> = {};
        processedArticles.forEach(article => {
            let key = 'Otros';
            if (groupBy === 'source' && article.source?.name) key = article.source.name;
            else if (groupBy === 'section' && article.section) key = article.section;
            if (!groups[key]) groups[key] = [];
            groups[key].push(article);
        });
        return groups;
    }, [processedArticles, groupBy]);

    const fetchArticles = async () => {
        try {
            const res = await api.get('/api/articles');
            setArticles(res.data);
        } catch (error) {
            console.error('Error fetching articles:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSections = async () => {
        try {
            const res = await api.get('/api/config/sections');
            setConfigSections(res.data);
        } catch (error) {
            console.error('Error fetching sections config:', error);
        }
    };

    useEffect(() => {
        fetchArticles();
        fetchSections();
        const interval = setInterval(fetchArticles, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-editorial-bg text-editorial-text font-serif">
            {/* Navigation Bar */}
            <nav className="border-b border-editorial-text/10 px-8 py-6 flex justify-between items-center sticky top-0 bg-editorial-bg/95 backdrop-blur z-10">
                <div className="flex items-center gap-4">
                    <Link to="/">
                        <img src="/logo.png" alt="Logo" className="h-12 w-auto mix-blend-multiply opacity-90 transition-opacity hover:opacity-100" />
                    </Link>
                    <div className="h-6 w-px bg-editorial-text/20 mx-2"></div>
                    <span className="text-sm font-sans uppercase tracking-widest text-editorial-text/60">PLATAFORMA AUTOMATICA DE NOTICIAS</span>
                </div>
                <div className="flex gap-4 items-center">
                    {user?.role === 'ADMIN' && (
                        <>
                            <Link to="/flows" className="font-sans text-sm font-semibold uppercase tracking-wider hover:underline underline-offset-4">Flujos</Link>
                            <Link to="/users" className="font-sans text-sm font-semibold uppercase tracking-wider hover:underline underline-offset-4">Usuarios</Link>
                            <Link to="/settings" className="font-sans text-sm font-semibold uppercase tracking-wider hover:underline underline-offset-4">Configuración</Link>
                            <ScraperControl />
                        </>
                    )}

                    <button onClick={logout} className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors">
                        Salir
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="p-8 max-w-[1600px] mx-auto">
                <div className="flex items-baseline justify-between mb-8">
                    <h2 className="text-2xl font-bold border-b-2 border-editorial-text pb-2">Noticias Procesadas</h2>
                    <span className="font-sans text-sm text-editorial-text/50">{processedArticles.length} Artículos Procesados {processedArticles.length !== articles.length && `(de ${articles.length})`}</span>
                </div>

                {/* Toolbar */}
                <div className="mb-8 flex flex-wrap gap-4 items-end font-sans text-xs">
                    <div className="flex flex-col gap-1">
                        <label className="font-bold uppercase tracking-widest text-editorial-text/50">Medio</label>
                        <select className="border border-editorial-text/20 bg-transparent px-2 py-1 outline-none focus:border-editorial-text cursor-pointer" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                            <option value="all">Todos</option>
                            {sources.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="font-bold uppercase tracking-widest text-editorial-text/50">Sección</label>
                        <select className="border border-editorial-text/20 bg-transparent px-2 py-1 outline-none focus:border-editorial-text cursor-pointer" value={filterSection} onChange={e => setFilterSection(e.target.value)}>
                            <option value="all">Todas</option>
                            {configSections.map(s => <option key={s.path} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="font-bold uppercase tracking-widest text-editorial-text/50">Estado</label>
                        <select className="border border-editorial-text/20 bg-transparent px-2 py-1 outline-none focus:border-editorial-text cursor-pointer" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="all">Todos</option>
                            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className="w-px h-8 bg-editorial-text/10 self-center mx-2 hidden sm:block"></div>

                    <div className="flex flex-col gap-1">
                        <label className="font-bold uppercase tracking-widest text-editorial-text/50">Ordenar Por</label>
                        <select className="border border-editorial-text/20 bg-transparent px-2 py-1 outline-none focus:border-editorial-text cursor-pointer" value={sortBy} onChange={e => setSortBy(e.target.value as 'date' | 'score')}>
                            <option value="date">Fecha</option>
                            <option value="score">Score</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="font-bold uppercase tracking-widest text-editorial-text/50">Orden</label>
                        <select className="border border-editorial-text/20 bg-transparent px-2 py-1 outline-none focus:border-editorial-text cursor-pointer" value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')}>
                            <option value="desc">Descendente</option>
                            <option value="asc">Ascendente</option>
                        </select>
                    </div>

                    <div className="w-px h-8 bg-editorial-text/10 self-center mx-2 hidden sm:block"></div>

                    <div className="flex flex-col gap-1">
                        <label className="font-bold uppercase tracking-widest text-editorial-text/50">Agrupar Por</label>
                        <select className="border border-editorial-text/20 bg-transparent px-2 py-1 outline-none focus:border-editorial-text cursor-pointer" value={groupBy} onChange={e => setGroupBy(e.target.value as 'none' | 'source' | 'section')}>
                            <option value="none">Sin Agrupar</option>
                            <option value="source">Medio</option>
                            <option value="section">Sección</option>
                        </select>
                    </div>
                </div>

                {loading && articles.length === 0 ? (
                    <div className="text-center py-20 opacity-50 font-sans animate-pulse">Reuniendo noticias...</div>
                ) : groupedArticles ? (
                    <div className="flex flex-col gap-12">
                        {Object.entries(groupedArticles).map(([groupName, groupArticles]) => (
                            <div key={groupName}>
                                <h3 className="text-2xl font-bold border-b border-editorial-text/20 pb-2 mb-6 capitalize font-sans">{groupName} <span className="text-sm font-sans font-normal opacity-50 ml-2">({groupArticles.length})</span></h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
                                    {groupArticles.map(article => <ArticleCard key={article.id} article={article} />)}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12">
                        {processedArticles.map(article => <ArticleCard key={article.id} article={article} />)}
                    </div>
                )}
            </main>
        </div>
    );
}

function ArticleCard({ article }: { article: Article }) {
    return (
        <article className="group flex flex-col h-full">
            {article.originalImageUrl && (
                <div className="aspect-[4/3] overflow-hidden mb-4 border border-editorial-text/10 relative">
                    <div className="absolute top-2 right-2 bg-editorial-bg px-2 py-1 font-sans text-xs font-bold border border-editorial-text/20 z-[1]">
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
                    Leer y Editar →
                </Link>
            </div>
        </article>
    );
}
