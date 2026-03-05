import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, Settings2, Mail, Clock } from 'lucide-react';

interface Target {
    id: string;
    name: string;
    email: string;
}

interface Workflow {
    id: string;
    name: string;
    section?: string;
    targetCategory?: string;
    cron: string;
    isActive: boolean;
    targetId: string;
    target?: Target;
}

export default function Flows() {
    const { user, logout } = useAuth();
    const [targets, setTargets] = useState<Target[]>([]);
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [sections, setSections] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form states
    const [targetName, setTargetName] = useState('');
    const [targetEmail, setTargetEmail] = useState('');

    const [wfName, setWfName] = useState('');
    const [wfSection, setWfSection] = useState('');
    const [wfTargetCategory, setWfTargetCategory] = useState('');
    const [wfCron, setWfCron] = useState('0 8 * * *'); // Default 8 AM
    const [wfTargetId, setWfTargetId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [targetsRes, workflowsRes, sectionsRes] = await Promise.all([
                api.get('/api/targets'),
                api.get('/api/workflows'),
                api.get('/api/config/sections')
            ]);
            setTargets(targetsRes.data);
            setWorkflows(workflowsRes.data);
            setSections(sectionsRes.data);
            if (targetsRes.data.length > 0 && !wfTargetId) {
                setWfTargetId(targetsRes.data[0].id);
            }
        } catch (error) {
            console.error('Error fetching flows data', error);
        } finally {
            setLoading(false);
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

    const handleCreateWorkflow = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/workflows', {
                name: wfName,
                section: wfSection || undefined,
                targetCategory: wfTargetCategory || undefined,
                cron: wfCron,
                targetId: wfTargetId
            });
            setWfName('');
            setWfTargetCategory('');
            fetchData();
        } catch (error: any) {
            alert('Error: ' + (error.response?.data?.error || 'Failed to create workflow'));
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

    if (user?.role !== 'ADMIN') {
        return <div className="p-10 font-serif">Acceso denegado.</div>;
    }

    return (
        <div className="min-h-screen bg-editorial-bg text-editorial-text font-serif">
            <header className="border-b border-editorial-text/10 px-8 py-6 flex items-center justify-between bg-editorial-bg/95 backdrop-blur z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="Logo" className="h-8 w-auto mix-blend-multiply opacity-90" />
                    <span className="text-xl font-black uppercase tracking-widest italic">Flujos y Envíos</span>
                </div>
                <div className="flex gap-4">
                    <Link to="/" className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 hover:underline">Volver al Dashboard</Link>
                    <button onClick={logout} className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors">Salir</button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto p-12 grid grid-cols-1 lg:grid-cols-3 gap-12">

                {/* Targets Sidebar */}
                <div className="lg:col-span-1 flex flex-col gap-8">
                    <div className="border border-editorial-text/20 p-6 bg-white/50">
                        <h2 className="text-lg font-bold uppercase tracking-widest mb-4 font-sans flex items-center gap-2"><Mail size={18} /> Medios (Destinos)</h2>
                        <form onSubmit={handleCreateTarget} className="flex flex-col gap-4 font-sans mb-6">
                            <input
                                type="text" placeholder="Nombre (ej. Redacción Central)" value={targetName} onChange={e => setTargetName(e.target.value)} required
                                className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text text-sm"
                            />
                            <input
                                type="email" placeholder="Email destino" value={targetEmail} onChange={e => setTargetEmail(e.target.value)} required
                                className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text text-sm"
                            />
                            <button type="submit" className="bg-editorial-text text-editorial-bg px-4 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors text-xs mt-2">
                                Añadir Medio
                            </button>
                        </form>

                        <div className="flex flex-col gap-3">
                            {targets.map(t => (
                                <div key={t.id} className="flex justify-between items-start p-3 bg-editorial-text/5 text-sm font-sans">
                                    <div>
                                        <div className="font-bold">{t.name}</div>
                                        <div className="text-xs opacity-60">{t.email}</div>
                                    </div>
                                    <button onClick={() => handleDeleteTarget(t.id)} className="opacity-30 hover:opacity-100 hover:text-red-500 transition-opacity"><Trash2 size={14} /></button>
                                </div>
                            ))}
                            {targets.length === 0 && <div className="text-xs opacity-50 font-sans">No hay medios configurados.</div>}
                        </div>
                    </div>
                </div>

                {/* Workflows Main */}
                <div className="lg:col-span-2 flex flex-col gap-8">
                    <div className="border border-editorial-text/20 p-8 bg-white/50">
                        <h2 className="text-lg font-bold uppercase tracking-widest mb-6 font-sans flex items-center gap-2"><Settings2 size={18} /> Crear Flujo Automático</h2>

                        <form onSubmit={handleCreateWorkflow} className="grid grid-cols-2 gap-6 font-sans">
                            <div className="col-span-2 md:col-span-1">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60 block mb-2">Nombre del Flujo</label>
                                <input type="text" value={wfName} onChange={e => setWfName(e.target.value)} required className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text" placeholder="ej. Clarín Matutino" />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60 block mb-2">Destino (Medio)</label>
                                <select value={wfTargetId} onChange={e => setWfTargetId(e.target.value)} required className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text cursor-pointer">
                                    <option value="" disabled>Seleccione un medio...</option>
                                    {targets.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60 block mb-2">Filtrar por Sección <span className="opacity-40">(opcional)</span></label>
                                <select value={wfSection} onChange={e => setWfSection(e.target.value)} className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text cursor-pointer">
                                    <option value="">Todas las secciones</option>
                                    {sections.map(sec => (
                                        <option key={sec.id} value={sec.name}>{sec.name}</option>
                                    ))}
                                </select>
                                <span className="text-[10px] opacity-40 italic mt-1 block">Solo publicará artículos de esta sección. Vacío = todas.</span>
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60 block mb-2">Categoría Destino <span className="opacity-40">(opcional)</span></label>
                                <input type="text" value={wfTargetCategory} onChange={e => setWfTargetCategory(e.target.value)} className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text text-sm" placeholder="ej. Política Nacional" />
                                <span className="text-[10px] opacity-40 italic mt-1 block">Nombre de la categoría en WordPress. Si se deja vacío, usa el nombre de la sección.</span>
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60 block mb-2">Horario (Cron)</label>
                                <input type="text" value={wfCron} onChange={e => setWfCron(e.target.value)} required className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text font-mono text-sm" placeholder="* * * * *" />
                                <span className="text-[10px] opacity-40 italic mt-1 block">Minuto Hora Dia Mes DiaSemana (ej. 0 8 * * * = 8:00 AM)</span>
                            </div>

                            <div className="col-span-2 mt-4 flex justify-end">
                                <button type="submit" disabled={targets.length === 0} className="bg-editorial-text text-editorial-bg px-8 py-3 font-bold uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50">
                                    Guardar Flujo
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="border border-editorial-text/10 p-8">
                        <h2 className="text-lg font-bold uppercase tracking-widest mb-6 font-sans flex items-center gap-2"><Clock size={18} /> Flujos Activos</h2>

                        {loading ? <div className="animate-pulse">Cargando...</div> : (
                            <div className="flex flex-col gap-4">
                                {workflows.map(wf => (
                                    <div key={wf.id} className={`border border-editorial-text/10 p-5 flex justify-between items-center transition-opacity ${wf.isActive ? 'bg-white/40' : 'opacity-50 grayscale'}`}>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-3">
                                                <h3 className="font-bold text-lg font-sans">{wf.name}</h3>
                                                <span className="text-[10px] font-mono px-2 py-0.5 bg-editorial-text/10 rounded">{wf.cron}</span>
                                            </div>
                                            <div className="text-xs font-sans opacity-70 flex gap-2">
                                                {wf.section && <span className="font-mono bg-editorial-text/5 px-1.5 py-0.5 rounded">{wf.section}</span>}
                                                {!wf.section && <span className="italic opacity-50">Todas las secciones</span>}
                                            </div>
                                            <div className="text-xs font-sans text-editorial-text/50 mt-2">
                                                Destino: <strong>{wf.target?.name}</strong> ({wf.target?.email})
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={() => handleToggleWorkflow(wf)}
                                                className={`text-xs font-bold uppercase tracking-widest px-3 py-1 border transition-colors ${wf.isActive ? 'border-editorial-text/20 text-editorial-text hover:bg-editorial-text/5' : 'border-green-500 text-green-700 bg-green-50 hover:bg-green-100'}`}
                                            >
                                                {wf.isActive ? 'Pausar' : 'Activar'}
                                            </button>
                                            <button onClick={() => handleDeleteWorkflow(wf.id)} className="text-editorial-text/30 hover:text-red-500 transition-colors">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {workflows.length === 0 && <div className="text-center p-8 opacity-40 font-sans text-sm border border-dashed border-editorial-text/20">No hay flujos configurados.</div>}
                            </div>
                        )}
                    </div>
                </div>

            </main>
        </div>
    );
}
