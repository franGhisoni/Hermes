import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface PromptConfig {
    id: string;
    name: string;
    type: string;
    template: string;
}

export default function Settings() {
    const [prompts, setPrompts] = useState<PromptConfig[]>([]);
    const [loading, setLoading] = useState(true);

    const [scrapeLimit, setScrapeLimit] = useState(3);

    useEffect(() => {
        axios.get('http://localhost:3000/api/config/prompts')
            .then(res => {
                setPrompts(res.data);
                setLoading(false);
            });

        axios.get('http://localhost:3000/api/config/settings')
            .then(res => setScrapeLimit(res.data.scrapeLimit));
    }, []);

    const savePrompt = async (id: string, template: string) => {
        try {
            await axios.put(`http://localhost:3000/api/config/prompts/${id}`, { template });
            alert('Prompt updated!');
        } catch (e) {
            alert('Failed to save');
        }
    };

    return (
        <div className="min-h-screen bg-editorial-bg text-editorial-text font-serif">
            <nav className="border-b border-editorial-text/10 px-8 py-6 flex items-center gap-4 sticky top-0 bg-editorial-bg/95 backdrop-blur z-10">
                <img src="/logo.png" alt="Hermes Logo" className="h-10 w-auto mix-blend-multiply opacity-90" />
                <Link to="/" className="text-4xl font-black tracking-tight italic hover:opacity-80">Hermes.</Link>
                <div className="h-6 w-px bg-editorial-text/20 mx-2"></div>
                <h1 className="font-sans uppercase tracking-widest text-sm font-bold">Configuración</h1>
            </nav>

            <main className="p-8 max-w-4xl mx-auto">
                <section className="mb-12">
                    <h2 className="text-2xl font-bold mb-6 border-b-2 border-editorial-text pb-2">Personalidad & Logica</h2>
                    <p className="font-sans text-editorial-text/70 mb-8 max-w-2xl">
                        Define como la Inteligencia Artificial interpreta, reescribe y califica el contenido de las noticias.
                        Cambios aqui afectan a todo el procesamiento futuro.
                    </p>

                    {loading ? <div>Loading configuration...</div> : (
                        <div className="space-y-12">
                            {prompts.map(prompt => (
                                <div key={prompt.id} className="bg-white border border-editorial-text/10 p-8 shadow-[4px_4px_0px_0px_rgba(12,7,53,0.1)]">
                                    <div className="flex justify-between items-baseline mb-4">
                                        <h3 className="text-xl font-bold">{prompt.name}</h3>
                                        <span className="font-sans text-xs uppercase tracking-widest bg-editorial-text/5 px-2 py-1 rounded">
                                            {prompt.type}
                                        </span>
                                    </div>

                                    <div className="font-sans text-sm text-editorial-text/50 mb-2">Prompt Template</div>
                                    <textarea
                                        className="w-full h-64 p-4 font-mono text-sm bg-editorial-bg/30 border border-editorial-text/20 focus:border-editorial-text focus:outline-none resize-none leading-relaxed"
                                        defaultValue={prompt.template}
                                        onBlur={(e) => savePrompt(prompt.id, e.target.value)}
                                    />
                                    <div className="mt-2 text-right">
                                        <span className="text-xs font-sans text-editorial-text/40 italic">
                                            Click afuera de la caja para guardar automaticamente.
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-bold mb-6 border-b-2 border-editorial-text pb-2">Sistema</h2>
                    <div className="bg-white border border-editorial-text/10 p-8 shadow-[4px_4px_0px_0px_rgba(12,7,53,0.1)]">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">Limite de Scrapeo Por Seccion</h3>
                                <p className="font-sans text-sm text-editorial-text/50">Cuantos articulos traer de cada seccion (Portada, Politica, Economia, etc) por ejecucion.</p>
                            </div>
                            <div>
                                <input
                                    type="number"
                                    defaultValue={3} // Initial render, effects will update
                                    className="w-24 p-2 font-bold text-xl border-b-2 border-editorial-text/20 focus:border-editorial-text outline-none text-center"
                                    onBlur={async (e) => {
                                        await axios.post('http://localhost:3000/api/config/settings', { scrapeLimit: e.target.value });
                                    }}
                                // We'd ideally fetch and set value state, doing simple uncontrolled for speed here if consistent
                                />
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
