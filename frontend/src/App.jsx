import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast/Toast';
import LoginPage from './components/Auth/LoginPage';
import MapPage from './components/Map/MapPage';
import AdminPage from './components/Admin/AdminPage';
import QRScannerPage from './components/QR/QRScannerPage';

function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-screen loading-screen-branded">
                <div className="login-icon">🧭</div>
                <div className="spinner" />
                <span className="loading-text">Loading WalkNav...</span>
            </div>
        );
    }

    return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
    const { isAuthenticated, isAdmin, loading } = useAuth();

    if (loading) {
        return (
            <div className="loading-screen loading-screen-branded">
                <div className="login-icon">🧭</div>
                <div className="spinner" />
                <span className="loading-text">Loading WalkNav...</span>
            </div>
        );
    }

    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (!isAdmin) return <Navigate to="/" replace />;
    return children;
}

function AppRoutes() {
    const { isAuthenticated } = useAuth();

    return (
        <Routes>
            <Route
                path="/login"
                element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
            />
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <MapPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin"
                element={
                    <AdminRoute>
                        <AdminPage />
                    </AdminRoute>
                }
            />
            <Route
                path="/scan"
                element={<QRScannerPage />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <AppRoutes />
            </ToastProvider>
        </AuthProvider>
    );
}
