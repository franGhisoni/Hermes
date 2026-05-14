import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, Settings2, Mail, Pencil, X, History, Workflow as WorkflowIcon, Plus, ChevronDown } from 'lucide-react';
import { MultiSelect } from '../components/MultiSelect';
import { CronBuilder } from '../components/CronBuilder';

interface Target {
    id: string;
    name: string;
    email: string;
}

interface WorkflowRun {
    id: string;
    startedAt: string;
    status: 'SUCCESS' | 'PARTIAL' | 'EMPTY' | 'ERROR';
    targetsTotal: number;
    targetsCovered: number;
    targetsSkipped: number;
    articlesUnique: number;
    articlesRefilled: number;
    durationMs?: number | null;
    summary: string;
    errorMessage?: string | null;
}

interface WorkflowRunWithFlow extends WorkflowRun {
    workflow: { id: string; name: string };
}

interface Workflow {
    id: string;
    name: string;
    section?: string;
    sources?: string[];
    minScore?: number;
    targetCategory?: string;
    cron: string;
    isActive: boolean;
    allowRepublish?: boolean;
    targets?: Target[];
    runs?: WorkflowRun[];
}

export default function Flows() {
    const { user, logout } = useAuth();
    const [targets, setTargets] = useState<Target[]>([]);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [sections, setSections] = useState<any[]>([]);
    const [availableSources, setAvailableSources] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [runs, setRuns] = useState<WorkflowRunWithFlow[]>([]);

    // Form states
    const [targetName, setTargetName] = useState('');
    const [targetEmail, setTargetEmail] = useState('');

    const [wfName, setWfName] = useState('');
    const [wfSection, setWfSection] = useState('');
    const [wfSources, setWfSources] = useState<string[]>([]);
    const [wfMinScore, setWfMinScore] = useState<string>('');
    const [wfTargetCategory, setWfTargetCategory] = useState('');
    const [wfCron, setWfCron] = useState('0 8 * * *');
    const [wfTargetIds, setWfTargetIds] = useState<string[]>([]);
    const [wfAllowRepublish, setWfAllowRepublish] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const formRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        fetchData();
        fetchRuns();
    }, []);

    const fetchData = async () => {
        try {
            const [targetsRes, workflowsRes, sectionsRes, sourcesRes] = await Promise.all([
                api.get('/api/targets'),
                api.get('/api/workflows'),
                api.get('/api/config/sections'),
                api.get('/api/config/sources')
            ]);
            setTargets(targetsRes.data);
            setWorkflows(workflowsRes.data);
            setSections(sectionsRes.data);
            setAvailableSources(sourcesRes.data);
            if (targetsRes.data.length > 0 && wfTargetIds.length === 0) {
                setWfTargetIds([targetsRes.data[0].id]);
            }
        } catch (error) {
            console.error('Error fetching flows data', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRuns = async () => {
        try {
            const res = await api.get('/api/workflows/runs');
            setRuns(res.data);
        } catch (error) {
            console.error('Error fetching workflow runs', error);
        }
    };

    const handleCreateTarget = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/targets', { name: targetName, email: targetEmail });
            setTargetName('');
            setTargetEmail('');
            fetchData();
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to create medium'));
        }
    };

    const handleDeleteTarget = async (id: string) => {
        if (!confirm('Eliminar este medio afectará los flujos asociados. ¿Continuar?')) return;
        try {
            await api.delete(`/api/targets/${id}`);
            fetchData();
        } catch (error) {
            alert('Error deleting medium');
        }
    };

    const resetWorkflowForm = () => {
        setEditingId(null);
        setFormOpen(false);
        setWfName('');
        setWfSection('');
        setWfSources([]);
        setWfMinScore('');
        setWfTargetCategory('');
        setWfCron('0 8 * * *');
        setWfTargetIds(targets.length > 0 ? [targets[0].id] : []);
        setWfAllowRepublish(false);
    };

    const openCreateForm = () => {
        setEditingId(null);
        setFormOpen(true);
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };

    const startEditWorkflow = (wf: Workflow) => {
        setEditingId(wf.id);
        setFormOpen(true);
        setWfName(wf.name);
        setWfSection(wf.section || '');
        setWfSources(wf.sources || []);
        setWfMinScore(wf.minScore ? String(wf.minScore) : '');
        setWfTargetCategory(wf.targetCategory || '');
        setWfCron(wf.cron);
        setWfTargetIds(wf.targets?.map(t => t.id) || []);
        setWfAllowRepublish(Boolean(wf.allowRepublish));
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };

    const startEditById = (workflowId: string) => {
        const wf = workflows.find(w => w.id === workflowId);
        if (wf) startEditWorkflow(wf);
    };

    const handleSubmitWorkflow = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            name: wfName,
            section: wfSection || undefined,
            sources: wfSources,
            minScore: wfMinScore ? parseInt(wfMinScore) : undefined,
            targetCategory: wfTargetCategory || undefined,
            cron: wfCron,
            targetIds: wfTargetIds,
            allowRepublish: wfAllowRepublish
        };
        try {
            if (editingId) {
                await api.put(`/api/workflows/${editingId}`, payload);
            } else {
                await api.post('/api/workflows', payload);
            }
            resetWorkflowForm();
            fetchData();
            fetchRuns();
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to save workflow'));
        }
    };

    const handleDeleteWorkflow = async (id: string) => {
        if (!confirm('¿Eliminar este flujo programado?')) return;
        try {
            await api.delete(`/api/workflows/${id}`);
            fetchData();
        } catch (error) {
            alert('Error deleting workflow');
        }
    };

    const handleToggleWorkflow = async (wf: Workflow) => {
        try {
            await api.put(`/api/workflows/${wf.id}`, { ...wf, isActive: !wf.isActive });
            fetchData();
        } catch (error) {
            alert('Error toggling workflow');
        }
    };

    const handleToggleRepublish = async (wf: Workflow) => {
        try {
            await api.put(`/api/workflows/${wf.id}`, {
                ...wf,
                targetIds: wf.targets?.map(t => t.id),
                allowRepublish: !wf.allowRepublish
            });
            fetchData();
        } catch (error) {
            alert('Error toggling republish');
        }
    };

    if (user?.role !== 'ADMIN') {
        return <div className="p-10 font-serif">Acceso denegado.</div>;
    }

    return (
        <div className="min-h-screen bg-editorial-bg text-editorial-text font-serif pb-24">
            <header className="border-b border-editorial-text/10 px-8 py-6 flex items-center justify-between bg-editorial-bg/95 backdrop-blur z-20 sticky top-0">
                <div className="flex items-center gap-4">
                    <Link to="/" className="flex items-center transition-opacity hover:opacity-100 opacity-90">
                        <img src="/logo.png" alt="Logo" className="h-8 w-auto mix-blend-multiply" />
                    </Link>
                    <span className="text-xl font-black uppercase tracking-widest italic">Flujos y Envíos</span>
                </div>
                <div className="flex gap-4">
                    <Link to="/" className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 hover:underline">Volver al Dashboard</Link>
                    <button onClick={logout} className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors">Salir</button>
                </div>
            </header>

            <main className="max-w-[1400px] mx-auto px-8 py-8 flex flex-col gap-8">

                {/* TOP: collapsible form */}
                <div ref={formRef} className={`border bg-white/50 transition-colors ${editingId ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-editorial-text/15'}`}>
                    <button
                        type="button"
                        onClick={() => {
                            if (formOpen) resetWorkflowForm();
                            else openCreateForm();
                        }}
                        className="w-full px-6 py-4 border-b border-editorial-text/10 flex items-center gap-3 text-left hover:bg-editorial-text/[0.02] transition-colors"
                        aria-expanded={formOpen}
                    >
                        {editingId ? <Settings2 size={16} /> : <Plus size={16} />}
                        <h2 className="text-xs font-bold uppercase tracking-widest font-sans">
                            {editingId ? 'Editar flujo automático' : 'Crear flujo automático'}
                        </h2>
                        {editingId && formOpen && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); resetWorkflowForm(); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); resetWorkflowForm(); } }}
                                className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors cursor-pointer"
                                title="Cancelar edición"
                            >
                                <X size={12} /> Cancelar edición
                            </span>
                        )}
                        <ChevronDown
                            size={16}
                            className={`${editingId && formOpen ? '' : 'ml-auto'} transition-transform duration-200 ${formOpen ? 'rotate-180' : ''} opacity-60`}
                        />
                    </button>

                    {formOpen && (
                    <form onSubmit={handleSubmitWorkflow} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 p-6 font-sans">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">Nombre</label>
                            <input type="text" value={wfName} onChange={e => setWfName(e.target.value)} required className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text text-sm" placeholder="ej. Clarín Matutino" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">Destino(s)</label>
                            <MultiSelect
                                options={targets.map(t => ({ id: t.id, label: t.name }))}
                                selectedIds={wfTargetIds}
                                onChange={setWfTargetIds}
                                placeholder="Seleccionar destinos..."
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">Fuente(s) <span className="opacity-40">(opcional)</span></label>
                            <MultiSelect
                                options={availableSources.map(src => ({ id: src.name, label: src.name }))}
                                selectedIds={wfSources}
                                onChange={setWfSources}
                                placeholder="Todas..."
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">Sección <span className="opacity-40">(opcional)</span></label>
                            <select value={wfSection} onChange={e => setWfSection(e.target.value)} className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text cursor-pointer text-sm">
                                <option value="">Todas las secciones</option>
                                {sections.map(sec => (
                                    <option key={sec.id} value={sec.name}>{sec.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">Score Mínimo <span className="opacity-40">(opcional)</span></label>
                            <input
                                type="number"
                                min="1" max="10"
                                value={wfMinScore}
                                onChange={e => setWfMinScore(e.target.value)}
                                className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text text-sm"
                                placeholder="Ej. 7"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">Categoría WP <span className="opacity-40">(opcional)</span></label>
                            <input type="text" value={wfTargetCategory} onChange={e => setWfTargetCategory(e.target.value)} className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text text-sm" placeholder="ej. Política Nacional" />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60 block mb-1">Horario (Cron)</label>
                            <CronBuilder
                                value={wfCron}
                                onChange={setWfCron}
                                helperText="Ejemplo: 0 8,12,15 * * 1-5 publica L-V a las 8, 12 y 15hs."
                            />
                        </div>

                        <div className="md:col-span-2 lg:col-span-4">
                            <label className="flex items-start gap-3 cursor-pointer select-none border border-editorial-text/15 p-3 hover:bg-editorial-text/5 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={wfAllowRepublish}
                                    onChange={e => setWfAllowRepublish(e.target.checked)}
                                    className="mt-1 cursor-pointer"
                                />
                                <span className="flex-1">
                                    <span className="block text-xs font-bold uppercase tracking-widest">Permitir republicar para rellenar</span>
                                    <span className="block text-[11px] opacity-60 mt-1 leading-snug">
                                        Si hay menos notas que destinos, los destinos faltantes reciben republicaciones con reescritura e imagen nuevas. Desactivado: los destinos sobrantes se omiten y se loguean.
                                    </span>
                                </span>
                            </label>
                        </div>

                        <div className="md:col-span-2 lg:col-span-4 flex justify-end gap-3 mt-1">
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={resetWorkflowForm}
                                    className="px-5 py-2 border border-editorial-text/20 font-bold uppercase tracking-widest text-xs hover:bg-editorial-text/5 transition-colors"
                                >
                                    Cancelar
                                </button>
                            )}
                            <button type="submit" disabled={targets.length === 0} className="bg-editorial-text text-editorial-bg px-6 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50 text-xs">
                                {editingId ? 'Guardar Cambios' : 'Guardar Flujo'}
                            </button>
                        </div>
                    </form>
                    )}
                </div>

                {/* BOTTOM: 3 columns */}
                <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-6">

                    {/* Medios column */}
                    <section className="flex flex-col gap-3">
                        <ColumnHeader icon={Mail} label="Medios" count={targets.length} />
                        <div className="bg-white border border-editorial-text/15 p-4">
                            <form onSubmit={handleCreateTarget} className="flex flex-col gap-2 font-sans mb-4 pb-4 border-b border-editorial-text/10">
                                <input
                                    type="text" placeholder="Nombre" value={targetName} onChange={e => setTargetName(e.target.value)} required
                                    className="w-full border-b border-editorial-text/30 bg-transparent py-1.5 focus:outline-none focus:border-editorial-text text-sm"
                                />
                                <input
                                    type="email" placeholder="Email" value={targetEmail} onChange={e => setTargetEmail(e.target.value)} required
                                    className="w-full border-b border-editorial-text/30 bg-transparent py-1.5 focus:outline-none focus:border-editorial-text text-sm"
                                />
                                <button type="submit" className="bg-editorial-text text-editorial-bg px-3 py-1.5 font-bold uppercase tracking-widest hover:bg-black transition-colors text-[10px] mt-1">
                                    Añadir
                                </button>
                            </form>

                            <div className="flex flex-col gap-1.5">
                                {targets.map(t => (
                                    <div key={t.id} className="flex justify-between items-start p-2 bg-editorial-text/5 text-sm font-sans group hover:bg-editorial-text/10 transition-colors">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold text-xs truncate">{t.name}</div>
                                            <div className="text-[10px] opacity-60 truncate">{t.email}</div>
                                        </div>
                                        <button onClick={() => handleDeleteTarget(t.id)} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all ml-2 flex-shrink-0">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                                {targets.length === 0 && (
                                    <div className="text-[10px] opacity-50 italic py-3 text-center">Sin medios.</div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Flujos Activos column (center, widest) */}
                    <section className="flex flex-col gap-3 min-w-0">
                        <ColumnHeader icon={WorkflowIcon} label="Flujos Activos" count={workflows.length} />
                        {loading ? (
                            <div className="animate-pulse text-sm font-sans">Cargando...</div>
                        ) : workflows.length === 0 ? (
                            <div className="text-center p-8 opacity-40 font-sans text-sm border border-dashed border-editorial-text/20">
                                No hay flujos configurados.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {workflows.map(wf => (
                                    <FlowCard
                                        key={wf.id}
                                        wf={wf}
                                        isEditing={editingId === wf.id}
                                        onToggleRepublish={() => handleToggleRepublish(wf)}
                                        onTogglePause={() => handleToggleWorkflow(wf)}
                                        onEdit={() => startEditWorkflow(wf)}
                                        onDelete={() => handleDeleteWorkflow(wf.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Historial column */}
                    <section className="flex flex-col gap-3 min-w-0">
                        <ColumnHeader icon={History} label="Historial" count={runs.length} onRefresh={fetchRuns} />
                        {runs.length === 0 ? (
                            <div className="text-[11px] font-sans opacity-50 italic py-6 text-center border border-dashed border-editorial-text/20">
                                Sin ejecuciones aún.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5 max-h-[700px] overflow-y-auto pr-1">
                                {runs.map(run => (
                                    <RunRow key={run.id} run={run} onSelectFlow={startEditById} />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}

// ---------- Sub-components ----------

interface FlowCardProps {
    wf: Workflow;
    isEditing: boolean;
    onToggleRepublish: () => void;
    onTogglePause: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

function FlowCard({ wf, isEditing, onToggleRepublish, onTogglePause, onEdit, onDelete }: FlowCardProps) {
    const lastRun = wf.runs?.[0];
    const runColor = !lastRun ? 'border-editorial-text/10 text-editorial-text/40'
        : lastRun.status === 'SUCCESS' ? 'border-green-700/20 text-green-800 bg-green-50/40'
        : lastRun.status === 'PARTIAL' ? 'border-amber-700/30 text-amber-800 bg-amber-50/40'
        : lastRun.status === 'EMPTY' ? 'border-editorial-text/10 text-editorial-text/50 bg-editorial-text/[0.02]'
        : 'border-red-700/30 text-red-800 bg-red-50/40';

    return (
        <div className={`border border-editorial-text/10 p-4 flex flex-col gap-2 transition-opacity ${wf.isActive ? 'bg-white/40' : 'opacity-50 grayscale'} ${isEditing ? 'ring-2 ring-amber-500/30' : ''}`}>
            <div className="flex items-baseline gap-2 flex-wrap">
                <h3 className="font-bold text-base font-sans">{wf.name}</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-editorial-text/10 rounded">{wf.cron}</span>
                {wf.allowRepublish && (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded" title="Republica para rellenar destinos">
                        Republica
                    </span>
                )}
            </div>

            <div className="text-xs font-sans opacity-70 flex flex-wrap gap-1.5">
                {wf.section && <span className="font-mono bg-editorial-text/5 px-1.5 py-0.5 rounded border border-editorial-text/10" title="Sección">{wf.section}</span>}
                {!wf.section && <span className="italic opacity-50 px-1.5 py-0.5">Cualquier Sección</span>}
                {wf.sources && wf.sources.length > 0 && <span className="font-mono bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-900/10 text-blue-900" title="Fuentes">{wf.sources.join(', ')}</span>}
                {wf.minScore && <span className="font-mono bg-amber-50/50 px-1.5 py-0.5 rounded border border-amber-900/10 text-amber-900" title="Score Mínimo">★ {wf.minScore}+</span>}
            </div>

            <div className="text-xs font-sans text-editorial-text/60 flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="opacity-70">Destinos:</span>
                {wf.targets?.map(t => (
                    <strong key={t.id} className="font-bold">{t.name}</strong>
                ))}
            </div>

            <div className={`text-[11px] font-sans px-2.5 py-1.5 border ${runColor} flex flex-wrap gap-2 items-baseline`}>
                <span className="font-bold uppercase tracking-widest text-[10px]">Última:</span>
                {lastRun ? (
                    <>
                        <span>{lastRun.summary}</span>
                        <span className="opacity-50">· {new Date(lastRun.startedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        {lastRun.errorMessage && <span className="text-red-700 opacity-80">· {lastRun.errorMessage}</span>}
                    </>
                ) : (
                    <span className="opacity-60 italic">Aún no se ejecutó.</span>
                )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-editorial-text/5 flex-wrap">
                <button
                    onClick={onToggleRepublish}
                    className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 border transition-colors ${wf.allowRepublish ? 'border-purple-300 text-purple-800 bg-purple-50 hover:bg-purple-100' : 'border-editorial-text/20 text-editorial-text/60 hover:bg-editorial-text/5'}`}
                    title="Permitir republicar para rellenar destinos faltantes"
                >
                    {wf.allowRepublish ? 'Republica ✓' : 'Republica ✗'}
                </button>
                <button
                    onClick={onTogglePause}
                    className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 border transition-colors ${wf.isActive ? 'border-editorial-text/20 text-editorial-text hover:bg-editorial-text/5' : 'border-green-500 text-green-700 bg-green-50 hover:bg-green-100'}`}
                >
                    {wf.isActive ? 'Pausar' : 'Activar'}
                </button>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={onEdit}
                        className={`p-1.5 border transition-colors ${isEditing ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-editorial-text/20 text-editorial-text/60 hover:bg-editorial-text/5'}`}
                        title="Editar flujo"
                    >
                        <Pencil size={13} />
                    </button>
                    <button onClick={onDelete} className="text-editorial-text/30 hover:text-red-500 transition-colors">
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function RunRow({ run, onSelectFlow }: { run: WorkflowRunWithFlow; onSelectFlow: (id: string) => void }) {
    const palette =
        run.status === 'SUCCESS' ? { bar: 'bg-green-600', text: 'text-green-800' }
        : run.status === 'PARTIAL' ? { bar: 'bg-amber-500', text: 'text-amber-800' }
        : run.status === 'EMPTY' ? { bar: 'bg-editorial-text/30', text: 'text-editorial-text/60' }
        : { bar: 'bg-red-600', text: 'text-red-800' };

    return (
        <div className="flex items-stretch border border-editorial-text/10 bg-white/40 hover:bg-white/80 transition-colors group">
            <div className={`w-1 ${palette.bar} flex-shrink-0`} />
            <div className="flex-1 px-3 py-2 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <button
                        onClick={() => onSelectFlow(run.workflow.id)}
                        className="font-bold text-xs font-sans hover:underline truncate text-left"
                        title="Editar este flujo"
                    >
                        {run.workflow.name}
                    </button>
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${palette.text}`}>{run.status}</span>
                </div>
                <div className="text-[11px] font-sans mt-0.5 opacity-80 leading-snug">{run.summary}</div>
                <div className="text-[10px] font-sans opacity-50 mt-0.5">
                    {new Date(run.startedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
                {run.errorMessage && (
                    <div className="text-[10px] font-sans mt-1 text-red-700 opacity-90 leading-snug">⚠ {run.errorMessage}</div>
                )}
            </div>
        </div>
    );
}

interface ColumnHeaderProps {
    icon: React.ComponentType<{ size?: number }>;
    label: string;
    count: number;
    onRefresh?: () => void;
}

function ColumnHeader({ icon: Icon, label, count, onRefresh }: ColumnHeaderProps) {
    return (
        <div className="flex items-center gap-2 px-1 pb-2 border-b border-editorial-text/10">
            <Icon size={16} />
            <h2 className="text-sm font-bold uppercase tracking-widest font-sans">{label}</h2>
            <span className="text-[10px] font-sans opacity-50">({count})</span>
            {onRefresh && (
                <button
                    onClick={onRefresh}
                    className="ml-auto text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border border-editorial-text/20 text-editorial-text/60 hover:bg-editorial-text/5 transition-colors"
                >
                    Refrescar
                </button>
            )}
        </div>
    );
}
