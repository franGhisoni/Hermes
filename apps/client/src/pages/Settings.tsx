import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Trash2 } from 'lucide-react';
import { ScraperControl } from '../components/ScraperControl';
import { CronBuilder } from '../components/CronBuilder';

interface PromptConfig {
    id: string;
    name: string;
    type: string;
    template: string;
}

interface Section {
    id: string;
    name: string;
    path: string;
}

interface ScrapeSchedule {
    id: string;
    source: string;
    cron: string;
    isActive: boolean;
}

const AVAILABLE_SOURCES = ['Clarin', 'LaNacion', 'Infobae', 'TN', 'NA'];

const CRON_PRESETS = [
    { label: 'Cada 1 hora', value: '0 */1 * * *' },
    { label: 'Cada 2 horas', value: '0 */2 * * *' },
    { label: 'Cada 4 horas', value: '0 */4 * * *' },
    { label: 'Cada 6 horas', value: '0 */6 * * *' },
    { label: 'Cada 12 horas', value: '0 */12 * * *' },
    { label: 'Una vez al día (8AM)', value: '0 8 * * *' },
    { label: 'Dos veces al día (8AM y 6PM)', value: '0 8,18 * * *' },
];

export default function Settings() {
    const { user, logout } = useAuth();
    const [prompts, setPrompts] = useState<PromptConfig[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [schedules, setSchedules] = useState<ScrapeSchedule[]>([]);
    const [loading, setLoading] = useState(true);

    // Section Form State
    const [newSecName, setNewSecName] = useState('');
    const [newSecPath, setNewSecPath] = useState('');

    // Schedule Form State
    const [newSchedSource, setNewSchedSource] = useState(AVAILABLE_SOURCES[0]);
    const [newSchedCron, setNewSchedCron] = useState(CRON_PRESETS[1].value);
    const [scrapeLimit, setScrapeLimit] = useState(3);
    const [articleRetentionHours, setArticleRetentionHours] = useState(48);
    const [articleCleanupCron, setArticleCleanupCron] = useState('0 * * * *');

    if (user?.role !== 'ADMIN') {
        return <div className="p-10 font-serif">No tienes permisos para ver esta página.</div>;
    }

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [promptsRes, sectionsRes, schedulesRes] = await Promise.all([
                api.get('/api/config/prompts'),
                api.get('/api/config/sections'),
                api.get('/api/scrape-schedules')
            ]);
            setPrompts(promptsRes.data);
            setSections(sectionsRes.data);
            setSchedules(schedulesRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        api.get('/api/config/settings')
            .then(res => {
                setScrapeLimit(res.data.scrapeLimit ?? 3);
                setArticleRetentionHours(res.data.articleRetentionHours ?? 48);
                setArticleCleanupCron(res.data.articleCleanupCron ?? '0 * * * *');
            });
    }, []);

    const handleCreateSection = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/config/sections', { name: newSecName, path: newSecPath });
            setNewSecName('');
            setNewSecPath('');
            fetchData();
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to create section'));
        }
    };

    const handleDeleteSection = async (id: string) => {
        if (!confirm('¿Eliminar esta sección?')) return;
        try {
            await api.delete(`/api/config/sections/${id}`);
            fetchData();
        } catch (error) {
            alert('Error deleting section');
        }
    };

    const savePrompt = async (id: string, template: string) => {
        try {
            await api.put(`/api/config/prompts/${id}`, { template });
            alert('Prompt updated!');
        } catch (e) {
            alert('Failed to save');
        }
    };

    // Scrape Schedule handlers
    const handleCreateSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/scrape-schedules', { source: newSchedSource, cron: newSchedCron });
            fetchData();
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to create schedule'));
        }
    };

    const handleToggleSchedule = async (schedule: ScrapeSchedule) => {
        try {
            await api.put(`/api/scrape-schedules/${schedule.id}`, { ...schedule, isActive: !schedule.isActive });
            fetchData();
        } catch (error) {
            alert('Error toggling schedule');
        }
    };

    const handleDeleteSchedule = async (id: string) => {
        if (!confirm('¿Eliminar este schedule?')) return;
        try {
            await api.delete(`/api/scrape-schedules/${id}`);
            fetchData();
        } catch (error) {
            alert('Error deleting schedule');
        }
    };

    return (
        <div className="min-h-screen bg-editorial-bg text-editorial-text font-serif">
            <nav className="border-b border-editorial-text/10 px-8 py-6 flex justify-between items-center sticky top-0 bg-editorial-bg/95 backdrop-blur z-10">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="Logo" className="h-10 w-auto mix-blend-multiply opacity-90" />
                    <Link to="/" className="text-4xl font-black tracking-tight italic hover:opacity-80">Editor.</Link>
                    <div className="h-6 w-px bg-editorial-text/20 mx-2"></div>
                    <h1 className="font-sans uppercase tracking-widest text-sm font-bold">Configuración</h1>
                </div>
                <div className="flex gap-4 items-center">
                    <ScraperControl />
                    <Link to="/" className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 hover:underline">Volver</Link>
                    <button onClick={logout} className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors">
                        Salir
                    </button>
                </div>
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
                    <h2 className="text-2xl font-bold mb-6 border-b-2 border-editorial-text pb-2">Secciones por Medio</h2>
                    <p className="font-sans text-editorial-text/70 mb-8 max-w-2xl">
                        Administra las URLs de las secciones específicas para cada medio (ej. Política en Clarín, Economía en La Nación).
                        Estas secciones estarán disponibles como opciones al crear un Flujo Automático.
                    </p>

                    <div className="bg-white border border-editorial-text/10 p-8 shadow-[4px_4px_0px_0px_rgba(12,7,53,0.1)] mb-8">
                        <h3 className="text-xl font-bold mb-4 font-sans uppercase tracking-widest text-sm">Añadir Nueva Sección</h3>
                        <form onSubmit={handleCreateSection} className="grid grid-cols-1 md:grid-cols-4 gap-4 font-sans">
                            <input type="text" placeholder="Nombre (ej. Política)" value={newSecName} onChange={e => setNewSecName(e.target.value)} required className="border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent md:col-span-2" />
                            <input type="text" placeholder="Ruta Global (ej. /politica)" value={newSecPath} onChange={e => setNewSecPath(e.target.value)} required className="border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent md:col-span-2" />
                            <div className="md:col-span-4 flex justify-end mt-2">
                                <button type="submit" className="bg-editorial-text text-editorial-bg px-6 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors text-xs">Añadir</button>
                            </div>
                        </form>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="border border-editorial-text/20 p-4 bg-white/50 col-span-1 md:col-span-2 lg:col-span-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {sections.map(sec => (
                                    <div key={sec.id} className="flex justify-between items-center group border-b border-editorial-text/10 pb-2">
                                        <div className="flex flex-col">
                                            <span className="font-sans font-bold text-sm">{sec.name}</span>
                                            <span className="font-sans text-xs text-editorial-text/60 font-mono bg-black/5 px-2 py-1 mt-1 rounded w-fit">{sec.path}</span>
                                        </div>
                                        <button onClick={() => handleDeleteSection(sec.id)} className="opacity-0 group-hover:opacity-100 text-editorial-text/40 hover:text-red-500 transition-all"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                                {sections.length === 0 && <div className="text-sm opacity-50 col-span-3">No hay secciones globales configuradas.</div>}
                            </div>
                        </div>
                    </div>
                </section>

                {/* SCRAPE SCHEDULES - NEW SECTION */}
                <section className="mb-12">
                    <h2 className="text-2xl font-bold mb-6 border-b-2 border-editorial-text pb-2">Scrapeos Programados</h2>
                    <p className="font-sans text-editorial-text/70 mb-8 max-w-2xl">
                        Configura cada cuánto se scrapean las fuentes de noticias. Cada schedule scrapea todas las secciones configuradas arriba automáticamente.
                    </p>

                    <div className="bg-white border border-editorial-text/10 p-8 shadow-[4px_4px_0px_0px_rgba(12,7,53,0.1)] mb-8">
                        <h3 className="text-xl font-bold mb-4 font-sans uppercase tracking-widest text-sm">Nuevo Schedule</h3>
                        <form onSubmit={handleCreateSchedule} className="grid grid-cols-1 gap-4 font-sans">
                            <select
                                value={newSchedSource}
                                onChange={e => setNewSchedSource(e.target.value)}
                                className="border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent cursor-pointer"
                            >
                                {AVAILABLE_SOURCES.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                            <CronBuilder
                                value={newSchedCron}
                                onChange={setNewSchedCron}
                                presets={CRON_PRESETS}
                                helperText="Ejemplo: 0 8,12,15 * * 1,2,3,4,5 corre lunes a viernes a las 8:00, 12:00 y 15:00."
                            />
                            <div className="flex justify-end">
                                <button type="submit" className="bg-editorial-text text-editorial-bg px-6 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors text-xs">Agregar</button>
                            </div>
                        </form>
                    </div>

                    <div className="space-y-3">
                        {schedules.map(sched => (
                            <div key={sched.id} className="bg-white border border-editorial-text/10 p-4 flex items-center justify-between group shadow-sm">
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => handleToggleSchedule(sched)}
                                        className={`w-10 h-5 rounded-full relative transition-colors ${sched.isActive ? 'bg-green-500' : 'bg-editorial-text/20'}`}
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sched.isActive ? 'left-5' : 'left-0.5'}`}></span>
                                    </button>
                                    <div>
                                        <span className="font-sans font-bold text-sm">{sched.source}</span>
                                        <span className="font-sans text-xs text-editorial-text/50 ml-3 font-mono bg-black/5 px-2 py-0.5 rounded">
                                            {CRON_PRESETS.find(p => p.value === sched.cron)?.label || sched.cron}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteSchedule(sched.id)}
                                    className="opacity-0 group-hover:opacity-100 text-editorial-text/40 hover:text-red-500 transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        {schedules.length === 0 && (
                            <div className="text-sm font-sans opacity-50 text-center py-6 border border-dashed border-editorial-text/20">
                                No hay scrapeos programados. Agregá uno arriba.
                            </div>
                        )}
                    </div>
                </section>

                <section className="mb-12">
                    <h2 className="text-2xl font-bold mb-6 border-b-2 border-editorial-text pb-2">Sistema</h2>
                    <div className="space-y-6">
                        <div className="bg-white border border-editorial-text/10 p-8 shadow-[4px_4px_0px_0px_rgba(12,7,53,0.1)]">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold">Limite de Scrapeo Por Seccion</h3>
                                    <p className="font-sans text-sm text-editorial-text/50">Cuantos articulos traer de cada seccion (Portada, Politica, Economia, etc) por ejecucion.</p>
                                </div>
                                <div>
                                    <input
                                        type="number"
                                        min={1}
                                        value={scrapeLimit}
                                        className="w-24 p-2 font-bold text-xl border-b-2 border-editorial-text/20 focus:border-editorial-text outline-none text-center"
                                        onChange={(e) => setScrapeLimit(parseInt(e.target.value || '1', 10))}
                                        onBlur={async (e) => {
                                            const value = Math.max(1, parseInt(e.target.value || '1', 10));
                                            setScrapeLimit(value);
                                            await api.post('/api/config/settings', { scrapeLimit: value });
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-editorial-text/10 p-8 shadow-[4px_4px_0px_0px_rgba(12,7,53,0.1)]">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold">Retencion de Noticias</h3>
                                    <p className="font-sans text-sm text-editorial-text/50">Las noticias con mas antiguedad que este valor se eliminan automaticamente junto con sus imagenes generadas huerfanas.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min={1}
                                        value={articleRetentionHours}
                                        className="w-24 p-2 font-bold text-xl border-b-2 border-editorial-text/20 focus:border-editorial-text outline-none text-center"
                                        onChange={(e) => setArticleRetentionHours(parseInt(e.target.value || '1', 10))}
                                        onBlur={async (e) => {
                                            const value = Math.max(1, parseInt(e.target.value || '1', 10));
                                            setArticleRetentionHours(value);
                                            await api.post('/api/config/settings', { articleRetentionHours: value });
                                        }}
                                    />
                                    <span className="font-sans text-xs font-bold uppercase tracking-widest text-editorial-text/50">horas</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-editorial-text/10 p-8 shadow-[4px_4px_0px_0px_rgba(12,7,53,0.1)]">
                            <div className="flex flex-col gap-4">
                                <div>
                                    <h3 className="text-xl font-bold">Cron de Limpieza</h3>
                                    <p className="font-sans text-sm text-editorial-text/50">Define cada cuanto el sistema revisa si hay noticias vencidas para borrar.</p>
                                </div>
                                <CronBuilder
                                    value={articleCleanupCron}
                                    onChange={setArticleCleanupCron}
                                    presets={[...CRON_PRESETS, { label: 'Cada 1 hora exacta', value: '0 * * * *' }]}
                                    helperText="Si no trabajan fines de semana, podés usar días hábiles y revisar solo de lunes a viernes."
                                />
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const value = articleCleanupCron.trim();
                                            setArticleCleanupCron(value);
                                            await api.post('/api/config/settings', { articleCleanupCron: value });
                                        }}
                                        className="bg-editorial-text text-editorial-bg px-6 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors text-xs"
                                    >
                                        Guardar Cron
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
