import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Article } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface Target {
    id: string;
    name: string;
    email: string;
}

export default function Newsroom() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);

    // Publish modal state
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [targets, setTargets] = useState<Target[]>([]);
    const [sections, setSections] = useState<{ id: string, name: string, path: string }[]>([]);
    const [selectedTargetId, setSelectedTargetId] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [loadingTargets, setLoadingTargets] = useState(false);

    useEffect(() => {
        if (!id) return;
        api.get(`/api/articles/${id}`)
            .then(res => {
                setArticle(res.data);
                setLoading(false);
            });
    }, [id]);

    const [generating, setGenerating] = useState(false);

    const handleRegenerate = async () => {
        if (!id) return;
        setGenerating(true);
        try {
            const res = await api.post(`/api/articles/${id}/regenerate-image`);
            setArticle(prev => prev ? {
                ...prev,
                featureImageUrl: res.data.url,
                imageCandidates: res.data.candidates
            } : null);
        } catch (e) {
            alert('Failed to regenerate image');
        } finally {
            setGenerating(false);
        }
    };

    const handleSelectImage = async (url: string) => {
        if (!id) return;
        try {
            const res = await api.put(`/api/articles/${id}/select-image`, { imageUrl: url });
            setArticle(prev => prev ? {
                ...prev,
                featureImageUrl: url,
                imageCandidates: res.data.candidates ?? prev.imageCandidates,
                imageScores: res.data.imageScores ?? prev.imageScores
            } : null);
        } catch (e) {
            alert('Failed to update image selection');
        }
    };

    const [searching, setSearching] = useState(false);
    const [customImageUrl, setCustomImageUrl] = useState('');
    const [addingCustom, setAddingCustom] = useState(false);

    const handleAddCustomUrl = async () => {
        if (!id || !customImageUrl.trim()) return;
        if (!customImageUrl.startsWith('http')) {
            alert('Por favor ingresá una URL válida (debe comenzar con http)');
            return;
        }
        setAddingCustom(true);
        try {
            const res = await api.put(`/api/articles/${id}/select-image`, { imageUrl: customImageUrl.trim() });
            setArticle(prev => prev ? {
                ...prev,
                featureImageUrl: customImageUrl.trim(),
                imageCandidates: res.data.candidates,
                imageScores: res.data.imageScores
            } : null);
            setCustomImageUrl('');
        } catch (e) {
            alert('No se pudo agregar la imagen. Verificá la URL.');
        } finally {
            setAddingCustom(false);
        }
    };

    const handleSearch = async () => {
        if (!id) return;
        setSearching(true);
        try {
            const res = await api.post(`/api/articles/${id}/search-images`);
            setArticle(prev => prev ? {
                ...prev,
                imageCandidates: res.data.candidates
            } : null);
        } catch (e) {
            alert('Failed to search images');
        } finally {
            setSearching(false);
        }
    };

    const handleReject = async () => {
        if (!id) return;
        if (confirm('Are you sure you want to delete this article?')) {
            try {
                await api.delete(`/api/articles/${id}`);
                navigate('/');
            } catch (error) {
                alert('Failed to delete');
            }
        }
    };

    const [rewriting, setRewriting] = useState(false);

    const handleRewrite = async () => {
        if (!id) return;
        setRewriting(true);
        try {
            const res = await api.post(`/api/articles/${id}/rewrite`);
            setArticle(prev => prev ? {
                ...prev,
                rewrittenTitle: res.data.rewrittenTitle,
                rewrittenContent: res.data.rewrittenContent
            } : null);
        } catch (e) {
            alert('Failed to rewrite article');
        } finally {
            setRewriting(false);
        }
    };

    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!id || !article) return;
        setSaving(true);
        try {
            await api.put(`/api/articles/${id}`, {
                rewrittenTitle: article.rewrittenTitle,
                rewrittenContent: article.rewrittenContent
            });
            alert('¡Cambios guardados!');
        } catch (e) {
            alert('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    const openPublishModal = async () => {
        setShowPublishModal(true);
        setLoadingTargets(true);
        // Auto-set category from article's section
        setSelectedCategory(article?.section || '');
        try {
            const [targetsRes, sectionsRes] = await Promise.all([
                api.get('/api/targets'),
                api.get('/api/config/sections')
            ]);
            setTargets(targetsRes.data);
            setSections(sectionsRes.data);
            if (targetsRes.data.length > 0) {
                setSelectedTargetId(targetsRes.data[0].id);
            }
        } catch (error) {
            console.error('Error fetching publish data:', error);
        } finally {
            setLoadingTargets(false);
        }
    };

    const handlePublish = async () => {
        if (!id || !selectedTargetId) return;
        setPublishing(true);
        try {
            const res = await api.post(`/api/articles/${id}/publish`, { targetId: selectedTargetId, category: selectedCategory || undefined });
            setArticle(prev => prev ? { ...prev, status: 'PUBLISHED' } : null);
            setShowPublishModal(false);
            alert(`✅ ${res.data.message}`);
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to publish'));
        } finally {
            setPublishing(false);
        }
    };

    if (loading) return <div className="text-editorial-text p-10 font-serif">Loading Editor...</div>;
    if (!article) return <div className="text-editorial-text p-10 font-serif">Article not found</div>;

    return (
        <div className="h-screen flex flex-col bg-editorial-bg text-editorial-text font-serif overflow-hidden">
            {/* Header */}
            <header className="h-16 border-b border-editorial-text/10 flex items-center px-6 justify-between bg-editorial-bg/95 backdrop-blur z-10">
                <div className="flex items-center gap-4">
                    <Link to="/" className="text-editorial-text/60 hover:text-editorial-text font-sans text-sm font-bold uppercase tracking-widest transition-colors">← Volver al Dashboard</Link>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleReject} className="px-4 py-2 border border-red-500/30 hover:bg-red-500/10 text-red-600 rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors">
                        Rechazar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                        onClick={handleRewrite}
                        disabled={rewriting}
                        className="px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {rewriting ? (
                            <>
                                <span className="inline-block w-3 h-3 border-2 border-editorial-text/30 border-t-editorial-text rounded-full animate-spin"></span>
                                Reescribiendo...
                            </>
                        ) : 'Reescribir'}
                    </button>
                    <button
                        onClick={openPublishModal}
                        className={`px-4 py-2 rounded text-xs font-sans font-bold uppercase tracking-widest shadow-lg transition-colors ${article.status === 'PUBLISHED'
                            ? 'bg-green-700 text-white hover:bg-green-800'
                            : 'bg-editorial-text text-editorial-bg hover:bg-editorial-text/90'
                            }`}
                    >
                        {article.status === 'PUBLISHED' ? '↻ Republicar' : 'Publicar Artículo'}
                    </button>
                </div>
            </header>

            {/* Publish Modal */}
            {showPublishModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPublishModal(false)}>
                    <div className="bg-editorial-bg border border-editorial-text/20 shadow-2xl p-8 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-2">Publicar Artículo</h3>
                        <p className="font-sans text-sm text-editorial-text/60 mb-4">
                            Seleccioná el medio y la categoría para publicar este artículo.
                        </p>

                        {loadingTargets ? (
                            <div className="py-8 text-center font-sans text-sm opacity-50 animate-pulse">Cargando medios...</div>
                        ) : targets.length === 0 ? (
                            <div className="py-8 text-center font-sans text-sm">
                                <p className="text-editorial-text/60 mb-2">No hay medios configurados.</p>
                                {user?.role === 'ADMIN' ? (
                                    <Link to="/flows" className="text-editorial-text font-bold underline underline-offset-4 hover:opacity-80">
                                        Configurar Medios →
                                    </Link>
                                ) : (
                                    <span className="text-xs italic opacity-50 block mt-2">Ponte en contacto con un administrador.</span>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col gap-2 mb-6 max-h-60 overflow-y-auto">
                                    {targets.map(t => (
                                        <label
                                            key={t.id}
                                            className={`flex items-center gap-3 p-3 border cursor-pointer transition-all font-sans text-sm ${selectedTargetId === t.id
                                                ? 'border-editorial-text bg-editorial-text/5 shadow-sm'
                                                : 'border-editorial-text/10 hover:border-editorial-text/30'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="target"
                                                value={t.id}
                                                checked={selectedTargetId === t.id}
                                                onChange={() => setSelectedTargetId(t.id)}
                                                className="accent-editorial-text"
                                            />
                                            <div className="flex flex-col">
                                                <span className="font-bold">{t.name}</span>
                                                <span className="text-xs text-editorial-text/50">{t.email}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                {/* Category selector */}
                                <div className="mb-6">
                                    <label className="text-xs font-bold uppercase tracking-widest text-editorial-text/50 block mb-2 font-sans">Categoría</label>
                                    <select
                                        value={selectedCategory}
                                        onChange={e => setSelectedCategory(e.target.value)}
                                        className="w-full border border-editorial-text/20 bg-transparent px-3 py-2 font-sans text-sm focus:outline-none focus:border-editorial-text cursor-pointer"
                                    >
                                        <option value="">Sin categoría</option>
                                        {sections.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                    </select>
                                    {selectedCategory && (
                                        <span className="text-[10px] text-editorial-text/40 mt-1 block font-sans italic">
                                            Se publicará con la categoría: {selectedCategory}
                                        </span>
                                    )}
                                </div>

                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => setShowPublishModal(false)}
                                        className="px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 text-xs font-sans font-bold uppercase tracking-widest transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handlePublish}
                                        disabled={publishing || !selectedTargetId}
                                        className="px-6 py-2 bg-editorial-text text-editorial-bg hover:bg-black text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {publishing ? (
                                            <>
                                                <span className="inline-block w-3 h-3 border-2 border-editorial-bg/30 border-t-editorial-bg rounded-full animate-spin"></span>
                                                Enviando...
                                            </>
                                        ) : 'Enviar'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Original Source */}
                <div className="flex-1 border-r border-editorial-text/10 p-12 overflow-y-auto bg-editorial-text/5 scrollbar-thin scrollbar-thumb-editorial-text/20">
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-8 pb-4 border-b border-editorial-text/10">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="font-sans text-xs font-bold uppercase tracking-widest text-editorial-text/50">
                                    Fuente Original
                                </span>
                                {article.section && (
                                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-editorial-bg bg-editorial-text/40 px-1.5 py-0.5 rounded-full">
                                        {article.section}
                                    </span>
                                )}
                            </div>
                            <a href={article.originalUrl} target="_blank" rel="noreferrer" className="text-sm font-mono text-editorial-text/70 truncate hover:underline block cursor-pointer">
                                {article.originalUrl}
                            </a>
                        </div>

                        <h2 className="text-3xl font-black text-editorial-text mb-8 leading-tight italic">
                            {article.originalTitle}
                        </h2>

                        {article.originalImageUrl && (
                            <div className="mb-8 border border-editorial-text/10 p-2 bg-white shadow-sm">
                                <img src={article.originalImageUrl} className="w-full" alt="Original" />
                            </div>
                        )}

                        <div className="prose prose-lg prose-headings:font-serif prose-p:font-serif prose-p:text-editorial-text/80 max-w-none">
                            <p className="whitespace-pre-wrap leading-relaxed">{article.originalContent}</p>
                        </div>
                    </div>
                </div>

                {/* Right: AI Rewrite Editor */}
                <div className="flex-1 p-12 overflow-y-auto bg-editorial-bg">
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-8 flex justify-between items-center border-b border-editorial-text/10 pb-4">
                            <span className="font-sans text-xs font-bold uppercase tracking-widest text-editorial-text">Borrador IA</span>
                            <div className="flex items-center gap-2">
                                <span className="font-sans text-xs uppercase tracking-widest text-editorial-text/50">Score de Interés</span>
                                <span className="bg-editorial-text text-editorial-bg text-xs font-bold px-2 py-0.5 rounded-full font-mono">
                                    {article.interestScore}/10
                                </span>
                            </div>
                        </div>


                        {article.featureImageUrl && (() => {
                            const featureScore = article.imageScores?.[article.featureImageUrl];
                            return (
                                <div className="mb-8">
                                    <div className="relative group rounded-lg overflow-hidden border border-editorial-text/10 shadow-md mb-4 bg-gray-100">
                                        {featureScore !== undefined && (
                                            <div className="absolute top-2 left-2 bg-editorial-text text-editorial-bg text-xs font-bold px-2 py-1 rounded shadow z-10">
                                                ★ Score: {featureScore}/10
                                            </div>
                                        )}
                                        <img src={article.featureImageUrl} alt="Feature" className="w-full h-auto object-cover max-h-[400px]" />
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                            <button
                                                onClick={handleRegenerate}
                                                disabled={generating}
                                                className="bg-editorial-text text-editorial-bg px-3 py-1 rounded text-xs font-bold uppercase tracking-widest shadow flex items-center gap-2 hover:bg-black"
                                            >
                                                {generating ? 'Generating...' : 'Regenerate'}
                                            </button>
                                            <button
                                                onClick={handleSearch}
                                                disabled={searching}
                                                className="bg-white text-editorial-text px-3 py-1 rounded text-xs font-bold uppercase tracking-widest shadow flex items-center gap-2 hover:bg-gray-100"
                                            >
                                                {searching ? 'Searching...' : 'Search Web'}
                                            </button>
                                        </div>

                                        {/* Restore Original Button (if different) */}
                                        {article.originalImageUrl && article.featureImageUrl !== article.originalImageUrl && (
                                            <div className="absolute bottom-2 right-2">
                                                <button
                                                    onClick={() => handleSelectImage(article.originalImageUrl!)}
                                                    className="bg-black/50 backdrop-blur text-white px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-black/70"
                                                >
                                                    Restaurar Original
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Candidates Carousel */}
                                    <div className="mt-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/40 mb-1 block">Imágenes Candidatas</span>

                                        {article.imageCandidates && article.imageCandidates.length > 0 ? (
                                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                                {article.imageCandidates.map((url, idx) => {
                                                    const isOriginal = url === article.originalImageUrl;
                                                    const score = article.imageScores?.[url];

                                                    return (
                                                        <div
                                                            key={idx}
                                                            onClick={() => handleSelectImage(url)}
                                                            className={`relative flex-shrink-0 w-24 h-24 rounded border-2 cursor-pointer overflow-hidden transition-all ${article.featureImageUrl === url ? 'border-editorial-text scale-95 opacity-100 ring-1 ring-editorial-text' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                        >
                                                            {score !== undefined && (
                                                                <div className="absolute top-0 right-0 bg-editorial-text text-editorial-bg text-[10px] font-bold px-1.5 py-0.5 opacity-90 z-10">
                                                                    {score}/10
                                                                </div>
                                                            )}
                                                            <img src={url} className="w-full h-full object-cover" />
                                                            {isOriginal && (
                                                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] font-bold uppercase text-center py-0.5">
                                                                    Original
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-editorial-text/50 italic border border-dashed border-editorial-text/20 rounded p-4 text-center">
                                                No hay más candidatas. Haz clic en "Buscar Web" o "Regenerar" para encontrar más imágenes.
                                            </div>
                                        )}

                                        {/* Manual URL input */}
                                        <div className="mt-3 flex gap-2 items-center">
                                            <input
                                                type="url"
                                                value={customImageUrl}
                                                onChange={e => setCustomImageUrl(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleAddCustomUrl()}
                                                placeholder="Pegar URL de imagen..."
                                                className="flex-1 bg-transparent border border-editorial-text/20 px-3 py-1.5 text-xs font-sans text-editorial-text placeholder-editorial-text/30 focus:outline-none focus:border-editorial-text/50 rounded"
                                            />
                                            <button
                                                onClick={handleAddCustomUrl}
                                                disabled={addingCustom || !customImageUrl.trim()}
                                                className="px-3 py-1.5 bg-editorial-text text-editorial-bg text-xs font-sans font-bold uppercase tracking-widest rounded hover:bg-black disabled:opacity-40 transition-colors whitespace-nowrap"
                                            >
                                                {addingCustom ? '...' : 'Agregar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        <input
                            className="w-full bg-transparent text-4xl font-black text-editorial-text mb-8 focus:outline-none placeholder-editorial-text/30 italic leading-tight"
                            value={article.rewrittenTitle || ''}
                            onChange={(e) => setArticle(prev => prev ? { ...prev, rewrittenTitle: e.target.value } : null)}
                        />

                        <textarea
                            className="w-full h-[calc(100vh-400px)] bg-transparent resize-none focus:outline-none text-editorial-text text-lg leading-relaxed font-serif p-0"
                            value={article.rewrittenContent || ''}
                            onChange={(e) => setArticle(prev => prev ? { ...prev, rewrittenContent: e.target.value } : null)}
                            placeholder="Start writing..."
                        />

                        <div className="mt-8 pt-4 border-t border-editorial-text/10 text-right">
                            <span className="text-xs font-sans text-editorial-text/40 italic">
                                AI generated content. Review before publishing.
                            </span>
                        </div>
                    </div>
                </div>
            </div>

        </div>

    );
}

