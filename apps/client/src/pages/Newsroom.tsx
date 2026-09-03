import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Copy, Check, Eye, Code, Sparkles } from 'lucide-react';
import { api, resolveAssetUrl } from '../lib/api';
import type { Article } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { NotificationsPanel } from '../components/NotificationsPanel';

interface Target {
    id: string;
    name: string;
    email?: string | null;
    type?: 'EMAIL' | 'VORKNEWS';
    config?: any;
}

export default function Newsroom() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isDemo = user?.role === 'DEMO';
    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);

    // Editor Tab: 'normal' | 'social' | 'seo'
    const [editorTab, setEditorTab] = useState<'normal' | 'social' | 'seo'>('normal');
    const [visualMode, setVisualMode] = useState(true);

    // SEO & Editorial fields (unified)
    const [seoTitle, setSeoTitle] = useState('');
    const [seoVolanta, setSeoVolanta] = useState('');
    const [seoBajada, setSeoBajada] = useState('');
    const [seoContent, setSeoContent] = useState('');
    const [seoTags, setSeoTags] = useState('');

    // Social Media Copy fields
    const [socialTwitter, setSocialTwitter] = useState('');
    const [socialInstagram, setSocialInstagram] = useState('');
    const [socialFacebook, setSocialFacebook] = useState('');
    const [socialHashtags, setSocialHashtags] = useState('');
    const [generatingSocial, setGeneratingSocial] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Rewrite modal state (sub-prompt / suggestions)
    const [showRewriteModal, setShowRewriteModal] = useState(false);
    const [rewriteInstructions, setRewriteInstructions] = useState('');

    // Publish modal state
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [publishDest, setPublishDest] = useState<'vorknews' | 'email'>('vorknews');
    const [targets, setTargets] = useState<Target[]>([]);
    const [sections, setSections] = useState<{ id: string, name: string, path: string }[]>([]);
    const [vorknewsSections, setVorknewsSections] = useState<{ id: string, name: string }[]>([]);
    const [vorknewsMode, setVorknewsMode] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
    const [vorknewsSectionId, setVorknewsSectionId] = useState('64');
    const [vorknewsAuthor, setVorknewsAuthor] = useState('Juan Bautista Vega');
    const [selectedTargetId, setSelectedTargetId] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [targetSearch, setTargetSearch] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [loadingTargets, setLoadingTargets] = useState(false);

    function formatToHtml(text: string): string {
        if (!text) return '';
        if (text.includes('<p>') || text.includes('<div>') || text.includes('<h2>') || text.includes('<br>')) {
            return text;
        }
        return text
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(Boolean)
            .map(p => `<p>${p}</p>`)
            .join('\n');
    }

    useEffect(() => {
        if (!id) return;
        api.get(`/api/articles/${id}`)
            .then(res => {
                const data = res.data;
                setArticle(data);
                const editorial = (data.editorialData as any) || {};
                const seo = editorial.seo || {};

                const title = seo.title || data.rewrittenTitle || data.originalTitle || '';
                const volanta = seo.volanta || (data.location ? data.location.toUpperCase() : (data.section ? data.section.toUpperCase() : 'POLÍTICA'));
                const bajada = seo.bajada || data.contentPreview || '';
                const rawContent = seo.content || data.rewrittenContent || data.originalContent || '';
                const content = formatToHtml(rawContent);
                const tags = seo.tags || [data.section, data.location].filter(Boolean).join(', ');

                setSeoTitle(title);
                setSeoVolanta(volanta);
                setSeoBajada(bajada);
                setSeoContent(content);
                setSeoTags(tags);

                if (editorial.social) {
                    setSocialTwitter(editorial.social.twitter || '');
                    setSocialInstagram(editorial.social.instagram || '');
                    setSocialFacebook(editorial.social.facebook || '');
                    setSocialHashtags(editorial.social.hashtags || '');
                }
                setLoading(false);
            });
    }, [id]);

    const [generating, setGenerating] = useState(false);

    const handleRegenerate = async () => {
        if (!id) return;
        setGenerating(true);

        if (isDemo) {
            setTimeout(() => {
                setGenerating(false);
                alert('Demo: se simuló la regeneración de imagen. No se guardó nada.');
            }, 450);
            return;
        }

        try {
            const res = await api.post(`/api/articles/${id}/regenerate-image`);
            setArticle(prev => prev ? {
                ...prev,
                featureImageUrl: res.data.url,
                imageCandidates: res.data.candidates
            } : null);
        } catch (e: any) {
            alert(`No se pudo generar la imagen: ${e?.response?.data?.error || e?.message || 'error desconocido'}`);
        } finally {
            setGenerating(false);
        }
    };

    const handleSelectImage = async (url: string) => {
        if (!id) return;

        if (isDemo) {
            setArticle(prev => prev ? { ...prev, featureImageUrl: url } : null);
            return;
        }

        try {
            const res = await api.put(`/api/articles/${id}/select-image`, { imageUrl: url });
            setArticle(prev => prev ? {
                ...prev,
                featureImageUrl: res.data.featureImageUrl ?? url,
                imageCandidates: res.data.candidates ?? prev.imageCandidates,
                imageScores: res.data.imageScores ?? prev.imageScores
            } : null);
        } catch (e: any) {
            alert(`No se pudo seleccionar la imagen: ${e?.response?.data?.error || e?.message || 'error desconocido'}`);
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

        if (isDemo) {
            setArticle(prev => prev ? {
                ...prev,
                featureImageUrl: customImageUrl.trim(),
                imageCandidates: [customImageUrl.trim(), ...(prev.imageCandidates || [])]
            } : null);
            setCustomImageUrl('');
            setAddingCustom(false);
            return;
        }

        try {
            const res = await api.put(`/api/articles/${id}/select-image`, { imageUrl: customImageUrl.trim() });
            setArticle(prev => prev ? {
                ...prev,
                featureImageUrl: res.data.featureImageUrl ?? customImageUrl.trim(),
                imageCandidates: res.data.candidates,
                imageScores: res.data.imageScores
            } : null);
            setCustomImageUrl('');
        } catch (e: any) {
            alert(`No se pudo agregar la imagen: ${e?.response?.data?.error || e?.message || 'verificá la URL'}`);
        } finally {
            setAddingCustom(false);
        }
    };

    const handleSearch = async () => {
        if (!id) return;
        setSearching(true);

        if (isDemo) {
            setTimeout(() => {
                setSearching(false);
                alert('Demo: se simuló la búsqueda de imágenes. No se guardó nada.');
            }, 450);
            return;
        }

        try {
            const res = await api.post(`/api/articles/${id}/search-images`);
            setArticle(prev => prev ? {
                ...prev,
                imageCandidates: res.data.candidates,
                imageScores: res.data.imageScores ?? prev.imageScores
            } : null);
        } catch (e: any) {
            alert(`No se pudieron buscar imágenes: ${e?.response?.data?.error || e?.message || 'error desconocido'}`);
        } finally {
            setSearching(false);
        }
    };

    const handleReject = async () => {
        if (!id) return;
        if (confirm('Are you sure you want to delete this article?')) {
            if (isDemo) {
                alert('Demo: se simuló el rechazo de la nota. No se eliminó nada.');
                navigate('/');
                return;
            }

            try {
                await api.delete(`/api/articles/${id}`);
                navigate('/');
            } catch (error) {
                alert('Failed to delete');
            }
        }
    };

    const [rewriting, setRewriting] = useState(false);

    const handleRewrite = async (customInstructions?: string) => {
        if (!id) return;
        setRewriting(true);
        setShowRewriteModal(false);

        if (isDemo) {
            setTimeout(() => {
                setRewriting(false);
                alert('Demo: se simuló la reescritura. No se guardó nada.');
            }, 450);
            return;
        }

        try {
            const instructions = (customInstructions !== undefined ? customInstructions : rewriteInstructions).trim();
            const res = await api.post(`/api/articles/${id}/rewrite`, {
                instructions: instructions || undefined
            });
            const updated = res.data;
            setArticle(updated);
            const seo = (updated.editorialData as any)?.seo || {};
            setSeoTitle(seo.title || updated.rewrittenTitle || '');
            setSeoVolanta(seo.volanta || (updated.location ? updated.location.toUpperCase() : (updated.section ? updated.section.toUpperCase() : 'POLÍTICA')));
            setSeoBajada(seo.bajada || updated.contentPreview || '');
            setSeoContent(formatToHtml(seo.content || updated.rewrittenContent || ''));
            setSeoTags(seo.tags || [updated.section, updated.location].filter(Boolean).join(', '));
            setRewriteInstructions('');
        } catch (e) {
            alert('Error al reescribir nota');
        } finally {
            setRewriting(false);
        }
    };

    const [saving, setSaving] = useState(false);

    const saveDraft = async () => {
        if (!id || !article) return;
        if (isDemo) return;

        const currentEditorial = (article.editorialData as any) || {};
        const updatedEditorial = {
            ...currentEditorial,
            seo: {
                title: seoTitle,
                volanta: seoVolanta,
                bajada: seoBajada,
                content: seoContent,
                tags: seoTags
            },
            social: {
                twitter: socialTwitter,
                instagram: socialInstagram,
                facebook: socialFacebook,
                hashtags: socialHashtags
            }
        };

        return api.put(`/api/articles/${id}`, {
            rewrittenTitle: seoTitle,
            rewrittenContent: seoContent,
            editorialData: updatedEditorial
        });
    };

    const handleSave = async () => {
        if (!id || !article) return;
        setSaving(true);
        try {
            await saveDraft();
            alert(isDemo ? 'Demo: cambios simulados. No se guardó nada.' : '¡Cambios guardados!');
        } catch (e) {
            alert('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    const handleGenerateSocial = async () => {
        if (!id) return;
        setGeneratingSocial(true);
        try {
            const res = await api.post(`/api/articles/${id}/generate-social`);
            setSocialTwitter(res.data.twitter || '');
            setSocialInstagram(res.data.instagram || '');
            setSocialFacebook(res.data.facebook || '');
            setSocialHashtags(res.data.hashtags || '');
            setArticle(prev => prev ? {
                ...prev,
                editorialData: res.data.editorialData || {
                    ...(prev.editorialData as any),
                    social: res.data
                }
            } : null);
        } catch (e: any) {
            alert(`Error generando copys para redes: ${e?.response?.data?.error || e?.message}`);
        } finally {
            setGeneratingSocial(false);
        }
    };

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const openPublishModal = async () => {
        setShowPublishModal(true);
        setLoadingTargets(true);
        setTargetSearch('');
        setPublishDest('vorknews');
        // Auto-set category from article's section
        setSelectedCategory(article?.section || '');
        try {
            const [targetsRes, sectionsRes, vkSectionsRes, vkConfigRes] = await Promise.all([
                api.get('/api/targets'),
                api.get('/api/config/sections'),
                api.get('/api/vorknews/sections').catch(() => ({ data: [] })),
                api.get('/api/config/vorknews').catch(() => ({ data: null }))
            ]);
            setTargets(targetsRes.data);
            setSections(sectionsRes.data);
            setVorknewsSections(vkSectionsRes.data || []);
            if (vkConfigRes.data) {
                setVorknewsMode(vkConfigRes.data.mode || 'DRAFT');
                setVorknewsAuthor(vkConfigRes.data.author || 'Juan Bautista Vega');
                setVorknewsSectionId(vkConfigRes.data.sectionId || '64');
            }
            const emailTargets = targetsRes.data.filter((t: Target) => t.type !== 'VORKNEWS');
            if (emailTargets.length > 0) {
                setSelectedTargetId(emailTargets[0].id);
            }
        } catch (error) {
            console.error('Error fetching publish data:', error);
        } finally {
            setLoadingTargets(false);
        }
    };

    const filteredTargets = useMemo(() => {
        const term = targetSearch.trim().toLowerCase();
        if (!term) return targets.filter(t => t.type !== 'VORKNEWS');
        return targets.filter(target =>
            target.type !== 'VORKNEWS' && (
                target.name.toLowerCase().includes(term)
                || (target.email && target.email.toLowerCase().includes(term))
            )
        );
    }, [targets, targetSearch]);

    const handlePublish = async () => {
        if (!id || !article) return;
        if (article.publicationBlocked) {
            alert(article.publicationBlockReason || 'Esta nota está bloqueada para publicación por la configuración editorial.');
            return;
        }
        setPublishing(true);

        const isVorknews = publishDest === 'vorknews';
        const vorknewsTarget = targets.find(t => t.type === 'VORKNEWS');
        const targetId = isVorknews ? (vorknewsTarget?.id || 'VORKNEWS') : selectedTargetId;

        if (!isVorknews && !targetId) {
            alert('Por favor selecciona un medio de destino.');
            setPublishing(false);
            return;
        }

        if (isDemo) {
            setArticle(prev => prev ? { ...prev, status: 'PUBLISHED' } : null);
            setShowPublishModal(false);
            setPublishing(false);
            alert(`✅ Demo: publicación simulada para ${isVorknews ? 'Política del Sur' : 'el destino seleccionado'}. No se envió nada.`);
            return;
        }

        try {
            const payload: any = {
                targetId,
                category: selectedCategory || undefined,
                rewrittenTitle: article.rewrittenTitle,
                rewrittenContent: article.rewrittenContent
            };

            if (isVorknews) {
                payload.vorknewsMode = vorknewsMode;
                payload.vorknewsSectionId = vorknewsSectionId;
                payload.vorknewsAuthor = vorknewsAuthor;
                // Guarantee SEO format: pass current SEO fields if available
                if (seoTitle) payload.vorknewsTitle = seoTitle;
                if (seoContent) payload.vorknewsContentHtml = seoContent;
                if (seoVolanta) payload.vorknewsVolanta = seoVolanta;
                if (seoBajada) payload.vorknewsBajada = seoBajada;
                if (seoTags) payload.vorknewsTags = seoTags;
            }

            const res = await api.post(`/api/articles/${id}/publish`, payload);
            if (res.data.article) {
                const updated = res.data.article;
                setArticle(updated);
                const seo = (updated.editorialData as any)?.seo || {};
                setSeoTitle(seo.title || updated.rewrittenTitle || '');
                setSeoVolanta(seo.volanta || '');
                setSeoBajada(seo.bajada || '');
                setSeoContent(formatToHtml(seo.content || updated.rewrittenContent || ''));
                setSeoTags(seo.tags || '');
            } else {
                setArticle(prev => prev ? { ...prev, status: 'PUBLISHED' } : null);
            }
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
                    <Link to="/" className="flex items-center">
                                    <img src="/logo%20hermes.png" alt="Hermes" className="h-9 w-auto object-contain" />
                    </Link>
                    <Link to="/" className="text-editorial-text/60 hover:text-editorial-text font-sans text-sm font-bold uppercase tracking-widest transition-colors">← Volver al Dashboard</Link>
                    {isDemo && <span className="text-[10px] font-sans font-bold uppercase tracking-widest border border-amber-700/30 text-amber-800 px-2 py-1">Modo demo · simulación</span>}
                </div>
                <div className="flex gap-3 items-center">
                    <NotificationsPanel />
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
                            onClick={openPublishModal}
                            disabled={article.publicationBlocked}
                            title={article.publicationBlocked ? (article.publicationBlockReason || 'Nota bloqueada para publicación') : undefined}
                            className={`px-5 py-2 rounded text-xs font-sans font-bold uppercase tracking-widest shadow transition-colors ${article.status === 'PUBLISHED'
                                ? 'bg-green-700 text-white hover:bg-green-800'
                                : article.publicationBlocked
                                    ? 'bg-red-100 text-red-800 cursor-not-allowed'
                                    : 'bg-editorial-text text-editorial-bg hover:bg-black'
                                }`}
                        >
                            {article.publicationBlocked ? 'Publicación bloqueada' : article.status === 'PUBLISHED' ? '↻ Republicar' : 'Publicar Noticia'}
                        </button>
                </div>
            </header>

            {/* Rewrite with AI Modal (Sub-prompt & Comments) */}
            {showRewriteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowRewriteModal(false)}>
                    <div className="bg-editorial-bg border border-editorial-text/20 shadow-2xl p-8 w-full max-w-lg mx-4 relative" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowRewriteModal(false)}
                            className="absolute top-4 right-4 text-editorial-text/40 hover:text-editorial-text text-lg font-mono leading-none"
                        >
                            ✕
                        </button>

                        <div className="flex items-center gap-2 mb-1.5">
                            <Sparkles className="w-4 h-4 text-editorial-text" />
                            <h3 className="text-xl font-bold font-serif italic text-editorial-text">
                                Reescribir Noticia con IA
                            </h3>
                        </div>
                        <p className="font-sans text-xs text-editorial-text/60 mb-5 leading-relaxed">
                            Podés reescribir con el estilo editorial estándar o agregar sugerencias e indicaciones personalizadas para guiar el enfoque de la IA.
                        </p>

                        <div className="space-y-2 mb-4 font-sans">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/60 block">
                                ¿Agregar comentarios o sugerencias de cambios? (Opcional)
                            </label>
                            <textarea
                                rows={4}
                                value={rewriteInstructions}
                                onChange={e => setRewriteInstructions(e.target.value)}
                                placeholder='Ej: "Enfocate en el reclamo de los vecinos", "Hacelo más formal y directo", "Destacá las declaraciones del intendente"...'
                                className="w-full bg-white/70 border border-editorial-text/20 p-3 text-xs rounded focus:outline-none focus:border-editorial-text resize-none text-editorial-text placeholder-editorial-text/30"
                                autoFocus
                            />
                        </div>

                        {/* Atajos sugeridos */}
                        <div className="mb-6 font-sans">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/40 block mb-2">
                                Sugerencias rápidas:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    'Enfocar en impacto vecinal',
                                    'Más conciso y directo',
                                    'Tono urgente de última hora',
                                    'Destacar citas textuales',
                                    'Enfatizar datos y cifras'
                                ].map((sug, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setRewriteInstructions(prev => prev ? `${prev}. ${sug}` : sug)}
                                        className="text-[10px] px-2.5 py-1 border border-editorial-text/15 hover:border-editorial-text/40 bg-editorial-text/[0.02] hover:bg-editorial-text/5 rounded transition-colors text-editorial-text/70"
                                    >
                                        + {sug}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-editorial-text/10 font-sans text-xs font-bold uppercase tracking-widest">
                            <button
                                type="button"
                                onClick={() => setShowRewriteModal(false)}
                                className="px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 text-editorial-text transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => handleRewrite(rewriteInstructions)}
                                className="px-6 py-2 bg-editorial-text text-editorial-bg hover:bg-black transition-colors flex items-center gap-2"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                {rewriteInstructions.trim() ? 'Reescribir con Sugerencias' : 'Reescribir Directo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Publish Modal */}
            {showPublishModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPublishModal(false)}>
                    <div className="bg-editorial-bg border border-editorial-text/20 shadow-2xl p-8 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-1">{isDemo ? 'Vista previa de publicación' : 'Publicar Noticia'}</h3>
                        <p className="font-sans text-xs text-editorial-text/60 mb-6">
                            Elegí el destino para publicar o despachar esta nota editorial.
                        </p>

                        {/* Destination Tabs */}
                        <div className="flex border-b border-editorial-text/20 mb-6 gap-6 font-sans text-xs font-bold uppercase tracking-widest items-center">
                            <button
                                type="button"
                                onClick={() => setPublishDest('vorknews')}
                                className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${publishDest === 'vorknews' ? 'border-editorial-text text-editorial-text' : 'border-transparent text-editorial-text/40 hover:text-editorial-text'}`}
                            >
                                ⭐ Política del Sur (CMS)
                            </button>
                            <button
                                type="button"
                                onClick={() => setPublishDest('email')}
                                className={`pb-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${publishDest === 'email' ? 'border-editorial-text text-editorial-text' : 'border-transparent text-editorial-text/40 hover:text-editorial-text'}`}
                            >
                                📧 Otros Medios (Email)
                            </button>
                            {loadingTargets && (
                                <span className="ml-auto text-[10px] text-editorial-text/40 lowercase italic">
                                    cargando...
                                </span>
                            )}
                        </div>

                        {publishDest === 'vorknews' ? (
                            <div className="space-y-4 font-sans mb-6">
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/60 block mb-1.5">
                                        Modo de publicación
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => setVorknewsMode('DRAFT')}
                                            className={`p-2.5 border text-center font-bold uppercase tracking-wider transition-colors ${vorknewsMode === 'DRAFT' ? 'border-editorial-text bg-editorial-text text-editorial-bg' : 'border-editorial-text/20 bg-transparent hover:bg-editorial-text/5 text-editorial-text'}`}
                                        >
                                            Guardar Borrador
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setVorknewsMode('PUBLISHED')}
                                            className={`p-2.5 border text-center font-bold uppercase tracking-wider transition-colors ${vorknewsMode === 'PUBLISHED' ? 'border-editorial-text bg-editorial-text text-editorial-bg' : 'border-editorial-text/20 bg-transparent hover:bg-editorial-text/5 text-editorial-text'}`}
                                        >
                                            Publicar Directo
                                        </button>
                                    </div>
                                    <span className="text-[10px] text-editorial-text/50 block mt-1">
                                        {vorknewsMode === 'DRAFT' ? 'Quedará en Vorknews Noticias Borrador para revisión del editor.' : 'Se publicará inmediatamente visible en el portal.'}
                                    </span>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/60 block mb-1">
                                        Sección en Política del Sur
                                    </label>
                                    <select
                                        value={vorknewsSectionId}
                                        onChange={e => setVorknewsSectionId(e.target.value)}
                                        className="w-full border border-editorial-text/20 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:border-editorial-text rounded"
                                    >
                                        {vorknewsSections.length > 0 ? (
                                            vorknewsSections.map(sec => (
                                                <option key={sec.id} value={sec.id}>{sec.name}</option>
                                            ))
                                        ) : (
                                            <option value="64">Lanús (ID: 64)</option>
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/60 block mb-1">
                                        Firma de Autor
                                    </label>
                                    <input
                                        type="text"
                                        value={vorknewsAuthor}
                                        onChange={e => setVorknewsAuthor(e.target.value)}
                                        placeholder="Juan Bautista Vega"
                                        className="w-full border border-editorial-text/20 bg-white/70 px-3 py-2 text-sm focus:outline-none focus:border-editorial-text rounded"
                                    />
                                </div>

                                {/* Ficha de Despacho Editorial (Vista previa de todo lo que se enviará) */}
                                <div className="p-3.5 bg-editorial-text/[0.03] border border-editorial-text/20 rounded text-xs space-y-2.5 font-sans">
                                    <div className="flex items-center justify-between border-b border-editorial-text/10 pb-1.5 font-bold uppercase tracking-widest text-[10px] text-editorial-text/60">
                                        <span>Ficha de Publicación · Política del Sur</span>
                                        <span className="text-emerald-700 font-bold">✓ Formato SEO Activo</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50 block">Volanta:</span>
                                        <p className="font-bold text-xs uppercase text-editorial-text">{seoVolanta || 'Sin volanta asignada'}</p>
                                    </div>
                                    <div>
                                        <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50 block">Título:</span>
                                        <p className="font-serif italic font-bold text-sm text-editorial-text">{seoTitle || article.rewrittenTitle}</p>
                                    </div>
                                    {seoBajada && (
                                        <div>
                                            <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50 block">Bajada:</span>
                                            <p className="font-serif italic text-xs text-editorial-text/80 line-clamp-2">{seoBajada}</p>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center pt-1 border-t border-editorial-text/10 text-xs">
                                        <div>
                                            <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50 block">Sección:</span>
                                            <span className="font-bold text-editorial-text">
                                                {vorknewsSections.find(s => s.id === vorknewsSectionId)?.name || `ID: ${vorknewsSectionId}`}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50 block">Firma:</span>
                                            <span className="font-bold text-editorial-text">{vorknewsAuthor || 'Juan Bautista Vega'}</span>
                                        </div>
                                    </div>
                                    {seoTags && (
                                        <div className="pt-1">
                                            <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50 block">Etiquetas (Tags):</span>
                                            <p className="font-mono text-[11px] text-editorial-text/70">{seoTags}</p>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-editorial-text/60 italic pt-1">
                                        El cuerpo de la nota se enviará en formato HTML estructurado con encabezados y párrafos semánticos optimizados para SEO.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-editorial-text/50 block mb-2 font-sans">Buscar medio</label>
                                    <input
                                        type="search"
                                        value={targetSearch}
                                        onChange={e => setTargetSearch(e.target.value)}
                                        placeholder="Nombre o email"
                                        className="w-full border border-editorial-text/20 bg-transparent px-3 py-2 font-sans text-sm focus:outline-none focus:border-editorial-text"
                                    />
                                </div>

                                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                                    {filteredTargets.length === 0 ? (
                                        <div className="py-6 text-center font-sans text-sm text-editorial-text/50 border border-editorial-text/10">
                                            No hay medios por email configurados.
                                        </div>
                                    ) : (
                                        filteredTargets.map(t => (
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
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-bold truncate">{t.name}</span>
                                                    <span className="text-xs text-editorial-text/50 truncate">{t.email}</span>
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-editorial-text/50 block mb-1 font-sans">Categoría</label>
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
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 justify-end pt-4 border-t border-editorial-text/10">
                            <button
                                onClick={() => setShowPublishModal(false)}
                                className="px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 text-xs font-sans font-bold uppercase tracking-widest transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handlePublish}
                                disabled={publishing || (publishDest === 'email' && !selectedTargetId)}
                                className="px-6 py-2 bg-editorial-text text-editorial-bg hover:bg-black text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {publishing ? (
                                    <>
                                        <span className="inline-block w-3 h-3 border-2 border-editorial-bg/30 border-t-editorial-bg rounded-full animate-spin"></span>
                                        Publicando...
                                    </>
                                ) : publishDest === 'vorknews' ? (
                                    vorknewsMode === 'DRAFT' ? 'Guardar Borrador en Política del Sur' : 'Publicar Noticia en Política del Sur'
                                ) : 'Enviar por Email'}
                            </button>
                        </div>
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
                                {article.publicationBlocked && (
                                    <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest" title={article.publicationBlockReason || undefined}>
                                        No publicar
                                    </span>
                                )}
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

                        {/* Editorial Tabs */}
                        <div className="flex border-b border-editorial-text/20 mb-8 gap-6 font-sans text-xs font-bold uppercase tracking-widest items-center">
                            <button
                                type="button"
                                onClick={() => setEditorTab('normal')}
                                className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${editorTab === 'normal' ? 'border-editorial-text text-editorial-text' : 'border-transparent text-editorial-text/40 hover:text-editorial-text'}`}
                            >
                                📰 Noticia Completa (Editorial)
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditorTab('social')}
                                className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${editorTab === 'social' ? 'border-editorial-text text-editorial-text' : 'border-transparent text-editorial-text/40 hover:text-editorial-text'}`}
                            >
                                <span>📱 Copy para Redes</span>
                                {socialTwitter && <span className="w-1.5 h-1.5 rounded-full bg-editorial-text inline-block" title="Copys generados"></span>}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditorTab('seo')}
                                className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${editorTab === 'seo' ? 'border-editorial-text text-editorial-text' : 'border-transparent text-editorial-text/40 hover:text-editorial-text'}`}
                            >
                                <span>‹/› Inspector SEO</span>
                            </button>
                        </div>

                        {/* Tab 1: Noticia Completa (Editorial) */}
                        {editorTab === 'normal' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center pb-3 border-b border-editorial-text/10">
                                    <div>
                                        <h4 className="text-xs font-sans font-bold uppercase tracking-widest text-editorial-text">
                                            Redacción · Política del Sur
                                        </h4>
                                        <p className="text-[11px] font-sans text-editorial-text/50">
                                            Formato enriquecido y optimizado para CMS Vorknews
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowRewriteModal(true)}
                                        disabled={rewriting}
                                        className="px-3.5 py-1.5 border border-editorial-text/30 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {rewriting ? (
                                            <>
                                                <span className="inline-block w-3 h-3 border-2 border-editorial-text/30 border-t-editorial-text rounded-full animate-spin"></span>
                                                Reescribiendo...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-3.5 h-3.5" />
                                                Reescribir con IA
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Volanta */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-sans font-bold uppercase tracking-widest text-editorial-text/50">
                                            Volanta / Localidad
                                        </label>
                                        <span className="text-[10px] font-sans text-editorial-text/40 uppercase tracking-widest">
                                            {seoVolanta.length} caracteres
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={seoVolanta}
                                        onChange={e => setSeoVolanta(e.target.value)}
                                        placeholder="Ej: GRAN BUENOS AIRES · LANÚS"
                                        className="w-full bg-transparent border-b border-editorial-text/20 focus:border-editorial-text outline-none text-xs font-sans font-bold uppercase tracking-widest py-1.5 text-editorial-text placeholder-editorial-text/30"
                                    />
                                </div>

                                {/* Título */}
                                <div>
                                    <label className="text-[10px] font-sans font-bold uppercase tracking-widest text-editorial-text/50 block mb-1">
                                        Título de la Noticia
                                    </label>
                                    <textarea
                                        ref={titleRef}
                                        rows={2}
                                        value={seoTitle}
                                        onChange={(e) => {
                                            setSeoTitle(e.target.value);
                                            setArticle(prev => prev ? { ...prev, rewrittenTitle: e.target.value } : null);
                                            const el = e.currentTarget;
                                            el.style.height = 'auto';
                                            el.style.height = `${el.scrollHeight}px`;
                                        }}
                                        placeholder="Título de la nota..."
                                        className="w-full bg-transparent text-3xl md:text-4xl font-black text-editorial-text focus:outline-none placeholder-editorial-text/30 italic leading-tight resize-none"
                                    />
                                </div>

                                {/* Bajada / Copete */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-sans font-bold uppercase tracking-widest text-editorial-text/50">
                                            Bajada / Copete
                                        </label>
                                        <span className="text-[10px] font-sans text-editorial-text/40 italic">
                                            Resumen introductorio
                                        </span>
                                    </div>
                                    <textarea
                                        rows={3}
                                        value={seoBajada}
                                        onChange={e => setSeoBajada(e.target.value)}
                                        placeholder="Resumen o copete de la noticia..."
                                        className="w-full bg-transparent text-base font-serif italic text-editorial-text/80 focus:outline-none leading-relaxed resize-none border-l-2 border-editorial-text/30 pl-3 py-1 placeholder-editorial-text/30"
                                    />
                                </div>

                                {/* Cuerpo de la Nota */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[10px] font-sans font-bold uppercase tracking-widest text-editorial-text/50">
                                            Cuerpo de la Nota
                                        </label>
                                        <div className="flex items-center gap-1 border border-editorial-text/20 p-0.5 rounded text-[11px] font-sans">
                                            <button
                                                type="button"
                                                onClick={() => setVisualMode(true)}
                                                className={`px-2.5 py-1 font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ${visualMode ? 'bg-editorial-text text-editorial-bg' : 'text-editorial-text/60 hover:text-editorial-text'}`}
                                            >
                                                <Eye className="w-3 h-3" />
                                                Texto Enriquecido (Visual)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setVisualMode(false)}
                                                className={`px-2.5 py-1 font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ${!visualMode ? 'bg-editorial-text text-editorial-bg' : 'text-editorial-text/60 hover:text-editorial-text'}`}
                                            >
                                                <Code className="w-3 h-3" />
                                                Fuente HTML
                                            </button>
                                        </div>
                                    </div>

                                    {visualMode ? (
                                        <div
                                            contentEditable
                                            suppressContentEditableWarning
                                            onInput={e => {
                                                const html = e.currentTarget.innerHTML;
                                                setSeoContent(html);
                                                setArticle(prev => prev ? { ...prev, rewrittenContent: html } : null);
                                            }}
                                            dangerouslySetInnerHTML={{ __html: seoContent || '<p>Comenzar a escribir...</p>' }}
                                            className="prose prose-base max-w-none border border-editorial-text/15 p-6 bg-white/60 min-h-[380px] leading-relaxed font-serif rounded focus:outline-none focus:border-editorial-text shadow-sm overflow-y-auto"
                                        />
                                    ) : (
                                        <textarea
                                            value={seoContent}
                                            onChange={e => {
                                                setSeoContent(e.target.value);
                                                setArticle(prev => prev ? { ...prev, rewrittenContent: e.target.value } : null);
                                            }}
                                            rows={16}
                                            className="w-full font-mono text-xs leading-relaxed bg-editorial-text/[0.02] border border-editorial-text/20 p-4 focus:border-editorial-text focus:outline-none resize-none rounded shadow-inner"
                                            placeholder="<p>Texto con formato HTML...</p>"
                                        />
                                    )}
                                </div>

                                {/* Etiquetas / Palabras Clave */}
                                <div className="pt-2 border-t border-editorial-text/10">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-sans font-bold uppercase tracking-widest text-editorial-text/50">
                                            Etiquetas / Palabras Clave (Vorknews)
                                        </label>
                                        <span className="text-[10px] font-sans text-editorial-text/40">
                                            Separadas por coma
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={seoTags}
                                        onChange={e => setSeoTags(e.target.value)}
                                        placeholder="Ej: Politica, Lanus, Provincia, Seguridad"
                                        className="w-full bg-transparent border border-editorial-text/20 px-3 py-2 text-xs font-sans rounded focus:border-editorial-text outline-none text-editorial-text placeholder-editorial-text/30"
                                    />
                                    {seoTags && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {seoTags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, i) => (
                                                <span key={i} className="text-[10px] font-sans font-medium px-2 py-0.5 bg-editorial-text/5 border border-editorial-text/15 rounded-full text-editorial-text/70">
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tab 3: Inspector SEO */}
                        {editorTab === 'seo' && (
                            <div className="space-y-6 font-sans">
                                <div className="pb-3 border-b border-editorial-text/10">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-editorial-text">
                                        Inspector SEO & Métricas
                                    </h4>
                                    <p className="text-[11px] text-editorial-text/50">
                                        Análisis de metadatos, rendimiento para buscadores y código de la nota
                                    </p>
                                </div>

                                {/* Simulación Google / Buscadores */}
                                <div className="p-4 bg-white border border-editorial-text/20 rounded shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/50 block mb-2">
                                        Vista Previa en Buscadores (Google Snippet)
                                    </span>
                                    <div className="text-xs text-emerald-800 font-mono mb-1">
                                        https://politicadelsur.com/nota/...
                                    </div>
                                    <h5 className="text-base text-blue-800 font-bold hover:underline cursor-pointer mb-1 leading-snug">
                                        {seoTitle || article.rewrittenTitle}
                                    </h5>
                                    <p className="text-xs text-editorial-text/70 line-clamp-2 leading-relaxed">
                                        {seoBajada || (seoContent ? seoContent.replace(/<[^>]*>?/gm, '').slice(0, 160) + '...' : '')}
                                    </p>
                                </div>

                                {/* Métricas del Artículo */}
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="p-3 border border-editorial-text/15 bg-editorial-text/[0.02] rounded">
                                        <span className="text-2xl font-black text-editorial-text block">
                                            {seoContent ? seoContent.replace(/<[^>]*>?/gm, '').trim().split(/\s+/).filter(Boolean).length : 0}
                                        </span>
                                        <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50">
                                            Palabras
                                        </span>
                                    </div>
                                    <div className="p-3 border border-editorial-text/15 bg-editorial-text/[0.02] rounded">
                                        <span className="text-2xl font-black text-editorial-text block">
                                            {seoContent ? seoContent.replace(/<[^>]*>?/gm, '').length : 0}
                                        </span>
                                        <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50">
                                            Caracteres
                                        </span>
                                    </div>
                                    <div className="p-3 border border-editorial-text/15 bg-editorial-text/[0.02] rounded">
                                        <span className="text-2xl font-black text-editorial-text block">
                                            {seoTags ? seoTags.split(',').filter(t => t.trim()).length : 0}
                                        </span>
                                        <span className="text-[10px] uppercase font-bold tracking-widest text-editorial-text/50">
                                            Etiquetas
                                        </span>
                                    </div>
                                </div>

                                {/* Raw HTML export */}
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/50">
                                            Código Fuente HTML (CKEditor Vorknews)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(seoContent, 'html')}
                                            className="text-xs font-bold uppercase tracking-widest flex items-center gap-1 text-editorial-text/70 hover:text-editorial-text"
                                        >
                                            {copiedKey === 'html' ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar HTML</>}
                                        </button>
                                    </div>
                                    <textarea
                                        readOnly
                                        rows={8}
                                        value={seoContent}
                                        className="w-full font-mono text-xs leading-relaxed bg-editorial-text/[0.03] border border-editorial-text/20 p-3 rounded text-editorial-text/80 focus:outline-none resize-none"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Tab 3: Copy para Redes */}
                        {editorTab === 'social' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center pb-4 border-b border-editorial-text/10">
                                    <div>
                                        <h4 className="text-xs font-sans font-bold uppercase tracking-widest text-editorial-text">
                                            Copywriting para Redes Sociales
                                        </h4>
                                        <p className="text-[11px] font-sans text-editorial-text/50">
                                            Adaptado al tono de Política del Sur con ganchos y hashtags
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGenerateSocial}
                                        disabled={generatingSocial}
                                        className="px-3.5 py-1.5 border border-editorial-text/30 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {generatingSocial ? (
                                            <>
                                                <span className="inline-block w-3 h-3 border-2 border-editorial-text/30 border-t-editorial-text rounded-full animate-spin"></span>
                                                Generando copys...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-3.5 h-3.5" />
                                                {socialTwitter ? '↻ Regenerar Copys' : '⚡ Generar Copys Redes'}
                                            </>
                                        )}
                                    </button>
                                </div>

                                {(!socialTwitter && !socialInstagram && !socialFacebook) ? (
                                    <div className="border border-dashed border-editorial-text/20 p-12 text-center my-6">
                                        <Sparkles className="w-8 h-8 mx-auto mb-3 text-editorial-text/40" />
                                        <h4 className="text-sm font-sans font-bold uppercase tracking-widest mb-1 text-editorial-text">
                                            Copys para redes no generados
                                        </h4>
                                        <p className="text-xs font-sans text-editorial-text/60 max-w-md mx-auto mb-6 leading-relaxed">
                                            Creá automáticamente publicaciones optimizadas con emojis, llamados a la acción y hashtags para X (Twitter), Instagram y Facebook.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleGenerateSocial}
                                            disabled={generatingSocial}
                                            className="px-5 py-2.5 bg-editorial-text text-editorial-bg hover:bg-black font-sans text-xs font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2"
                                        >
                                            {generatingSocial ? 'Generando...' : '⚡ Generar Copy para Redes'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {/* X / Twitter */}
                                        <div className="border border-editorial-text/15 bg-white/40 p-4 rounded">
                                            <div className="flex justify-between items-center mb-2 font-sans">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-editorial-text">X / Twitter</span>
                                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 border rounded ${socialTwitter.length > 280 ? 'border-red-400 text-red-600' : 'border-editorial-text/20 text-editorial-text/60'}`}>
                                                        {socialTwitter.length}/280
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(socialTwitter, 'twitter')}
                                                    className="text-xs font-bold uppercase tracking-widest flex items-center gap-1 text-editorial-text/70 hover:text-editorial-text transition-colors"
                                                >
                                                    {copiedKey === 'twitter' ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                                                </button>
                                            </div>
                                            <textarea
                                                value={socialTwitter}
                                                onChange={e => setSocialTwitter(e.target.value)}
                                                rows={4}
                                                className="w-full bg-transparent font-sans text-sm focus:outline-none resize-none leading-relaxed"
                                            />
                                        </div>

                                        {/* Instagram */}
                                        <div className="border border-editorial-text/15 bg-white/40 p-4 rounded">
                                            <div className="flex justify-between items-center mb-2 font-sans">
                                                <span className="text-xs font-bold uppercase tracking-widest text-editorial-text">Instagram (Feed / Carrusel)</span>
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(socialInstagram, 'instagram')}
                                                    className="text-xs font-bold uppercase tracking-widest flex items-center gap-1 text-editorial-text/70 hover:text-editorial-text transition-colors"
                                                >
                                                    {copiedKey === 'instagram' ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                                                </button>
                                            </div>
                                            <textarea
                                                value={socialInstagram}
                                                onChange={e => setSocialInstagram(e.target.value)}
                                                rows={7}
                                                className="w-full bg-transparent font-sans text-sm focus:outline-none resize-none leading-relaxed"
                                            />
                                        </div>

                                        {/* Facebook */}
                                        <div className="border border-editorial-text/15 bg-white/40 p-4 rounded">
                                            <div className="flex justify-between items-center mb-2 font-sans">
                                                <span className="text-xs font-bold uppercase tracking-widest text-editorial-text">Facebook</span>
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(socialFacebook, 'facebook')}
                                                    className="text-xs font-bold uppercase tracking-widest flex items-center gap-1 text-editorial-text/70 hover:text-editorial-text transition-colors"
                                                >
                                                    {copiedKey === 'facebook' ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                                                </button>
                                            </div>
                                            <textarea
                                                value={socialFacebook}
                                                onChange={e => setSocialFacebook(e.target.value)}
                                                rows={5}
                                                className="w-full bg-transparent font-sans text-sm focus:outline-none resize-none leading-relaxed"
                                            />
                                        </div>

                                        {/* Hashtags */}
                                        {socialHashtags && (
                                            <div className="border border-editorial-text/15 bg-white/40 p-4 rounded">
                                                <div className="flex justify-between items-center mb-2 font-sans">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-editorial-text">Hashtags recomendados</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(socialHashtags, 'hashtags')}
                                                        className="text-xs font-bold uppercase tracking-widest flex items-center gap-1 text-editorial-text/70 hover:text-editorial-text transition-colors"
                                                    >
                                                        {copiedKey === 'hashtags' ? <><Check className="w-3.5 h-3.5 text-green-600" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={socialHashtags}
                                                    onChange={e => setSocialHashtags(e.target.value)}
                                                    className="w-full bg-transparent font-mono text-xs text-editorial-text/80 focus:outline-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

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

