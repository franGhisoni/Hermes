import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = () => {
    const { token, loading } = useAuth();

    if (loading) {
        return <div className="min-h-screen bg-editorial-bg flex items-center justify-center text-editorial-text font-serif">Verificando sesión...</div>;
    }

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};
