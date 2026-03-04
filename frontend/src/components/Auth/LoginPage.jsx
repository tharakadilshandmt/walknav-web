import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
    const { login, register } = useAuth();
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isRegister) {
                await register(email, password, name);
            } else {
                await login(email, password);
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Something went wrong';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card card">
                <div className="login-icon">🧭</div>
                <h1 className="login-title">WalkNav</h1>
                <p className="login-subtitle">
                    {isRegister ? 'Create your account' : 'Sign in to navigate'}
                </p>

                {error && <div className="login-error">{error}</div>}

                <form className="login-form" onSubmit={handleSubmit}>
                    {isRegister && (
                        <input
                            id="register-name"
                            className="input"
                            type="text"
                            placeholder="Full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoComplete="name"
                        />
                    )}
                    <input
                        id="login-email"
                        className="input"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />
                    <input
                        id="login-password"
                        className="input"
                        type="password"
                        placeholder="Password (min 8 characters)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                    />
                    <button
                        id="login-submit"
                        className="btn btn-primary btn-lg"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                        ) : isRegister ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <div className="login-toggle">
                    {isRegister ? (
                        <>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegister(false); setError(''); }}>Sign in</a></>
                    ) : (
                        <>Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegister(true); setError(''); }}>Create one</a></>
                    )}
                </div>
            </div>
        </div>
    );
}
