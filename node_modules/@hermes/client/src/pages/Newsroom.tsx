import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import type { Article } from '../types';

export default function Newsroom() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState<Article | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        axios.get(`http://localhost:3000/api/articles/${id}`)
            .then(res => {
                setArticle(res.data);
                setLoading(false);
            });
    }, [id]);

    const handleReject = async () => {
        if (!id) return;
        if (confirm('Are you sure you want to delete this article?')) {
            try {
                await axios.delete(`http://localhost:3000/api/articles/${id}`);
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
                            <span className="block font-sans text-xs font-bold uppercase tracking-widest text-editorial-text/50 mb-2">Original Source</span>
                            <a href={article.originalUrl} target="_blank" rel="noreferrer" className="text-sm font-mono text-editorial-text/70 truncate hover:underline block cursor-pointer">
                                {article.originalUrl}
                            </a>
                        </div>

                        <h2 className="text-3xl font-black text-editorial-text mb-8 leading-tight italic">
                            {article.originalTitle}
                        </h2>

                        {article.originalImageUrl && (
                            <div className="mb-8 border border-editorial-text/10 p-2 bg-white shadow-sm rotate-1">
                                <img src={article.originalImageUrl} className="w-full grayscale opacity-90" alt="Original" />
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
