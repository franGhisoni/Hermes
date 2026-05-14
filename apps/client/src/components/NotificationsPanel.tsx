import { useEffect, useRef, useState } from 'react';
import { Bell, AlertCircle, AlertTriangle, Info, X, CheckCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Notification } from '../types';

const SOURCE_LABEL: Record<Notification['source'], string> = {
    SCRAPER: 'Scraper',
    WORKFLOW: 'Flujo',
    PUBLISH: 'Publicación',
    SYSTEM: 'Sistema'
};

function levelStyles(level: Notification['level']) {
    switch (level) {
        case 'ERROR':
            return { Icon: AlertCircle, color: 'text-red-600', border: 'border-red-600/40', dot: 'bg-red-600' };
        case 'WARN':
            return { Icon: AlertTriangle, color: 'text-amber-600', border: 'border-amber-600/40', dot: 'bg-amber-600' };
        default:
            return { Icon: Info, color: 'text-editorial-text/70', border: 'border-editorial-text/20', dot: 'bg-editorial-text/40' };
    }
}

function relativeTime(iso: string) {
    const date = new Date(iso);
    const diffMs = Date.now() - date.getTime();
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return 'recién';
    if (m < 60) return `hace ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d}d`;
    return date.toLocaleDateString();
}

export function NotificationsPanel() {
    const { token } = useAuth();
    const [items, setItems] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/api/notifications?take=50');
            setItems(res.data.items || []);
            setUnreadCount(res.data.unreadCount || 0);
        } catch (err) {
            // Silently ignore — likely auth not ready
        }
    };

    useEffect(() => {
        if (!token) return;
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 15000);
        return () => clearInterval(interval);
    }, [token]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const markRead = async (id: string) => {
        setItems(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
        setUnreadCount(c => Math.max(0, c - 1));
        try { await api.post(`/api/notifications/${id}/read`); } catch {}
    };

    const markAllRead = async () => {
        if (unreadCount === 0) return;
        const now = new Date().toISOString();
        setItems(prev => prev.map(n => n.readAt ? n : { ...n, readAt: now }));
        setUnreadCount(0);
        try { await api.post('/api/notifications/read-all'); } catch { fetchNotifications(); }
    };

    const deleteOne = async (id: string) => {
        const wasUnread = !items.find(n => n.id === id)?.readAt;
        setItems(prev => prev.filter(n => n.id !== id));
        if (wasUnread) setUnreadCount(c => Math.max(0, c - 1));
        try { await api.delete(`/api/notifications/${id}`); } catch { fetchNotifications(); }
    };

    const clearAll = async () => {
        if (items.length === 0) return;
        if (!confirm('¿Eliminar todas las notificaciones?')) return;
        setItems([]);
        setUnreadCount(0);
        try { await api.delete('/api/notifications'); } catch { fetchNotifications(); }
    };

    if (!token) return null;

    return (
        <div ref={containerRef} className="relative flex items-center h-full">
            <button
                onClick={() => setOpen(o => !o)}
                className="relative font-sans text-sm font-semibold uppercase tracking-wider hover:underline underline-offset-4 flex items-center gap-1.5 px-1"
                aria-label="Notificaciones"
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-4 bg-editorial-bg border border-editorial-text/20 shadow-xl w-[420px] max-w-[90vw] z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-editorial-text/10">
                        <div className="font-sans text-xs font-bold uppercase tracking-widest">
                            Notificaciones {unreadCount > 0 && <span className="text-red-600 ml-1">({unreadCount} nuevas)</span>}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={markAllRead}
                                disabled={unreadCount === 0}
                                title="Marcar todas como leídas"
                                className="text-editorial-text/60 hover:text-editorial-text disabled:opacity-30 disabled:hover:text-editorial-text/60 transition-colors"
                            >
                                <CheckCheck className="w-4 h-4" />
                            </button>
                            <button
                                onClick={clearAll}
                                disabled={items.length === 0}
                                title="Eliminar todas"
                                className="text-editorial-text/60 hover:text-red-600 disabled:opacity-30 disabled:hover:text-editorial-text/60 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="px-4 py-12 text-center font-sans text-sm text-editorial-text/50">
                                Sin notificaciones.
                            </div>
                        ) : (
                            <ul className="divide-y divide-editorial-text/10">
                                {items.map(n => {
                                    const { Icon, color, dot } = levelStyles(n.level);
                                    const unread = !n.readAt;
                                    return (
                                        <li
                                            key={n.id}
                                            className={`px-4 py-3 flex gap-3 group hover:bg-editorial-text/[0.03] transition-colors ${unread ? 'bg-editorial-text/[0.02]' : ''}`}
                                        >
                                            <div className="flex flex-col items-center mt-0.5">
                                                <Icon className={`w-4 h-4 ${color}`} />
                                                {unread && <span className={`w-1.5 h-1.5 rounded-full mt-2 ${dot}`} />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <div className="font-sans text-[10px] font-bold uppercase tracking-widest text-editorial-text/50">
                                                        {SOURCE_LABEL[n.source]}
                                                    </div>
                                                    <div className="font-sans text-[10px] text-editorial-text/40 whitespace-nowrap">
                                                        {relativeTime(n.createdAt)}
                                                    </div>
                                                </div>
                                                <div className={`font-serif font-bold text-sm leading-tight mt-0.5 ${unread ? 'text-editorial-text' : 'text-editorial-text/70'}`}>
                                                    {n.title}
                                                </div>
                                                <div className="font-sans text-xs text-editorial-text/70 mt-1 leading-relaxed break-words">
                                                    {n.message}
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {unread && (
                                                    <button
                                                        onClick={() => markRead(n.id)}
                                                        title="Marcar como leída"
                                                        className="text-editorial-text/40 hover:text-editorial-text transition-colors"
                                                    >
                                                        <CheckCheck className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => deleteOne(n.id)}
                                                    title="Eliminar"
                                                    className="text-editorial-text/40 hover:text-red-600 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
