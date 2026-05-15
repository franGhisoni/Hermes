import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, Sparkles, Layers, SlidersHorizontal, Image as ImageIcon } from 'lucide-react';
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
    scrapeLimit: number | null;
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

type TabKey = 'prompts' | 'fuentes' | 'sistema' | 'imagenes';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { key: 'prompts', label: 'Prompts IA', icon: Sparkles },
    { key: 'fuentes', label: 'Fuentes', icon: Layers },
    { key: 'imagenes', label: 'Imágenes', icon: ImageIcon },
    { key: 'sistema', label: 'Sistema', icon: SlidersHorizontal }
];

interface ExtendedSettings {
    imagePoolSize: number;
    imageScoringMaxRetries: number;
    imagePerQueryCap: number;
    imageMinWidth: number;
    imageMinHeight: number;
    imageQueryContentChars: number;
    imageQueryMinLength: number;
    imageQueryMaxCount: number;
    imageLeadMinChars: number;
    imageLeadMaxChars: number;
    imageLeadMaxWords: number;
    imageSearchPageTimeoutMs: number;
    imageSearchSelectorTimeoutMs: number;
    imageFetchTimeoutMs: number;
    modelEmbedding: string;
    modelRewrite: string;
    modelInterest: string;
    modelImageQuery: string;
    modelImageScoring: string;
    modelImageGeneration: string;
    aiRewriteMaxTokens: number;
    aiRewriteContentChars: number;
    aiInterestMaxTokens: number;
    aiInterestContentChars: number;
    aiImageQueryMaxTokens: number;
    aiImageQueryContentChars: number;
    aiImageScoringMaxTokens: number;
    aiImageScoringContentChars: number;
    dedupThreshold: number;
    embeddingTextChars: number;
    workflowDefaultWindowHours: number;
}

