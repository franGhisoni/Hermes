import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, resolveAssetUrl } from '../lib/api';
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
    const titleRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize the title textarea to fit its content (wraps to as many
    // lines as needed instead of clipping when the headline is long).
    useEffect(() => {
        const el = titleRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [article?.rewrittenTitle]);

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
                            const isFeatureGenerated = article.featureImageUrl.startsWith('/api/images/');
                            const isFeatureOriginal = article.featureImageUrl === article.originalImageUrl;
                            return (
                                <div className="mb-8">
                                    <div className="relative group rounded-lg overflow-hidden border border-editorial-text/10 shadow-md mb-4 bg-gray-100">
                                        {featureScore !== undefined && (
                                            <div className="absolute top-2 left-2 bg-editorial-text text-editorial-bg text-xs font-bold px-2 py-1 rounded shadow z-10">
                                                ★ Score: {featureScore}/10
                                            </div>
                                        )}
                                        {isFeatureGenerated && (
                                            <div className="absolute top-2 left-2 mt-9 bg-purple-700 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded shadow z-10">
                                                Generada IA
                                            </div>
                                        )}
                                        {isFeatureOriginal && (
                                            <div className="absolute top-2 left-2 mt-9 bg-black/70 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded shadow z-10">
                                                Original
                                            </div>
                                        )}
                                        <img src={resolveAssetUrl(article.featureImageUrl)} alt="Feature" className="w-full h-auto object-cover max-h-[400px]" />
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

                                        {(() => {
                                            // Hide candidates the AI scored at 0 — they are explicit
                                            // "this is unusable" picks (wrong subject, broken URL, etc.)
                                            // and surfacing them clogs the editor with junk. We still
                                            // keep the original image and AI-generated ones regardless
                                            // of score so the editor always has a fallback.
                                            // Admins see everything for debugging the scorer.
                                            const isAdmin = user?.role === 'ADMIN';
                                            const allCandidates = article.imageCandidates || [];
                                            const visibleCandidates = isAdmin ? allCandidates : allCandidates.filter(url => {
                                                if (url === article.originalImageUrl) return true;
                                                if (url.startsWith('/api/images/')) return true;
                                                const score = article.imageScores?.[url];
                                                if (score === undefined || score === null) return true;
                                                return score > 0;
                                            });
                                            const hiddenCount = allCandidates.length - visibleCandidates.length;

                                            return visibleCandidates.length > 0 ? (
                                            <>
                                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                                {visibleCandidates.map((url, idx) => {
                                                    const isOriginal = url === article.originalImageUrl;
                                                    const isGenerated = url.startsWith('/api/images/');
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
                                                            <img src={resolveAssetUrl(url)} className="w-full h-full object-cover" />
                                                            {isOriginal && (
                                                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] font-bold uppercase text-center py-0.5">
                                                                    Original
                                                                </div>
                                                            )}
                                                            {isGenerated && (
                                                                <div className="absolute bottom-0 left-0 right-0 bg-purple-700/70 text-white text-[8px] font-bold uppercase text-center py-0.5">
                                                                    Generada IA
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {hiddenCount > 0 && (
                                                <span className="text-[10px] font-sans italic text-editorial-text/40 block mt-1">
                                                    {hiddenCount} candidata{hiddenCount === 1 ? '' : 's'} oculta{hiddenCount === 1 ? '' : 's'} por puntaje 0.
                                                </span>
                                            )}
                                            </>
                                            ) : (
                                            <div className="text-xs text-editorial-text/50 italic border border-dashed border-editorial-text/20 rounded p-4 text-center">
                                                {hiddenCount > 0
                                                    ? `Todas las candidatas (${hiddenCount}) fueron descartadas por puntaje 0. Probá "Regenerar" o subir una manual.`
                                                    : 'No hay más candidatas. Haz clic en "Buscar Web" o "Regenerar" para encontrar más imágenes.'}
                                            </div>
                                            );
                                        })()}

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

                                    {user?.role === 'ADMIN' && article.aiDecisions && (
                                        <AdminAiTracePanel trace={article.aiDecisions} />
                                    )}
                                </div>
                            );
                        })()}

                        <textarea
                            ref={titleRef}
                            rows={1}
                            className="w-full bg-transparent text-4xl font-black text-editorial-text mb-8 focus:outline-none placeholder-editorial-text/30 italic leading-tight resize-none overflow-hidden"
                            value={article.rewrittenTitle || ''}
                            onChange={(e) => {
                                setArticle(prev => prev ? { ...prev, rewrittenTitle: e.target.value } : null);
                                // Resize synchronously so the textarea grows
                                // as the user types instead of waiting for the
                                // useEffect on the next render.
                                const el = e.currentTarget;
                                el.style.height = 'auto';
                                el.style.height = `${el.scrollHeight}px`;
                            }}
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

// ---------- AdminAiTracePanel ----------
// Collapsed by default. Shows the full thread of what gpt-4o decided per
// candidate, plus the protagonist it identified and the search queries it
// generated. Visible only to admins (the gate is in the parent).
function AdminAiTracePanel({ trace }: { trace: NonNullable<Article['aiDecisions']> }) {
    const [open, setOpen] = useState(false);
    const scoring = trace.imageScoring || [];
    const sorted = [...scoring].sort((a, b) => b.score - a.score);

    const fallbackBadge = trace.fallbackUsed === 'dalle'
        ? <span className="text-[9px] font-sans font-bold uppercase tracking-widest px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded">Fallback DALL-E</span>
        : trace.fallbackUsed === 'original'
            ? <span className="text-[9px] font-sans font-bold uppercase tracking-widest px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded">Fallback original</span>
            : null;

    return (
        <div className="mt-4 border border-purple-300/40 bg-purple-50/30">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-purple-100/30 transition-colors"
            >
                <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-purple-900">
                    Traza de IA <span className="opacity-50 normal-case">(solo admins)</span>
                </span>
                {fallbackBadge}
                <span className="ml-auto text-[10px] font-sans text-purple-900/60">
                    {open ? '▾' : '▸'}
                </span>
            </button>

            {open && (
                <div className="px-3 pb-3 pt-1 flex flex-col gap-3 text-xs font-sans">
                    {trace.imageProtagonist && (
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest opacity-50">Protagonista identificado</div>
                            <div className="mt-0.5 leading-snug">{trace.imageProtagonist}</div>
                        </div>
                    )}

                    {trace.smartQueries && trace.smartQueries.length > 0 && (
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest opacity-50">Queries generadas por IA</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                {trace.smartQueries.map((q, i) => (
                                    <code key={i} className="bg-white/60 border border-purple-200/60 px-1.5 py-0.5 text-[10px] rounded">{q}</code>
                                ))}
                            </div>
                        </div>
                    )}

                    {trace.searchExecutions && trace.searchExecutions.length > 0 && (
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">URLs de búsqueda ejecutadas</div>
                            <div className="flex flex-col gap-1">
                                {trace.searchExecutions.map((exec, i) => (
                                    <div key={i} className="bg-white/60 border border-purple-200/40 px-2 py-1.5 text-[10px]">
                                        <div className="font-mono opacity-80 mb-0.5 truncate">{exec.query}</div>
                                        <a href={exec.providerUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 hover:underline ${exec.resultCount === 0 ? 'text-red-700/60' : 'text-blue-700'}`}>
                                            <span className="font-bold">SearXNG</span>
                                            <span className="opacity-70">({exec.resultCount} resultados)</span>
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {sorted.length > 0 && (
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest opacity-50 mb-1">Scoring por candidata (ordenado de mejor a peor)</div>
                            <div className="flex flex-col gap-1.5">
                                {sorted.map((s, i) => {
                                    const scoreColor = s.score >= 7 ? 'bg-green-100 text-green-900'
                                        : s.score >= 4 ? 'bg-amber-100 text-amber-900'
                                        : 'bg-red-100/70 text-red-900';
                                    const engineColor = s.sourceEngine === 'google' || s.sourceEngine === 'searxng-google' || s.sourceEngine === 'searxng-google images' ? 'bg-blue-100 text-blue-900'
                                        : s.sourceEngine === 'bing' || s.sourceEngine === 'searxng-bing' || s.sourceEngine === 'searxng-bing images' ? 'bg-cyan-100 text-cyan-900'
                                        : s.sourceEngine === 'searxng-duckduckgo' || s.sourceEngine === 'searxng-duckduckgo images' ? 'bg-orange-100 text-orange-900'
                                        : s.sourceEngine === 'searxng-qwant' || s.sourceEngine === 'searxng-qwant images' ? 'bg-emerald-100 text-emerald-900'
                                        : s.sourceEngine === 'dalle' ? 'bg-purple-100 text-purple-900'
                                        : s.sourceEngine === 'original' ? 'bg-gray-100 text-gray-700'
                                        : s.sourceEngine?.startsWith('searxng') ? 'bg-slate-100 text-slate-800'
                                        : 'bg-gray-50 text-gray-500';
                                    return (
                                        <div key={`${s.url}-${i}`} className="flex items-start gap-2 bg-white/60 border border-purple-200/40 p-1.5">
                                            <img src={resolveAssetUrl(s.url)} alt="" className="w-12 h-12 object-cover flex-shrink-0 border border-editorial-text/10" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scoreColor}`}>{s.score}/10</span>
                                                    {s.sourceEngine && (
                                                        <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${engineColor}`}>{s.sourceEngine}</span>
                                                    )}
                                                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono opacity-50 hover:opacity-100 truncate flex-1 min-w-0">
                                                        {s.url.length > 70 ? s.url.slice(0, 70) + '…' : s.url}
                                                    </a>
                                                </div>
                                                <div className="text-[11px] mt-0.5 leading-snug opacity-90">{s.reason || <span className="opacity-50 italic">(sin razón registrada)</span>}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

