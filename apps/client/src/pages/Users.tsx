import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, KeyRound, Edit2, Check, X, ShieldCheck } from 'lucide-react';

export interface UserData {
    id: string;
    username: string;
    role: string;
    createdAt: string;
    vorknewsUsername?: string | null;
    vorknewsAuthorName?: string | null;
    hasVorknewsPassword?: boolean;
}

export default function Users() {
    const { user, logout } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);

    // Create form state
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'EDITOR' | 'ADMIN' | 'DEMO'>('EDITOR');
    const [newVkUser, setNewVkUser] = useState('');
    const [newVkPass, setNewVkPass] = useState('');
    const [newVkAuthor, setNewVkAuthor] = useState('');
    const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);

    // Edit modal state
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [editRole, setEditRole] = useState<'EDITOR' | 'ADMIN' | 'DEMO'>('EDITOR');
    const [editVkUser, setEditVkUser] = useState('');
    const [editVkPass, setEditVkPass] = useState('');
    const [editVkAuthor, setEditVkAuthor] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

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
            await api.post('/api/users', {
                username: newUsername,
                password: newPassword,
                role: newRole,
                vorknewsUsername: newVkUser || undefined,
                vorknewsPassword: newVkPass || undefined,
                vorknewsAuthorName: newVkAuthor || undefined
            });
            setNewUsername('');
            setNewPassword('');
            setNewRole('EDITOR');
            setNewVkUser('');
            setNewVkPass('');
            setNewVkAuthor('');
            setShowAdvancedCreate(false);
            fetchUsers();
            alert('Usuario creado correctamente con sus credenciales de Vorknews');
        } catch (error: any) {
            alert('Error creando usuario: ' + (error.response?.data?.error || ''));
        }
    };

    const handleOpenEdit = (u: UserData) => {
        setEditingUser(u);
        setEditRole(u.role as any);
        setEditVkUser(u.vorknewsUsername || '');
        setEditVkPass('');
        setEditVkAuthor(u.vorknewsAuthorName || '');
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setSavingEdit(true);
        try {
            const payload: any = {
                role: editRole,
                vorknewsUsername: editVkUser,
                vorknewsAuthorName: editVkAuthor
            };
            if (editVkPass.trim()) {
                payload.vorknewsPassword = editVkPass.trim();
            }

            await api.put(`/api/users/${editingUser.id}`, payload);
            setEditingUser(null);
            fetchUsers();
            alert('Usuario y credenciales de Vorknews actualizados con éxito');
        } catch (error: any) {
            alert('Error actualizando usuario: ' + (error.response?.data?.error || ''));
        } finally {
            setSavingEdit(false);
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
        const password = prompt(`Escriba la nueva contraseña de Hermes para el usuario '${username}':`);
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
                    <Link to="/" className="flex items-center transition-opacity hover:opacity-100 opacity-90">
                        <img src="/logo%20hermes.png" alt="Hermes" className="h-8 w-auto object-contain" />
                    </Link>
                    <span className="text-xl font-black uppercase tracking-widest italic">Panel de Usuarios & Redactores</span>
                </div>
                <div className="flex gap-4">
                    <Link to="/settings" className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 hover:underline">Configuración</Link>
                    <Link to="/" className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 hover:underline">Volver al Dashboard</Link>
                    <button onClick={logout} className="font-sans text-xs font-bold uppercase tracking-widest px-4 py-2 border border-editorial-text/20 hover:bg-editorial-text/5 transition-colors">Salir</button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto p-12">

                {/* Formulario Crear Usuario */}
                <div className="mb-12 border border-editorial-text/20 p-8 bg-white/50">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold uppercase tracking-widest font-sans">Crear Nuevo Usuario</h2>
                            <p className="text-xs text-editorial-text/60 font-sans mt-0.5">Podés asignarle directamente sus credenciales de Vorknews para que ingrese con su firma.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAdvancedCreate(!showAdvancedCreate)}
                            className="font-sans text-xs uppercase font-bold text-editorial-text/70 underline hover:text-editorial-text"
                        >
                            {showAdvancedCreate ? 'Ocultar campos Vorknews' : '+ Asignar credenciales Vorknews'}
                        </button>
                    </div>

                    <form onSubmit={handleCreateUser} className="font-sans space-y-4">
                        <div className="flex gap-4 items-end">
                            <div className="flex flex-col gap-2 flex-1">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60">Usuario Hermes</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                    className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                                    placeholder="ej. marianogomez"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-2 flex-1">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60">Contraseña Hermes</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    className="w-full border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-2 w-44">
                                <label className="text-xs font-bold uppercase tracking-widest opacity-60">Rol en Hermes</label>
                                <select
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value as any)}
                                    className="border-b border-editorial-text/30 bg-transparent py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                                >
                                    <option value="EDITOR">Editor (Redactor)</option>
                                    <option value="ADMIN">Administrador</option>
                                    <option value="DEMO">Demo · solo lectura</option>
                                </select>
                            </div>
                        </div>

                        {showAdvancedCreate && (
                            <div className="p-4 bg-purple-50/50 border border-purple-200/60 rounded flex flex-col md:flex-row gap-4">
                                <div className="flex-1">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block mb-1">
                                        Email / Usuario Vorknews
                                    </label>
                                    <input
                                        type="text"
                                        value={newVkUser}
                                        onChange={e => setNewVkUser(e.target.value)}
                                        placeholder="ej. mariano@politicadelsur.com"
                                        className="w-full border border-purple-300/80 bg-white px-2.5 py-1.5 text-xs rounded focus:outline-none focus:border-purple-600"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block mb-1">
                                        Contraseña Vorknews
                                    </label>
                                    <input
                                        type="password"
                                        value={newVkPass}
                                        onChange={e => setNewVkPass(e.target.value)}
                                        placeholder="Clave de politicadelsur.com/vadmin"
                                        className="w-full border border-purple-300/80 bg-white px-2.5 py-1.5 text-xs rounded focus:outline-none focus:border-purple-600"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block mb-1">
                                        Firma de Autor en Vorknews
                                    </label>
                                    <input
                                        type="text"
                                        value={newVkAuthor}
                                        onChange={e => setNewVkAuthor(e.target.value)}
                                        placeholder="ej. Mariano Gómez"
                                        className="w-full border border-purple-300/80 bg-white px-2.5 py-1.5 text-xs rounded focus:outline-none focus:border-purple-600"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button type="submit" className="bg-editorial-text text-editorial-bg px-6 py-2 font-bold uppercase tracking-widest hover:bg-black transition-colors text-xs">
                                Crear Usuario
                            </button>
                        </div>
                    </form>
                </div>

                {/* Tabla de Usuarios Registrados */}
                <div className="border border-editorial-text/10 p-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold uppercase tracking-widest font-sans">Usuarios & Redactores</h2>
                        <span className="text-xs text-editorial-text/50 font-sans">{users.length} usuarios registrados</span>
                    </div>

                    {loading ? (
                        <div className="animate-pulse opacity-50 font-sans">Cargando usuarios...</div>
                    ) : (
                        <table className="w-full text-left font-sans text-xs">
                            <thead>
                                <tr className="border-b border-editorial-text/20 uppercase tracking-widest opacity-60">
                                    <th className="pb-4 font-semibold">Usuario Hermes</th>
                                    <th className="pb-4 font-semibold">Rol</th>
                                    <th className="pb-4 font-semibold">Cuenta Vorknews</th>
                                    <th className="pb-4 font-semibold">Firma de Autor</th>
                                    <th className="pb-4 font-semibold">Estado Clave</th>
                                    <th className="pb-4 font-semibold text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} className="border-b border-editorial-text/10 last:border-0 hover:bg-editorial-text/5 transition-colors group">
                                        <td className="py-4 font-bold text-sm">
                                            {u.username}
                                            {u.id === user?.id && (
                                                <span className="ml-2 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                                    Tú
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                u.role === 'ADMIN' ? 'bg-amber-100 text-amber-800' : u.role === 'DEMO' ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-800'
                                            }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            {u.vorknewsUsername ? (
                                                <span className="font-mono text-purple-900 font-semibold">{u.vorknewsUsername}</span>
                                            ) : (
                                                <span className="text-editorial-text/40 italic">Usa fallback global</span>
                                            )}
                                        </td>
                                        <td className="py-4">
                                            {u.vorknewsAuthorName ? (
                                                <span className="font-semibold">{u.vorknewsAuthorName}</span>
                                            ) : (
                                                <span className="text-editorial-text/40 italic">Por defecto</span>
                                            )}
                                        </td>
                                        <td className="py-4">
                                            {u.hasVorknewsPassword ? (
                                                <span className="inline-flex items-center gap-1 text-green-700 font-bold text-[10px] uppercase">
                                                    <Check size={12} /> Configurada
                                                </span>
                                            ) : (
                                                <span className="text-editorial-text/40 text-[10px] uppercase">
                                                    Sin clave
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4 text-right flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleOpenEdit(u)}
                                                className="p-1.5 border border-editorial-text/20 hover:bg-purple-100 hover:text-purple-900 rounded transition-colors"
                                                title="Editar perfil y credenciales Vorknews"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleChangePassword(u.id, u.username)}
                                                className="p-1.5 border border-editorial-text/20 hover:bg-blue-100 hover:text-blue-900 rounded transition-colors"
                                                title="Cambiar contraseña de Hermes"
                                            >
                                                <KeyRound size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u.id)}
                                                disabled={u.id === user?.id}
                                                className="p-1.5 border border-editorial-text/20 hover:bg-red-100 hover:text-red-700 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                                title="Eliminar Usuario"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>

            {/* Modal Editar Usuario & Vorknews */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-editorial-text/30 max-w-lg w-full p-6 shadow-2xl rounded-sm font-sans">
                        <div className="flex justify-between items-center pb-4 border-b border-editorial-text/10 mb-5">
                            <div>
                                <h3 className="text-lg font-bold uppercase tracking-wider">
                                    Editar Usuario: <span className="text-purple-900">{editingUser.username}</span>
                                </h3>
                                <p className="text-xs text-editorial-text/60 mt-0.5">Configuración de rol y credenciales para publicación en Vorknews.</p>
                            </div>
                            <button onClick={() => setEditingUser(null)} className="p-1 hover:bg-editorial-text/10 rounded">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-editorial-text/70 block mb-1">
                                    Rol en Hermes
                                </label>
                                <select
                                    value={editRole}
                                    onChange={e => setEditRole(e.target.value as any)}
                                    className="w-full border border-editorial-text/30 p-2 text-xs rounded bg-white"
                                >
                                    <option value="EDITOR">Editor (Redactor)</option>
                                    <option value="ADMIN">Administrador</option>
                                    <option value="DEMO">Demo · solo lectura</option>
                                </select>
                            </div>

                            <div className="pt-2 border-t border-editorial-text/10">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-950 mb-3 flex items-center gap-1.5">
                                    <ShieldCheck size={14} /> Credenciales para Vorknews (politicadelsur.com)
                                </h4>

                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-wider text-editorial-text/70 block mb-1">
                                            Email / Usuario en Vorknews
                                        </label>
                                        <input
                                            type="text"
                                            value={editVkUser}
                                            onChange={e => setEditVkUser(e.target.value)}
                                            placeholder="ej. redactor@politicadelsur.com"
                                            className="w-full border border-editorial-text/30 p-2 text-xs rounded focus:outline-none focus:border-purple-800"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-wider text-editorial-text/70 block mb-1">
                                            Contraseña en Vorknews
                                        </label>
                                        <input
                                            type="password"
                                            value={editVkPass}
                                            onChange={e => setEditVkPass(e.target.value)}
                                            placeholder={editingUser.hasVorknewsPassword ? '•••••••• (Dejar en blanco para conservar la actual)' : 'Ingresá la contraseña'}
                                            className="w-full border border-editorial-text/30 p-2 text-xs rounded focus:outline-none focus:border-purple-800"
                                        />
                                        {editingUser.hasVorknewsPassword && (
                                            <p className="text-[10px] text-green-700 font-semibold mt-1">
                                                ✓ Este usuario ya tiene una contraseña guardada.
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-[11px] font-bold uppercase tracking-wider text-editorial-text/70 block mb-1">
                                            Firma de Autor en Vorknews
                                        </label>
                                        <input
                                            type="text"
                                            value={editVkAuthor}
                                            onChange={e => setEditVkAuthor(e.target.value)}
                                            placeholder="ej. Juan Bautista Vega"
                                            className="w-full border border-editorial-text/30 p-2 text-xs rounded focus:outline-none focus:border-purple-800"
                                        />
                                        <p className="text-[10px] text-editorial-text/50 mt-1">
                                            Nombre que figurará automáticamente en la firma del redactor al publicar sus notas.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-editorial-text/10">
                                <button
                                    type="button"
                                    onClick={() => setEditingUser(null)}
                                    className="px-4 py-2 border border-editorial-text/20 text-xs font-bold uppercase tracking-wider hover:bg-editorial-text/5 rounded"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingEdit}
                                    className="px-5 py-2 bg-purple-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-black rounded transition-colors disabled:opacity-50"
                                >
                                    {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
