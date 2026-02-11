import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Article } from '../types';

export default function Newsroom() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);

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
            // Update local state with new image and candidates
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
            await api.put(`/api/articles/${id}/select-image`, { imageUrl: url });
            setArticle(prev => prev ? { ...prev, featureImageUrl: url } : null);
        } catch (e) {
            alert('Failed to update image selection');
        }
    };

    const [searching, setSearching] = useState(false);

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

    if (loading) return <div className="text-editorial-text p-10 font-serif">Loading Editor...</div>;
    if (!article) return <div className="text-editorial-text p-10 font-serif">Article not found</div>;

    return (
        <div className="h-screen flex flex-col bg-editorial-bg text-editorial-text font-serif overflow-hidden">
            {/* Header */}
            <header className="h-16 border-b border-editorial-text/10 flex items-center px-6 justify-between bg-editorial-bg/95 backdrop-blur z-10">
                <div className="flex items-center gap-4">
                    <Link to="/" className="text-editorial-text/60 hover:text-editorial-text font-sans text-sm font-bold uppercase tracking-widest transition-colors">← Back to Dashboard</Link>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleReject} className="px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 text-editorial-text rounded text-xs font-sans font-bold uppercase tracking-widest transition-colors">
                        Reject
                    </button>
                    <button className="px-4 py-2 bg-editorial-text text-editorial-bg hover:bg-editorial-text/90 rounded text-xs font-sans font-bold uppercase tracking-widest shadow-lg transition-colors">
                        Publish Article
                    </button>
                </div>
            </header>

            {/* Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Original Source */}
                <div className="flex-1 border-r border-editorial-text/10 p-12 overflow-y-auto bg-editorial-text/5 scrollbar-thin scrollbar-thumb-editorial-text/20">
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-8 pb-4 border-b border-editorial-text/10">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="font-sans text-xs font-bold uppercase tracking-widest text-editorial-text/50">
                                    Original Source
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
                            <span className="font-sans text-xs font-bold uppercase tracking-widest text-editorial-text">AI Rewrite Draft</span>
                            <div className="flex items-center gap-2">
                                <span className="font-sans text-xs uppercase tracking-widest text-editorial-text/50">Interest Score</span>
                                <span className="bg-editorial-text text-editorial-bg text-xs font-bold px-2 py-0.5 rounded-full font-mono">
                                    {article.interestScore}/10
                                </span>
                            </div>
                        </div>


                        {article.featureImageUrl && (
                            <div className="mb-8">
                                <div className="relative group rounded-lg overflow-hidden border border-editorial-text/10 shadow-md mb-4 bg-gray-100">
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
                                                Restore Original
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Candidates Carousel */}
                                <div className="mt-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-text/40 mb-1 block">Image Candidates</span>

                                    {article.imageCandidates && article.imageCandidates.length > 0 ? (
                                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                            {article.imageCandidates.map((url, idx) => {
                                                const isOriginal = url === article.originalImageUrl;
                                                return (
                                                    <div
                                                        key={idx}
                                                        onClick={() => handleSelectImage(url)}
                                                        className={`relative flex-shrink-0 w-24 h-24 rounded border-2 cursor-pointer overflow-hidden transition-all ${article.featureImageUrl === url ? 'border-editorial-text scale-95 opacity-100 ring-1 ring-editorial-text' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                    >
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
                                            No other candidates. Click "Search Web" or "Regenerate" to find more images.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <input
                            className="w-full bg-transparent text-4xl font-black text-editorial-text mb-8 focus:outline-none placeholder-editorial-text/30 italic leading-tight"
                            defaultValue={article.rewrittenTitle}
                        />

                        <textarea
                            className="w-full h-[calc(100vh-400px)] bg-transparent resize-none focus:outline-none text-editorial-text text-lg leading-relaxed font-serif p-0"
                            defaultValue={article.rewrittenContent}
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
