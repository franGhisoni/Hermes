import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await api.post('/api/auth/login', { username, password });
            login(res.data.token, res.data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-editorial-bg flex items-center justify-center text-editorial-text font-serif p-4">
            <div className="max-w-md w-full border border-editorial-text/20 p-8 bg-white/50 shadow-sm">
                <div className="text-center mb-10">
                    <img src="/logo.png" alt="Logo" className="h-16 w-auto mx-auto mix-blend-multiply opacity-90 mb-4" />
                    <h1 className="text-4xl font-black tracking-tight italic">Panel de Acceso</h1>
                    <p className="text-xs font-sans uppercase tracking-widest text-editorial-text/50 mt-2">Plataforma Automática de Noticias</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-6 font-sans">
                    {error && (
                        <div className="bg-red-50 text-red-600 border border-red-200 p-3 text-sm text-center font-bold">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-80" htmlFor="username">Usuario</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full border-b border-editorial-text/30 bg-transparent px-2 py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold uppercase tracking-widest opacity-80" htmlFor="password">Contraseña</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full border-b border-editorial-text/30 bg-transparent px-2 py-2 focus:outline-none focus:border-editorial-text/80 transition-colors"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-4 w-full bg-editorial-text text-editorial-bg py-3 font-bold uppercase tracking-widest hover:bg-black transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Iniciando...' : 'Iniciar Sesión'}
                    </button>
                </form>
            </div>
        </div>
    );
}