export default function Settings() {
    const { user, logout } = useAuth();
    const [prompts, setPrompts] = useState<PromptConfig[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [schedules, setSchedules] = useState<ScrapeSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('fuentes');

    // Section Form State
    const [newSecName, setNewSecName] = useState('');
    const [newSecPath, setNewSecPath] = useState('');
    const [newSecLimit, setNewSecLimit] = useState('');

    // Schedule Form State
    const [newSchedSource, setNewSchedSource] = useState(AVAILABLE_SOURCES[0]);
    const [newSchedCron, setNewSchedCron] = useState(CRON_PRESETS[1].value);
    const [scrapeLimit, setScrapeLimit] = useState(3);
    const [articleRetentionHours, setArticleRetentionHours] = useState(48);
    const [articleCleanupCron, setArticleCleanupCron] = useState('0 * * * *');
    const [imageSearchQueryTemplate, setImageSearchQueryTemplate] = useState('{{query}} foto noticia');
    const [imageSearchUrlTemplate, setImageSearchUrlTemplate] = useState('https://www.bing.com/images/search?q={{q}}&qft=%2Bfilterui%3Aimagesize-large%2Bfilterui%3Aaspect-wide');
    const [imageMinScore, setImageMinScore] = useState(6);
    const [extended, setExtended] = useState<ExtendedSettings | null>(null);

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
                const d = res.data;
                setScrapeLimit(d.scrapeLimit ?? 3);
                setArticleRetentionHours(d.articleRetentionHours ?? 48);
                setArticleCleanupCron(d.articleCleanupCron ?? '0 * * * *');
                if (d.imageSearchQueryTemplate) setImageSearchQueryTemplate(d.imageSearchQueryTemplate);
                if (d.imageSearchUrlTemplate) setImageSearchUrlTemplate(d.imageSearchUrlTemplate);
                if (d.imageMinScore) setImageMinScore(d.imageMinScore);
                setExtended({
                    imagePoolSize: d.imagePoolSize,
                    imageScoringMaxRetries: d.imageScoringMaxRetries,
                    imagePerQueryCap: d.imagePerQueryCap,
                    imageMinWidth: d.imageMinWidth,
                    imageMinHeight: d.imageMinHeight,
                    imageQueryContentChars: d.imageQueryContentChars,
                    imageQueryMinLength: d.imageQueryMinLength,
                    imageQueryMaxCount: d.imageQueryMaxCount,
                    imageLeadMinChars: d.imageLeadMinChars,
                    imageLeadMaxChars: d.imageLeadMaxChars,
                    imageLeadMaxWords: d.imageLeadMaxWords,
                    imageSearchPageTimeoutMs: d.imageSearchPageTimeoutMs,
                    imageSearchSelectorTimeoutMs: d.imageSearchSelectorTimeoutMs,
                    imageFetchTimeoutMs: d.imageFetchTimeoutMs,
                    modelEmbedding: d.modelEmbedding,
                    modelRewrite: d.modelRewrite,
                    modelInterest: d.modelInterest,
                    modelImageQuery: d.modelImageQuery,
                    modelImageScoring: d.modelImageScoring,
                    modelImageGeneration: d.modelImageGeneration,
                    aiRewriteMaxTokens: d.aiRewriteMaxTokens,
                    aiRewriteContentChars: d.aiRewriteContentChars,
                    aiInterestMaxTokens: d.aiInterestMaxTokens,
                    aiInterestContentChars: d.aiInterestContentChars,
                    aiImageQueryMaxTokens: d.aiImageQueryMaxTokens,
                    aiImageQueryContentChars: d.aiImageQueryContentChars,
                    aiImageScoringMaxTokens: d.aiImageScoringMaxTokens,
                    aiImageScoringContentChars: d.aiImageScoringContentChars,
                    dedupThreshold: d.dedupThreshold,
                    embeddingTextChars: d.embeddingTextChars,
                    workflowDefaultWindowHours: d.workflowDefaultWindowHours
                });
            });
    }, []);

    const updateExtended = async <K extends keyof ExtendedSettings>(key: K, value: ExtendedSettings[K]) => {
        if (!extended) return;
        setExtended({ ...extended, [key]: value });
        try {
            await api.post('/api/config/settings', { [key]: value });
        } catch (err: any) {
            alert('Error: ' + (err.response?.data?.error || 'No se pudo guardar'));
        }
    };

    const handleCreateSection = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const parsedLimit = newSecLimit.trim() === '' ? null : parseInt(newSecLimit, 10);
            await api.post('/api/config/sections', {
                name: newSecName,
                path: newSecPath,
                scrapeLimit: parsedLimit
            });
            setNewSecName('');
            setNewSecPath('');
            setNewSecLimit('');
            fetchData();
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to create section'));
        }
    };

    const handleUpdateSectionLimit = async (sectionId: string, raw: string) => {
        try {
            const trimmed = raw.trim();
            const parsedLimit = trimmed === '' ? null : parseInt(trimmed, 10);
            await api.put(`/api/config/sections/${sectionId}`, { scrapeLimit: parsedLimit });
            fetchData();
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to update section'));
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
            <nav className="border-b border-editorial-text/10 px-8 py-6 flex justify-between items-center sticky top-0 bg-editorial-bg/95 backdrop-blur z-20">
                <div className="flex items-center gap-4">
                    <Link to="/" className="flex items-center transition-opacity hover:opacity-100 opacity-90">
                        <img src="/logo.png" alt="Logo" className="h-10 w-auto mix-blend-multiply" />
                    </Link>
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

            <div className="relative">
                {/*
                 * On lg+ the sidebar is taken out of flow (fixed at left:32px,
                 * below the sticky header) so the <main> can stay centered on
                 * the viewport. On smaller screens it falls back to a normal
                 * horizontally-scrollable strip above the content.
                 */}
                <aside className="lg:fixed lg:left-8 lg:top-[110px] lg:w-[220px] lg:z-10 px-8 lg:px-0 pt-6 lg:pt-0">
                    <nav className="flex lg:flex-col gap-2 lg:gap-1 overflow-x-auto lg:overflow-visible">
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`group flex items-center gap-3 py-3 pr-4 text-left transition-all duration-200 ease-out flex-shrink-0 ${
                                        isActive
                                            ? 'pl-4 text-editorial-text translate-x-1'
                                            : 'pl-2 text-editorial-text/30 hover:text-editorial-text/70 -translate-x-0.5 hover:translate-x-0'
                                    }`}
                                >
                                    <Icon size={isActive ? 22 : 18} />
                                    <span className={`font-serif italic transition-all duration-200 ${
                                        isActive
                                            ? 'text-3xl font-black underline decoration-2 underline-offset-4'
                                            : 'text-2xl font-bold'
                                    }`}>
                                        {tab.label}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Main panel — centered on the viewport, sidebar floats over the gutter */}
                <main className="max-w-5xl mx-auto px-8 py-10 min-w-0">
                    {activeTab === 'prompts' && (
                        <PromptsTab
                            prompts={prompts}
                            loading={loading}
                            savePrompt={savePrompt}
                        />
                    )}

                    {activeTab === 'fuentes' && (
                        <FuentesTab
                            sections={sections}
                            schedules={schedules}
                            scrapeLimit={scrapeLimit}
                            newSecName={newSecName}
                            setNewSecName={setNewSecName}
                            newSecPath={newSecPath}
                            setNewSecPath={setNewSecPath}
                            newSecLimit={newSecLimit}
                            setNewSecLimit={setNewSecLimit}
                            newSchedSource={newSchedSource}
                            setNewSchedSource={setNewSchedSource}
                            newSchedCron={newSchedCron}
                            setNewSchedCron={setNewSchedCron}
                            handleCreateSection={handleCreateSection}
                            handleUpdateSectionLimit={handleUpdateSectionLimit}
                            handleDeleteSection={handleDeleteSection}
                            handleCreateSchedule={handleCreateSchedule}
                            handleToggleSchedule={handleToggleSchedule}
                            handleDeleteSchedule={handleDeleteSchedule}
                        />
                    )}

                    {activeTab === 'imagenes' && extended && (
                        <ImagenesTab
                            imageSearchQueryTemplate={imageSearchQueryTemplate}
                            setImageSearchQueryTemplate={setImageSearchQueryTemplate}
                            imageSearchUrlTemplate={imageSearchUrlTemplate}
                            setImageSearchUrlTemplate={setImageSearchUrlTemplate}
                            imageMinScore={imageMinScore}
                            setImageMinScore={setImageMinScore}
                            extended={extended}
                            updateExtended={updateExtended}
                        />
                    )}

                    {activeTab === 'sistema' && (
                        <SistemaTab
                            scrapeLimit={scrapeLimit}
                            setScrapeLimit={setScrapeLimit}
                            articleRetentionHours={articleRetentionHours}
                            setArticleRetentionHours={setArticleRetentionHours}
                            articleCleanupCron={articleCleanupCron}
                            setArticleCleanupCron={setArticleCleanupCron}
                            extended={extended}
                            updateExtended={updateExtended}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}

// ---------- Tabs ----------

interface PromptsTabProps {
    prompts: PromptConfig[];
    loading: boolean;
    savePrompt: (id: string, template: string) => Promise<void>;
}

function PromptsTab({ prompts, loading, savePrompt }: PromptsTabProps) {
    return (
        <section>
            <Header
                title="Personalidad & Lógica"
                subtitle="Define cómo la IA interpreta, reescribe y califica el contenido. Click afuera del recuadro para guardar."
            />
            {loading ? <div>Cargando configuración...</div> : (
                <div className="space-y-6">
                    {prompts.map(prompt => (
                        <Card key={prompt.id}>
                            <div className="flex justify-between items-baseline mb-3">
                                <h3 className="text-base font-bold">{prompt.name}</h3>
                                <span className="font-sans text-[10px] uppercase tracking-widest bg-editorial-text/5 px-2 py-1 rounded">
                                    {prompt.type}
                                </span>
                            </div>
                            <textarea
                                className="w-full h-48 p-3 font-mono text-xs bg-editorial-bg/30 border border-editorial-text/20 focus:border-editorial-text focus:outline-none resize-none leading-relaxed"
                                defaultValue={prompt.template}
                                onBlur={(e) => savePrompt(prompt.id, e.target.value)}
                            />
                        </Card>
                    ))}
                </div>
            )}
        </section>
    );
}

interface FuentesTabProps {
    sections: Section[];
    schedules: ScrapeSchedule[];
    scrapeLimit: number;
    newSecName: string;
    setNewSecName: (v: string) => void;
    newSecPath: string;
    setNewSecPath: (v: string) => void;
    newSecLimit: string;
    setNewSecLimit: (v: string) => void;
    newSchedSource: string;
    setNewSchedSource: (v: string) => void;
    newSchedCron: string;
    setNewSchedCron: (v: string) => void;
    handleCreateSection: (e: React.FormEvent) => Promise<void>;
    handleUpdateSectionLimit: (id: string, raw: string) => Promise<void>;
    handleDeleteSection: (id: string) => Promise<void>;
    handleCreateSchedule: (e: React.FormEvent) => Promise<void>;
    handleToggleSchedule: (s: ScrapeSchedule) => Promise<void>;
    handleDeleteSchedule: (id: string) => Promise<void>;
}

function FuentesTab(props: FuentesTabProps) {
    const {
        sections, schedules, scrapeLimit,
        newSecName, setNewSecName, newSecPath, setNewSecPath, newSecLimit, setNewSecLimit,
        newSchedSource, setNewSchedSource, newSchedCron, setNewSchedCron,
        handleCreateSection, handleUpdateSectionLimit, handleDeleteSection,
        handleCreateSchedule, handleToggleSchedule, handleDeleteSchedule
    } = props;

    return (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sections column */}
            <div className="flex flex-col gap-4">
                <Header
                    title="Secciones"
                    subtitle="URLs específicas por medio. Disponibles al crear un Flujo."
                    dense
                />
                <Card>
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-4 font-sans">Añadir sección</h3>
                    <form onSubmit={handleCreateSection} className="grid grid-cols-2 gap-3 font-sans">
                        <input
                            type="text"
                            placeholder="Nombre (ej. Política)"
                            value={newSecName}
                            onChange={e => setNewSecName(e.target.value)}
                            required
                            className="col-span-2 border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent text-sm"
                        />
                        <input
                            type="text"
                            placeholder="Ruta (ej. /politica)"
                            value={newSecPath}
                            onChange={e => setNewSecPath(e.target.value)}
                            required
                            className="col-span-2 sm:col-span-1 border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent text-sm"
                        />
                        <input
                            type="number"
                            min="1"
                            max="100"
                            placeholder={`Límite (def. ${scrapeLimit})`}
                            value={newSecLimit}
                            onChange={e => setNewSecLimit(e.target.value)}
                            className="col-span-2 sm:col-span-1 border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent text-sm"
                            title="Cuántas notas levantar por scrapeo. Vacío = usa el global."
                        />
                        <div className="col-span-2 flex items-center justify-between mt-1">
                            <span className="text-[10px] opacity-50 italic">Vacío = global ({scrapeLimit})</span>
                            <button type="submit" className="bg-editorial-text text-editorial-bg px-4 py-1.5 font-bold uppercase tracking-widest hover:bg-black transition-colors text-[10px]">
                                Añadir
                            </button>
                        </div>
                    </form>
                </Card>

                <Card>
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-4 font-sans">
                        Secciones configuradas <span className="opacity-50">({sections.length})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {sections.map(sec => (
                            <div key={sec.id} className="group flex justify-between items-start gap-2 border border-editorial-text/10 px-3 py-2 hover:bg-editorial-text/[0.02] transition-colors">
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="font-sans font-bold text-sm truncate">{sec.name}</span>
                                    <span className="font-sans text-[10px] text-editorial-text/60 font-mono bg-black/5 px-1.5 py-0.5 mt-1 rounded w-fit max-w-full truncate">{sec.path}</span>
                                    <div className="flex items-center gap-1.5 mt-2">
                                        <label className="text-[9px] uppercase tracking-widest font-sans opacity-60">Límite:</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            defaultValue={sec.scrapeLimit ?? ''}
                                            placeholder={String(scrapeLimit)}
                                            onBlur={e => {
                                                const raw = e.target.value;
                                                const current = sec.scrapeLimit;
                                                const next = raw.trim() === '' ? null : parseInt(raw, 10);
                                                if (next !== current) handleUpdateSectionLimit(sec.id, raw);
                                            }}
                                            className="w-12 border border-editorial-text/20 px-1.5 py-0.5 text-[11px] font-mono focus:outline-none focus:border-editorial-text bg-white"
                                            title="Vacío = global"
                                        />
                                        {sec.scrapeLimit == null && (
                                            <span className="text-[9px] font-sans italic opacity-50">(global)</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteSection(sec.id)}
                                    className="opacity-0 group-hover:opacity-100 text-editorial-text/40 hover:text-red-500 transition-all mt-1"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        {sections.length === 0 && (
                            <div className="text-xs opacity-50 italic col-span-2 py-4 text-center border border-dashed border-editorial-text/20">
                                Sin secciones configuradas.
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Schedules column */}
            <div className="flex flex-col gap-4">
                <Header
                    title="Scrapeos Programados"
                    subtitle="Cada cuánto se levanta cada fuente. Aplica a todas las secciones."
                    dense
                />
                <Card>
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-4 font-sans">Nuevo schedule</h3>
                    <form onSubmit={handleCreateSchedule} className="flex flex-col gap-3 font-sans">
                        <div>
                            <label className="text-[10px] uppercase tracking-widest opacity-60 block mb-1">Fuente</label>
                            <select
                                value={newSchedSource}
                                onChange={e => setNewSchedSource(e.target.value)}
                                className="w-full border-b border-editorial-text/30 py-2 focus:outline-none focus:border-editorial-text bg-transparent cursor-pointer text-sm"
                            >
                                {AVAILABLE_SOURCES.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <CronBuilder
                            value={newSchedCron}
                            onChange={setNewSchedCron}
                            presets={CRON_PRESETS}
                            helperText="Ej: 0 8,12,15 * * 1-5 corre L-V a las 8, 12 y 15hs."
                        />
                        <div className="flex justify-end">
                            <button type="submit" className="bg-editorial-text text-editorial-bg px-4 py-1.5 font-bold uppercase tracking-widest hover:bg-black transition-colors text-[10px]">
                                Agregar
                            </button>
                        </div>
                    </form>
                </Card>

                <Card>
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-4 font-sans">
                        Activos <span className="opacity-50">({schedules.length})</span>
                    </h3>
                    <div className="space-y-2">
                        {schedules.map(sched => (
                            <div key={sched.id} className="flex items-center justify-between group border border-editorial-text/10 px-3 py-2 hover:bg-editorial-text/[0.02] transition-colors">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleToggleSchedule(sched)}
                                        className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${sched.isActive ? 'bg-green-500' : 'bg-editorial-text/20'}`}
                                    >
                                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sched.isActive ? 'left-[18px]' : 'left-0.5'}`}></span>
                                    </button>
                                    <div className="flex flex-col">
                                        <span className="font-sans font-bold text-sm">{sched.source}</span>
                                        <span className="font-sans text-[10px] text-editorial-text/60 font-mono bg-black/5 px-1.5 py-0.5 rounded w-fit mt-0.5">
                                            {CRON_PRESETS.find(p => p.value === sched.cron)?.label || sched.cron}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeleteSchedule(sched.id)}
                                    className="opacity-0 group-hover:opacity-100 text-editorial-text/40 hover:text-red-500 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        {schedules.length === 0 && (
                            <div className="text-xs opacity-50 italic py-4 text-center border border-dashed border-editorial-text/20">
                                Sin schedules activos.
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </section>
    );
}

interface SistemaTabProps {
    scrapeLimit: number;
    setScrapeLimit: (n: number) => void;
    articleRetentionHours: number;
    setArticleRetentionHours: (n: number) => void;
    articleCleanupCron: string;
    setArticleCleanupCron: (v: string) => void;
    extended: ExtendedSettings | null;
    updateExtended: <K extends keyof ExtendedSettings>(key: K, value: ExtendedSettings[K]) => Promise<void>;
}

function SistemaTab(props: SistemaTabProps) {
    const {
        scrapeLimit, setScrapeLimit,
        articleRetentionHours, setArticleRetentionHours,
        articleCleanupCron, setArticleCleanupCron,
        extended, updateExtended
    } = props;

    return (
        <section className="space-y-10">
            <div>
                <Header
                    title="Operación"
                    subtitle="Volumen de scrapeo, retención de datos y limpieza periódica."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <NumericCard
                        title="Límite global de scrapeo"
                        description="Notas por sección. Cada sección puede tener su propio override."
                        value={scrapeLimit}
                        unit=""
                        min={1}
                        onCommit={async (value) => {
                            setScrapeLimit(value);
                            await api.post('/api/config/settings', { scrapeLimit: value });
                        }}
                    />

                    <NumericCard
                        title="Retención de noticias"
                        description="Noticias más viejas que este valor se borran junto con sus imágenes huérfanas."
                        value={articleRetentionHours}
                        unit="horas"
                        min={1}
                        onCommit={async (value) => {
                            setArticleRetentionHours(value);
                            await api.post('/api/config/settings', { articleRetentionHours: value });
                        }}
                    />

                    {extended && (
                        <NumericCard
                            title="Ventana global de notas para flujos"
                            description="Default cuando un flujo no define su propia ventana. Aplica al pool de PENDING al ejecutar cada cron."
                            value={extended.workflowDefaultWindowHours}
                            unit="horas"
                            min={1}
                            onCommit={(v) => updateExtended('workflowDefaultWindowHours', v)}
                        />
                    )}

                    <Card>
                        <CardHeading
                            title="Cron de limpieza"
                            description="Cada cuánto el sistema revisa si hay noticias vencidas."
                        />
                        <CronBuilder
                            value={articleCleanupCron}
                            onChange={setArticleCleanupCron}
                            presets={[...CRON_PRESETS, { label: 'Cada 1 hora exacta', value: '0 * * * *' }]}
                            helperText="Si no trabajan fines de semana, podés usar días hábiles."
                        />
                        <div className="flex justify-end mt-3">
                            <button
                                type="button"
                                onClick={async () => {
                                    const value = articleCleanupCron.trim();
                                    setArticleCleanupCron(value);
                                    await api.post('/api/config/settings', { articleCleanupCron: value });
                                }}
                                className="bg-editorial-text text-editorial-bg px-4 py-1.5 font-bold uppercase tracking-widest hover:bg-black transition-colors text-[10px]"
                            >
                                Guardar
                            </button>
                        </div>
                    </Card>
                </div>
            </div>

            {extended && (
                <div>
                    <Header
                        title="Modelos de IA"
                        subtitle="Modelos OpenAI usados en cada paso. Tocá un valor para cambiarlo (ej. 'gpt-4o-mini', 'gpt-4o', 'text-embedding-3-small')."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <StringCard label="Embeddings (dedupe)" value={extended.modelEmbedding}
                            onCommit={(v) => updateExtended('modelEmbedding', v)} />
                        <StringCard label="Reescritura de notas" value={extended.modelRewrite}
                            onCommit={(v) => updateExtended('modelRewrite', v)} />
                        <StringCard label="Score de interés" value={extended.modelInterest}
                            onCommit={(v) => updateExtended('modelInterest', v)} />
                        <StringCard label="Smart queries de imagen" value={extended.modelImageQuery}
                            onCommit={(v) => updateExtended('modelImageQuery', v)} />
                        <StringCard label="Scoring de imagen (vision)" value={extended.modelImageScoring}
                            onCommit={(v) => updateExtended('modelImageScoring', v)} />
                        <StringCard label="Generación de imagen (fallback)" value={extended.modelImageGeneration}
                            onCommit={(v) => updateExtended('modelImageGeneration', v)} />
                    </div>
                </div>
            )}

            {extended && (
                <div>
                    <Header
                        title="Tuning de IA"
                        subtitle="Cuánto contexto entra a cada llamada y cuántos tokens puede generar el modelo."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NumericCard title="Rewrite – contexto (chars)" description="Cantidad de texto del artículo enviado al rewriter."
                            value={extended.aiRewriteContentChars} unit="chars" min={1}
                            onCommit={(v) => updateExtended('aiRewriteContentChars', v)} />
                        <NumericCard title="Rewrite – max tokens" description="Techo de tokens generados al reescribir."
                            value={extended.aiRewriteMaxTokens} unit="tokens" min={1}
                            onCommit={(v) => updateExtended('aiRewriteMaxTokens', v)} />
                        <NumericCard title="Interés – contexto (chars)" description="Texto enviado para calcular el score 1-10."
                            value={extended.aiInterestContentChars} unit="chars" min={1}
                            onCommit={(v) => updateExtended('aiInterestContentChars', v)} />
                        <NumericCard title="Interés – max tokens" description="3 alcanza para un número. No subas si no cambiás el prompt."
                            value={extended.aiInterestMaxTokens} unit="tokens" min={1}
                            onCommit={(v) => updateExtended('aiInterestMaxTokens', v)} />
                        <NumericCard title="Smart query – contexto (chars)" description="Texto enviado para generar queries de búsqueda."
                            value={extended.aiImageQueryContentChars} unit="chars" min={1}
                            onCommit={(v) => updateExtended('aiImageQueryContentChars', v)} />
                        <NumericCard title="Smart query – max tokens" description="Output JSON con queries y protagonista."
                            value={extended.aiImageQueryMaxTokens} unit="tokens" min={1}
                            onCommit={(v) => updateExtended('aiImageQueryMaxTokens', v)} />
                        <NumericCard title="Scoring – contexto (chars)" description="Texto + ranking del artículo en el batch de scoring."
                            value={extended.aiImageScoringContentChars} unit="chars" min={1}
                            onCommit={(v) => updateExtended('aiImageScoringContentChars', v)} />
                        <NumericCard title="Scoring – max tokens" description="Reasonings + scores de hasta N candidatos."
                            value={extended.aiImageScoringMaxTokens} unit="tokens" min={1}
                            onCommit={(v) => updateExtended('aiImageScoringMaxTokens', v)} />
                    </div>
                </div>
            )}

            {extended && (
                <div>
                    <Header
                        title="Procesamiento de notas"
                        subtitle="Cómo se generan embeddings y se detectan duplicados."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NumericCard title="Texto a embeber (chars)" description="Cuánto texto se usa para el embedding de dedup."
                            value={extended.embeddingTextChars} unit="chars" min={1}
                            onCommit={(v) => updateExtended('embeddingTextChars', v)} />
                        <FloatCard title="Umbral de dedup" description="Distancia coseno: más bajo = más estricto. 0.15 = ~85% similitud."
                            value={extended.dedupThreshold} unit="" min={0} max={1} step={0.01}
                            onCommit={(v) => updateExtended('dedupThreshold', v)} />
                    </div>
                </div>
            )}
        </section>
    );
}

// ---------- Imagenes Tab ----------

interface ImagenesTabProps {
    imageSearchQueryTemplate: string;
    setImageSearchQueryTemplate: (v: string) => void;
    imageSearchUrlTemplate: string;
    setImageSearchUrlTemplate: (v: string) => void;
    imageMinScore: number;
    setImageMinScore: (n: number) => void;
    extended: ExtendedSettings;
    updateExtended: <K extends keyof ExtendedSettings>(key: K, value: ExtendedSettings[K]) => Promise<void>;
}

function ImagenesTab(props: ImagenesTabProps) {
    const {
        imageSearchQueryTemplate, setImageSearchQueryTemplate,
        imageSearchUrlTemplate, setImageSearchUrlTemplate,
        imageMinScore, setImageMinScore,
        extended, updateExtended
    } = props;

    return (
        <section className="space-y-10">
            <div>
                <Header
                    title="Búsqueda"
                    subtitle="Cómo Hermes pide imágenes a Google/Bing y cuáles acepta."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                        <CardHeading
                            title="Plantilla de búsqueda"
                            description={<>Texto enviado al buscador. Usá <code className="bg-editorial-text/5 px-1">{`{{query}}`}</code> como placeholder.</>}
                        />
                        <input
                            type="text"
                            value={imageSearchQueryTemplate}
                            onChange={e => setImageSearchQueryTemplate(e.target.value)}
                            onBlur={async (e) => {
                                const value = e.target.value.trim();
                                if (!value.includes('{{query}}')) {
                                    alert('La plantilla debe contener {{query}}');
                                    return;
                                }
                                setImageSearchQueryTemplate(value);
                                try {
                                    await api.post('/api/config/settings', { imageSearchQueryTemplate: value });
                                } catch (err: any) {
                                    alert('Error: ' + (err.response?.data?.error || 'No se pudo guardar'));
                                }
                            }}
                            placeholder="{{query}} foto noticia"
                            className="w-full p-2 font-mono text-xs bg-editorial-bg/30 border border-editorial-text/20 focus:border-editorial-text focus:outline-none"
                        />
                    </Card>

                    <Card>
                        <CardHeading
                            title="URL del buscador (Bing fallback)"
                            description={<>URL completa. Usá <code className="bg-editorial-text/5 px-1">{`{{q}}`}</code> donde va la consulta URL-encoded.</>}
                        />
                        <textarea
                            value={imageSearchUrlTemplate}
                            onChange={e => setImageSearchUrlTemplate(e.target.value)}
                            onBlur={async (e) => {
                                const value = e.target.value.trim();
                                if (!value.startsWith('http') || (!value.includes('{{q}}') && !value.includes('{{query}}'))) {
                                    alert('La URL debe empezar con http y contener {{q}} o {{query}}');
                                    return;
                                }
                                setImageSearchUrlTemplate(value);
                                try {
                                    await api.post('/api/config/settings', { imageSearchUrlTemplate: value });
                                } catch (err: any) {
                                    alert('Error: ' + (err.response?.data?.error || 'No se pudo guardar'));
                                }
                            }}
                            className="w-full h-20 p-2 font-mono text-[11px] bg-editorial-bg/30 border border-editorial-text/20 focus:border-editorial-text focus:outline-none resize-none"
                        />
                    </Card>

                    <NumericCard title="Resultados por query" description="Cuántas imágenes tomamos de cada búsqueda antes del scoring."
                        value={extended.imagePerQueryCap} unit="" min={1} max={20}
                        onCommit={(v) => updateExtended('imagePerQueryCap', v)} />
                    <NumericCard title="Máx. queries por nota" description="Cuántas búsquedas distintas armamos a partir del título/contenido."
                        value={extended.imageQueryMaxCount} unit="" min={1} max={50}
                        onCommit={(v) => updateExtended('imageQueryMaxCount', v)} />
                    <NumericCard title="Largo mínimo de query" description="Queries más cortas se descartan."
                        value={extended.imageQueryMinLength} unit="chars" min={1}
                        onCommit={(v) => updateExtended('imageQueryMinLength', v)} />
                    <NumericCard title="Ancho mínimo aceptado" description="Imágenes más chicas se descartan (Bing)."
                        value={extended.imageMinWidth} unit="px" min={1}
                        onCommit={(v) => updateExtended('imageMinWidth', v)} />
                    <NumericCard title="Alto mínimo aceptado" description="Imágenes más chicas se descartan (Bing)."
                        value={extended.imageMinHeight} unit="px" min={1}
                        onCommit={(v) => updateExtended('imageMinHeight', v)} />
                    <NumericCard title="Timeout de carga de página" description="Cuánto esperar a que cargue la página de resultados."
                        value={extended.imageSearchPageTimeoutMs} unit="ms" min={1000}
                        onCommit={(v) => updateExtended('imageSearchPageTimeoutMs', v)} />
                    <NumericCard title="Timeout de selector" description="Cuánto esperar a que aparezcan los thumbnails."
                        value={extended.imageSearchSelectorTimeoutMs} unit="ms" min={100}
                        onCommit={(v) => updateExtended('imageSearchSelectorTimeoutMs', v)} />
                    <NumericCard title="Timeout de descarga" description="Para attachear imágenes externas al mail."
                        value={extended.imageFetchTimeoutMs} unit="ms" min={100}
                        onCommit={(v) => updateExtended('imageFetchTimeoutMs', v)} />
                </div>
            </div>

            <div>
                <Header
                    title="Scoring"
                    subtitle="Cómo gpt-4o elige la mejor imagen para cada nota."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <NumericCard
                        title="Puntaje mínimo"
                        description="Si ninguna candidata supera este puntaje, Hermes genera la imagen con IA."
                        value={imageMinScore}
                        unit="/ 10"
                        min={1}
                        max={10}
                        onCommit={async (value) => {
                            setImageMinScore(value);
                            try {
                                await api.post('/api/config/settings', { imageMinScore: value });
                            } catch (err: any) {
                                alert('Error: ' + (err.response?.data?.error || 'No se pudo guardar'));
                            }
                        }}
                    />
                    <NumericCard title="Tamaño del pool" description="Candidatas máximas que entran al scoring por nota."
                        value={extended.imagePoolSize} unit="" min={1} max={100}
                        onCommit={(v) => updateExtended('imagePoolSize', v)} />
                    <NumericCard title="Reintentos de scoring" description="Si OpenAI no puede descargar una imagen, descartamos y reintentamos."
                        value={extended.imageScoringMaxRetries} unit="" min={0} max={20}
                        onCommit={(v) => updateExtended('imageScoringMaxRetries', v)} />
                </div>
            </div>

            <div>
                <Header
                    title="Extracción de queries"
                    subtitle="Heurísticas internas para armar queries a partir del cuerpo del artículo."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <NumericCard title="Contenido analizado" description="Cuánto cuerpo se analiza para extraer entidades/queries."
                        value={extended.imageQueryContentChars} unit="chars" min={1}
                        onCommit={(v) => updateExtended('imageQueryContentChars', v)} />
                    <NumericCard title="Mínimo de la primera oración" description="Longitud mínima de la frase del lead que se busca."
                        value={extended.imageLeadMinChars} unit="chars" min={1}
                        onCommit={(v) => updateExtended('imageLeadMinChars', v)} />
                    <NumericCard title="Máximo de la primera oración" description="Longitud máxima del lead que se busca."
                        value={extended.imageLeadMaxChars} unit="chars" min={1}
                        onCommit={(v) => updateExtended('imageLeadMaxChars', v)} />
                    <NumericCard title="Palabras del lead a usar" description="Cuántas palabras del lead se envían como query."
                        value={extended.imageLeadMaxWords} unit="" min={1}
                        onCommit={(v) => updateExtended('imageLeadMaxWords', v)} />
                </div>
            </div>
        </section>
    );
}

// ---------- Atoms ----------

function Header({ title, subtitle, dense }: { title: string; subtitle: string; dense?: boolean }) {
    return (
        <div className={dense ? 'mb-1' : 'mb-6'}>
            <h2 className={`font-bold border-b-2 border-editorial-text pb-2 ${dense ? 'text-lg' : 'text-2xl mb-3'}`}>{title}</h2>
            {!dense && <p className="font-sans text-sm text-editorial-text/70 max-w-2xl">{subtitle}</p>}
            {dense && <p className="font-sans text-[11px] text-editorial-text/60 mt-1">{subtitle}</p>}
        </div>
    );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`bg-white border border-editorial-text/10 p-5 shadow-[2px_2px_0px_0px_rgba(12,7,53,0.08)] ${className}`}>
            {children}
        </div>
    );
}

function CardHeading({ title, description }: { title: string; description: React.ReactNode }) {
    return (
        <div className="mb-3">
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="font-sans text-[11px] text-editorial-text/60 leading-snug mt-0.5">{description}</p>
        </div>
    );
}

interface NumericCardProps {
    title: string;
    description: string;
    value: number;
    unit: string;
    min: number;
    max?: number;
    onCommit: (value: number) => Promise<void>;
}

function NumericCard({ title, description, value, unit, min, max, onCommit }: NumericCardProps) {
    return (
        <Card>
            <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold">{title}</h3>
                    <p className="font-sans text-[11px] text-editorial-text/60 leading-snug mt-0.5">{description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                        // key={value} remounts the input whenever the parent's
                        // value updates (e.g. after a save) so defaultValue
                        // re-syncs — letting the user freely type without
                        // controlled-input fights, while still committing on blur.
                        key={value}
                        type="number"
                        min={min}
                        max={max}
                        defaultValue={value}
                        className="w-20 p-1.5 font-bold text-lg border-b-2 border-editorial-text/20 focus:border-editorial-text outline-none text-center"
                        onBlur={async (e) => {
                            const raw = parseInt(e.target.value || String(min), 10);
                            const clamped = max != null
                                ? Math.min(max, Math.max(min, raw))
                                : Math.max(min, raw);
                            if (clamped !== value) await onCommit(clamped);
                        }}
                    />
                    {unit && <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-editorial-text/50">{unit}</span>}
                </div>
            </div>
        </Card>
    );
}

interface FloatCardProps {
    title: string;
    description: string;
    value: number;
    unit: string;
    min: number;
    max?: number;
    step?: number;
    onCommit: (value: number) => Promise<void>;
}

function FloatCard({ title, description, value, unit, min, max, step = 0.01, onCommit }: FloatCardProps) {
    return (
        <Card>
            <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold">{title}</h3>
                    <p className="font-sans text-[11px] text-editorial-text/60 leading-snug mt-0.5">{description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                        key={value}
                        type="number"
                        step={step}
                        min={min}
                        max={max}
                        defaultValue={value}
                        className="w-24 p-1.5 font-bold text-lg border-b-2 border-editorial-text/20 focus:border-editorial-text outline-none text-center"
                        onBlur={async (e) => {
                            const raw = parseFloat(e.target.value || String(min));
                            if (!Number.isFinite(raw)) return;
                            const clamped = max != null
                                ? Math.min(max, Math.max(min, raw))
                                : Math.max(min, raw);
                            if (clamped !== value) await onCommit(clamped);
                        }}
                    />
                    {unit && <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-editorial-text/50">{unit}</span>}
                </div>
            </div>
        </Card>
    );
}

interface StringCardProps {
    label: string;
    value: string;
    onCommit: (value: string) => Promise<void>;
}

function StringCard({ label, value, onCommit }: StringCardProps) {
    return (
        <Card>
            <h3 className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2">{label}</h3>
            <input
                key={value}
                type="text"
                defaultValue={value}
                className="w-full p-2 font-mono text-sm bg-editorial-bg/30 border border-editorial-text/20 focus:border-editorial-text focus:outline-none"
                onBlur={async (e) => {
                    const v = e.target.value.trim();
                    if (v && v !== value) await onCommit(v);
                }}
            />
        </Card>
    );
}
