import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Lightbulb, Check } from 'lucide-react';
import { EditorialActions } from '../components/EditorialActions';

interface Report { id: string; kind: 'ERROR' | 'SUGGESTION'; message: string; articleUrl?: string | null; status: string; createdAt: string; user: { username: string } }

export default function Reports() {
    const { user } = useAuth();
    const [reports, setReports] = useState<Report[]>([]);
    const [error, setError] = useState('');
    const load = async () => {
        try {
            const reportResponse = await api.get('/api/feedback');
            setReports(reportResponse.data);
        } catch { setError('No se pudieron cargar los reportes.'); }
    };
    useEffect(() => { if (user?.role === 'ADMIN') void Promise.resolve().then(load); }, [user?.role]);
    if (user?.role !== 'ADMIN') return <p className="p-8">Sin permiso.</p>;

    const updateReport = async (report: Report) => {
        try {
            await api.patch(`/api/feedback/${report.id}`, { status: report.status === 'OPEN' ? 'RESOLVED' : 'OPEN' });
            await load();
        } catch { alert('No se pudo actualizar el reporte.'); }
    };

    const openCount = reports.filter(report => report.status === 'OPEN').length;
    return <div className="min-h-screen bg-editorial-bg text-editorial-text font-sans">
        <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-editorial-text/10 px-4 py-4 sm:px-8">
            <Link to="/" className="flex items-center gap-3"><img src="/logo%20hermes.png" alt="Hermes" className="h-10 w-auto" /><span className="border-l border-editorial-text/20 pl-3 text-xs font-bold uppercase tracking-widest">Reportes</span></Link>
            <div className="flex flex-wrap items-center gap-3"><EditorialActions /><Link to="/" className="border border-editorial-text/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-editorial-text/70 transition-colors hover:bg-editorial-text hover:text-editorial-bg">← Noticias</Link></div>
        </nav>
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-editorial-text/20 pb-6">
                <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-editorial-text/45">Participación de usuarios</p><h1 className="font-serif text-4xl font-black italic">Errores y sugerencias</h1></div>
                <span className="border border-editorial-text/20 px-3 py-2 text-xs font-bold uppercase tracking-wider">{openCount} pendientes</span>
            </div>
            {error && <p role="alert" className="mb-5 border-l-2 border-red-700 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {reports.length === 0 ? <p className="border border-dashed border-editorial-text/20 p-10 text-center text-sm text-editorial-text/55">Todavía no hay reportes.</p> : <section className="space-y-3" aria-label="Reportes recibidos">
                {reports.map(report => <article key={report.id} className="border border-editorial-text/15 bg-white/70 p-5 sm:p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                            {report.kind === 'ERROR' ? <AlertCircle size={15} className="text-red-700" /> : <Lightbulb size={15} className="text-amber-700" />}
                            <span>{report.kind === 'ERROR' ? 'Error' : 'Sugerencia'}</span><span className="text-editorial-text/35">·</span><span className="text-editorial-text/55">{report.user.username}</span>
                        </div>
                        <span className="text-xs text-editorial-text/45">{new Date(report.createdAt).toLocaleString('es-AR')}</span>
                    </div>
                    <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{report.message}</p>
                    {report.articleUrl && <a href={report.articleUrl} target="_blank" rel="noreferrer" className="mt-4 block break-all text-xs text-editorial-text/60 underline underline-offset-2 hover:text-editorial-text">{report.articleUrl}</a>}
                    <div className="mt-5 flex items-center justify-between border-t border-editorial-text/10 pt-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${report.status === 'OPEN' ? 'text-amber-700' : 'text-emerald-700'}`}>{report.status === 'OPEN' ? 'Pendiente' : <><Check size={13} /> Resuelto</>}</span>
                        <button type="button" className="border border-editorial-text/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-editorial-text hover:text-editorial-bg" onClick={() => updateReport(report)}>{report.status === 'OPEN' ? 'Marcar resuelto' : 'Reabrir'}</button>
                    </div>
                </article>)}
            </section>}
        </main>
    </div>;
}
