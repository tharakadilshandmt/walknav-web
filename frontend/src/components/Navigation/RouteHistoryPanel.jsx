import { useState, useEffect } from 'react';
import { routesAPI } from '../../services/api';

export default function RouteHistoryPanel({ isOpen, onClose, onReplayRoute }) {
    const [routes, setRoutes] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const LIMIT = 15;

    useEffect(() => {
        if (isOpen) {
            loadRoutes(0);
        }
    }, [isOpen]);

    const loadRoutes = async (newOffset = 0) => {
        setLoading(true);
        try {
            const res = await routesAPI.getHistory(LIMIT, newOffset);
            if (newOffset === 0) {
                setRoutes(res.data.routes);
            } else {
                setRoutes(prev => [...prev, ...res.data.routes]);
            }
            setTotal(res.data.total);
            setOffset(newOffset);
        } catch (err) {
            console.error('Failed to load route history:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = () => {
        loadRoutes(offset + LIMIT);
    };

    const getModeIcon = (mode) => {
        switch (mode) {
            case 'walk': return '🚶';
            case 'wheelchair': return '♿';
            case 'cycling': return '🚴';
            default: return '🗺️';
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '--';
        const mins = Math.round(seconds / 60);
        if (mins < 60) return `${mins} min`;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    const formatDistance = (meters) => {
        if (!meters) return '--';
        if (meters < 1000) return `${Math.round(meters)} m`;
        return `${(meters / 1000).toFixed(1)} km`;
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        if (diff < 86400000) {
            return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (diff < 172800000) {
            return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
            d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (!isOpen) return null;

    return (
        <div className={`history-panel ${isOpen ? 'open' : ''}`}>
            <div className="history-header">
                <h3>📋 Route History</h3>
                <button className="history-close" onClick={onClose}>✕</button>
            </div>

            {loading && routes.length === 0 ? (
                <div className="history-loading">
                    <div className="spinner" />
                    <p>Loading history...</p>
                </div>
            ) : routes.length === 0 ? (
                <div className="history-empty">
                    <div className="history-empty-icon">🗺️</div>
                    <p>No routes yet</p>
                    <p className="history-empty-sub">
                        Your completed navigations will appear here
                    </p>
                </div>
            ) : (
                <div className="history-list">
                    {routes.map(route => (
                        <div
                            key={route.route_id}
                            className="history-card"
                            onClick={() => onReplayRoute && onReplayRoute(route)}
                        >
                            <div className="history-card-header">
                                <span className="history-mode">
                                    {getModeIcon(route.mode)} {route.mode}
                                </span>
                                <span className="history-date">
                                    {formatDate(route.created_at)}
                                </span>
                            </div>
                            <div className="history-card-stats">
                                <span className="history-stat">
                                    📏 {formatDistance(route.distance)}
                                </span>
                                <span className="history-stat">
                                    ⏱️ {formatDuration(route.duration)}
                                </span>
                            </div>
                        </div>
                    ))}

                    {routes.length < total && (
                        <button
                            className="history-load-more"
                            onClick={handleLoadMore}
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : `Load more (${total - routes.length} remaining)`}
                        </button>
                    )}
                </div>
            )}

            <div className="history-footer">
                <span>{total} total route{total !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
}
