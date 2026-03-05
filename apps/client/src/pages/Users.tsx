import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, KeyRound } from 'lucide-react';

interface UserData {
    id: string;
    username: string;
    role: string;
    createdAt: string;
}

export default function Users() {
    const { user, logout } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);

    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');

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
            await api.post('/api/users', { username: newUsername, password: newPassword, role: 'ADMIN' });
            setNewUsername('');
            setNewPassword('');
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
            <header className="border-b border-editorial-text/10 px-8 py-6 flex items-center justify-between bg-editorial-bg/95 backdrop-blur z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="Logo" className="h-8 w-auto mix-blend-multiply opacity-90" />
                    <span className="text-xl font-black uppercase tracking-widest italic">Panel de Usuarios</span>
                </div>
                <div className="flex gap-4">
                    <Link to="/" className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 hover:underline">Volver al Dashboard</Link>
                    <button onClick={logout} className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors">Salir</button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-12">

                <div className="mb-12 border border-editorial-text/20 p-8 bg-white/50">
                    <h2 className="text-xl font-bold uppercase tracking-widest mb-6 font-sans">Crear Nuevo Usuario (Admin)</h2>
                    <form onSubmit={handleCreateUser} className="flex gap-4 items-end font-sans">
                        <div className="flex flex-col gap-2 flex-1">
                            <label className="text-xs font-bold uppercase tracking-widest opacity-60">Usuario</label>
                            <input
                                type="text"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2 flex-1">
                            <label className="text-xs font-bold uppercase tracking-widest opacity-60">Contraseña</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                                required
                            />
                        </div>
                        <button type="submit" className="bg-editorial-text text-editorial-bg px-6 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors self-end h-[41px]">
                            Crear
                        </button>
                    </form>
                </div>

                <div className="border border-editorial-text/10 p-8">
                    <h2 className="text-xl font-bold uppercase tracking-widest mb-6 font-sans">Usuarios Registrados</h2>
                    {loading ? (
                        <div className="animate-pulse opacity-50">Cargando...</div>
                    ) : (
                        <table className="w-full text-left font-sans">
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
                                        <td className="py-4 text-right flex justify-end gap-3 opacity-30 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleChangePassword(u.id, u.username)}
                                                className="p-1 hover:text-blue-500"
                                                title="Cambiar Password"
                                            >
                                                <KeyRound size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u.id)}
                                                disabled={u.id === user?.id}
                                                className="p-1 hover:text-red-500 disabled:opacity-20 disabled:hover:text-inherit"
                                                title="Eliminar Usuario"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
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
