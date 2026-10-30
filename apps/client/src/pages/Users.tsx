import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, KeyRound } from 'lucide-react';
import { usePageTitle } from '../lib/a11y';

interface UserData {
    id: string;
    username: string;
    role: string;
    createdAt: string;
}

export default function Users() {
    const { user, logout } = useAuth();
    usePageTitle('Usuarios');
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);

    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'EDITOR' | 'DEMO'>('EDITOR');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await api.get('/api/users');
            setUsers(res.data);
        } catch (error: any) {
            alert('Error fetching users: ' + (error.response?.data?.error || ''));
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/api/users', { username: newUsername, password: newPassword, role: newRole });
            setNewUsername('');
            setNewPassword('');
            setNewRole('EDITOR');
            fetchUsers();
            alert('Usuario creado correctamente');
        } catch (error: any) {
            alert('Error creando usuario: ' + (error.response?.data?.error || ''));
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar este usuario?')) return;
        try {
            await api.delete(`/api/users/${id}`);
            fetchUsers();
        } catch (error: any) {
            alert('No se pudo eliminar: ' + (error.response?.data?.error || ''));
        }
    };

    const handleChangePassword = async (id: string, username: string) => {
        const password = prompt(`Escriba la nueva contraseña para el usuario '${username}':`);
        if (!password) return;

        try {
            await api.put(`/api/users/${id}/password`, { password });
            alert('Contraseña actualizada correctamente para ' + username);
        } catch (error: any) {
            alert('Error actualizando la contraseña: ' + (error.response?.data?.error || ''));
        }
    };

    if (user?.role !== 'ADMIN') {
        return <div className="p-10 font-serif">No tienes permisos para ver esta página.</div>;
    }

    return (
        <div className="min-h-screen bg-editorial-bg text-editorial-text font-serif">
            {/* Header */}
            <header className="border-b border-editorial-text/10 px-4 sm:px-8 py-4 sm:py-6 flex flex-wrap gap-3 items-center justify-between bg-editorial-bg/95 backdrop-blur z-10 sticky top-0">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <Link to="/" className="flex items-center transition-opacity hover:opacity-100 opacity-90">
                        <img src="/logo%20hermes.png" alt="Hermes" className="h-8 w-auto object-contain" />
                    </Link>
                    <h1 className="text-base sm:text-xl font-black uppercase tracking-widest italic">Panel de Usuarios</h1>
                </div>
                <div className="flex gap-2 sm:gap-4">
                    <Link to="/" className="font-sans text-xs font-bold uppercase tracking-widest px-2 sm:px-4 py-2 hover:underline"><span className="sm:hidden">← Volver</span><span className="hidden sm:inline">Volver al Dashboard</span></Link>
                    <button onClick={logout} className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors">Salir</button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 sm:p-8 lg:p-12 pb-24">

                <div className="mb-12 border border-editorial-text/20 p-5 sm:p-8 bg-white/50">
                    <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wider sm:tracking-widest mb-6 font-sans">Crear Nuevo Usuario</h2>
                    <form onSubmit={handleCreateUser} className="flex flex-col sm:flex-row gap-4 sm:items-end font-sans">
                        <div className="flex flex-col gap-2 flex-1">
                            <label htmlFor="new-user-1" className="text-xs font-bold uppercase tracking-widest opacity-60">Usuario</label>
                            <input id="new-user-1"
                                type="text"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2 flex-1">
                            <label htmlFor="new-user-2" className="text-xs font-bold uppercase tracking-widest opacity-60">Contraseña</label>
                            <input id="new-user-2"
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2 sm:w-44">
                            <label htmlFor="new-user-3" className="text-xs font-bold uppercase tracking-widest opacity-60">Tipo</label>
                            <select id="new-user-3"
                                value={newRole}
                                onChange={e => setNewRole(e.target.value as 'EDITOR' | 'DEMO')}
                                className="border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                            >
                                <option value="EDITOR">Editor</option>
                                <option value="DEMO">Demo · solo lectura</option>
                            </select>
                        </div>
                        <button type="submit" className="bg-editorial-text text-editorial-bg px-6 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors sm:self-end h-[41px]">
                            Crear
                        </button>
                    </form>
                </div>

                <div className="border border-editorial-text/10 p-5 sm:p-8 overflow-x-auto">
                    <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wider sm:tracking-widest mb-6 font-sans">Usuarios Registrados</h2>
                    {loading ? (
                        <div className="animate-pulse opacity-50">Cargando...</div>
                    ) : (
                        <table className="w-full min-w-[480px] text-left font-sans">
                            <thead>
                                <tr className="border-b border-editorial-text/20 text-xs uppercase tracking-widest opacity-60">
                                    <th className="pb-4 font-normal">Usuario</th>
                                    <th className="pb-4 font-normal">Rol</th>
                                    <th className="pb-4 font-normal">Fecha de Creación</th>
                                    <th className="pb-4 font-normal text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} className="border-b border-editorial-text/10 last:border-0 hover:bg-editorial-text/5 transition-colors group">
                                        <td className="py-4 font-bold">{u.username} {u.id === user?.id && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1 py-0.5 rounded uppercase tracking-widest">Tú</span>}</td>
                                        <td className="py-4 text-xs">{u.role}</td>
                                        <td className="py-4 text-xs opacity-60">{new Date(u.createdAt).toLocaleDateString()}</td>
                                        <td className="py-4"><div className="flex justify-end gap-3 sm:opacity-30 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleChangePassword(u.id, u.username)}
                                                className="p-1 hover:text-blue-500"
                                                title="Cambiar contraseña"
                                                aria-label={`Cambiar contraseña de ${u.username}`}
                                            >
                                                <KeyRound size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u.id)}
                                                disabled={u.id === user?.id}
                                                className="p-1 hover:text-red-500 disabled:opacity-20 disabled:hover:text-inherit"
                                                title="Eliminar usuario"
                                                aria-label={`Eliminar a ${u.username}`}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
        </div>
    );
}
