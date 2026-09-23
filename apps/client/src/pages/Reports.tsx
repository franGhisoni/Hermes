import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface Report { id: string; kind: 'ERROR' | 'SUGGESTION'; message: string; articleUrl?: string | null; status: string; createdAt: string; user: { username: string } }
interface Preference { id: string; instruction: string; active: boolean; createdAt: string; user: { username: string } }

export default function Reports() {
    const { user } = useAuth();
    const [reports, setReports] = useState<Report[]>([]);
    const [preferences, setPreferences] = useState<Preference[]>([]);
    const [masterPrompt, setMasterPrompt] = useState('');
    const [error, setError] = useState('');
    const load = async () => {
        try {
            const [reportResponse, preferenceResponse, promptResponse] = await Promise.all([
                api.get('/api/feedback'), api.get('/api/rewrite-preferences/all'), api.get('/api/config/prompts')
            ]);
            setReports(reportResponse.data);
            setPreferences(preferenceResponse.data);
            setMasterPrompt(promptResponse.data.find((prompt: { type: string }) => prompt.type === 'REWRITE_VORKNEWS')?.template || '');
        } catch { setError('No se pudieron cargar los reportes y ajustes.'); }
    };
    useEffect(() => { if (user?.role === 'ADMIN') void Promise.resolve().then(load); }, [user?.role]);
    if (user?.role !== 'ADMIN') return <p className="p-8">Sin permiso.</p>;

    const copyForMerge = async () => {
        if (!masterPrompt) return alert('No se encontró la master prompt de Vorknews. Revisá Configuración → Prompts IA.');
        const instructions = preferences.filter(item => item.active).map(item => `- ${item.instruction} (${item.user.username})`).join('\n');
        try {
            await navigator.clipboard.writeText(`PROMPT ACTUAL:\n${masterPrompt}\n\nAJUSTES CONFIRMADOS:\n${instructions}`);
            alert('Prompt y ajustes copiados. Revisá el resultado antes de pegar el prompt compactado en Configuración.');
        } catch { alert('No se pudo copiar al portapapeles.'); }
    };

    const updateReport = async (report: Report) => {
        try {
            await api.patch(`/api/feedback/${report.id}`, { status: report.status === 'OPEN' ? 'RESOLVED' : 'OPEN' });
            await load();
        } catch { alert('No se pudo actualizar el reporte.'); }
    };

    const togglePreference = async (item: Preference) => {
        try {
            await api.patch(`/api/rewrite-preferences/${item.id}`, { active: !item.active });
            await load();
        } catch { alert('No se pudo actualizar el ajuste.'); }
    };

    return <main className="min-h-screen bg-editorial-bg text-editorial-text p-8 font-sans">
        <div className="max-w-5xl mx-auto space-y-8">
            <Link to="/" className="underline text-sm">← Volver al dashboard</Link>
            <h1 className="font-serif text-3xl font-bold">Reportes y aprendizaje</h1>
            {error && <p role="alert">{error}</p>}
            <section className="space-y-3">
                <h2 className="font-serif text-2xl font-bold">Errores y sugerencias</h2>
                {reports.length === 0 && <p>No hay reportes.</p>}
                {reports.map(report => <div key={report.id} className="border bg-white p-4 space-y-2">
                    <div className="text-xs font-bold uppercase">{report.kind === 'ERROR' ? 'Error' : 'Sugerencia'} · {report.user.username} · {new Date(report.createdAt).toLocaleString('es-AR')}</div>
                    <p className="whitespace-pre-wrap">{report.message}</p>
                    {report.articleUrl && <a href={report.articleUrl} target="_blank" rel="noreferrer" className="underline break-all text-sm">{report.articleUrl}</a>}
                    <div><button type="button" className="border px-3 py-1 text-xs" onClick={() => updateReport(report)}>{report.status === 'OPEN' ? 'Marcar resuelto' : 'Reabrir'}</button></div>
                </div>)}
            </section>
            <section className="space-y-3">
                <div className="flex justify-between items-center gap-4"><h2 className="font-serif text-2xl font-bold">Ajustes de reescritura</h2><button type="button" onClick={copyForMerge} className="border px-4 py-2 text-sm">Copiar prompt y ajustes</button></div>
                <p className="text-sm opacity-70">La compactación se hace manualmente. El prompt resultante se pega en Configuración → Prompts IA.</p>
                {preferences.map(item => <div key={item.id} className="border bg-white p-3 flex justify-between gap-4 text-sm">
                    <span>{item.instruction} <small className="opacity-60">· {item.user.username}</small></span>
                    <button type="button" className="underline shrink-0" onClick={() => togglePreference(item)}>{item.active ? 'Desactivar' : 'Activar'}</button>
                </div>)}
            </section>
        </div>
    </main>;
}
