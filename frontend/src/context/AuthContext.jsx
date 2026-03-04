import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Check for existing session on mount
    useEffect(() => {
        const token = localStorage.getItem('walknav_token');
        const savedUser = localStorage.getItem('walknav_user');

        if (token && savedUser) {
            try {
                setUser(JSON.parse(savedUser));
            } catch {
                localStorage.removeItem('walknav_token');
                localStorage.removeItem('walknav_user');
            }
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        const response = await authAPI.login(email, password);
        const { token, user: userData } = response.data;
        localStorage.setItem('walknav_token', token);
        localStorage.setItem('walknav_user', JSON.stringify(userData));
        setUser(userData);
        return userData;
    };

    const register = async (email, password, name) => {
        const response = await authAPI.register(email, password, name);
        const { token, user: userData } = response.data;
        localStorage.setItem('walknav_token', token);
        localStorage.setItem('walknav_user', JSON.stringify(userData));
        setUser(userData);
        return userData;
    };

    const logout = () => {
        localStorage.removeItem('walknav_token');
        localStorage.removeItem('walknav_user');
        setUser(null);
    };

    const value = {
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
