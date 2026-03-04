import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';

// ============================================
// Simple Canvas Chart Components
// ============================================

function BarChart({ data, labelKey, valueKey, title, color = '#00E5FF', width = 500, height = 200 }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || data.length === 0) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        ctx.clearRect(0, 0, width, height);
        const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
        const barW = Math.max(4, (width - 60) / data.length - 4);
        const chartH = height - 40;

        // Axes
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(50, 10);
        ctx.lineTo(50, chartH + 10);
        ctx.lineTo(width - 10, chartH + 10);
        ctx.stroke();

        // Y labels
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const y = 10 + chartH - (chartH * i) / 4;
            const val = Math.round((maxVal * i) / 4);
            ctx.fillText(val, 46, y + 3);
            if (i > 0) {
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath();
                ctx.moveTo(50, y);
                ctx.lineTo(width - 10, y);
                ctx.stroke();
            }
        }

        // Bars
        data.forEach((d, i) => {
            const x = 54 + i * (barW + 4);
            const barH = (d[valueKey] / maxVal) * chartH;
            const y = 10 + chartH - barH;

            const gradient = ctx.createLinearGradient(x, y, x, y + barH);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, color + '44');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, 2);
            ctx.fill();

            // Labels
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'center';
            const label = String(d[labelKey]).slice(-5);
            ctx.fillText(label, x + barW / 2, chartH + 24);
        });
    }, [data, labelKey, valueKey, color, width, height]);

    return (
        <div className="admin-chart">
            <h4 className="admin-chart-title">{title}</h4>
            {(!data || data.length === 0) ? (
                <div className="admin-chart-empty">No data yet</div>
            ) : (
                <canvas ref={canvasRef} />
            )}
        </div>
    );
}

function PieChart({ data, labelKey, valueKey, title, colors, width = 250, height = 250 }) {
    const canvasRef = useRef(null);
    const defaultColors = ['#00E5FF', '#7C4DFF', '#FF6E40', '#69F0AE', '#FFD740'];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data || data.length === 0) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        ctx.clearRect(0, 0, width, height);
        const total = data.reduce((s, d) => s + d[valueKey], 0);
        if (total === 0) return;

        const cx = width / 2;
        const cy = height / 2 - 15;
        const radius = Math.min(cx, cy) - 20;
        const palette = colors || defaultColors;

        let startAngle = -Math.PI / 2;
        data.forEach((d, i) => {
            const sliceAngle = (d[valueKey] / total) * 2 * Math.PI;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = palette[i % palette.length];
            ctx.fill();
            startAngle += sliceAngle;
        });

        // Inner circle (donut)
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.55, 0, 2 * Math.PI);
        ctx.fillStyle = '#0A0E17';
        ctx.fill();

        // Center text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(total, cx, cy + 6);

        // Legend
        ctx.font = '10px Inter, sans-serif';
        const legendY = height - 15;
        let lx = 10;
        data.forEach((d, i) => {
            ctx.fillStyle = palette[i % palette.length];
            ctx.fillRect(lx, legendY - 8, 10, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            const txt = `${d[labelKey]} (${d[valueKey]})`;
            ctx.fillText(txt, lx + 14, legendY);
            lx += ctx.measureText(txt).width + 24;
        });
    }, [data, labelKey, valueKey, colors, width, height]);

    return (
        <div className="admin-chart">
            <h4 className="admin-chart-title">{title}</h4>
            {(!data || data.length === 0) ? (
                <div className="admin-chart-empty">No data yet</div>
            ) : (
                <canvas ref={canvasRef} />
            )}
        </div>
    );
}

// ============================================
// AdminPage Component
// ============================================
export default function AdminPage() {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [roleUpdating, setRoleUpdating] = useState(null);

    const loadData = useCallback(async () => {
        try {
            const [statsRes, usersRes, analyticsRes] = await Promise.all([
                adminAPI.getStats(),
                adminAPI.getUsers(),
                adminAPI.getAnalytics(),
            ]);
            setStats(statsRes.data);
            setUsers(usersRes.data.users);
            setTotalUsers(usersRes.data.total);
            setAnalytics(analyticsRes.data);
        } catch (err) {
            console.error('Admin data load error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRoleToggle = async (userId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'visitor' : 'admin';
        setRoleUpdating(userId);
        try {
            await adminAPI.updateUserRole(userId, newRole);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update role');
        } finally {
            setRoleUpdating(null);
        }
    };

    if (loading) {
        return (
            <div className="admin-page">
                <div className="loading-screen">
                    <div className="spinner" />
                    <span style={{ color: 'var(--color-text-secondary)' }}>Loading admin dashboard...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page">
            {/* Header */}
            <div className="admin-header">
                <button className="admin-back-btn" onClick={() => navigate('/')}>← Map</button>
                <h1 className="admin-title">⚙️ Admin Dashboard</h1>
                <button className="admin-refresh-btn" onClick={loadData}>🔄 Refresh</button>
            </div>

            {/* Tabs */}
            <div className="admin-tabs">
                {['overview', 'users', 'analytics'].map(tab => (
                    <button
                        key={tab}
                        className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'overview' ? '📊 Overview' : tab === 'users' ? '👥 Users' : '📈 Analytics'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="admin-content">
                {/* ---------- Overview Tab ---------- */}
                {activeTab === 'overview' && stats && (
                    <div className="admin-overview">
                        <div className="admin-stats-grid">
                            <div className="admin-stat-card stat-users">
                                <div className="stat-icon">👥</div>
                                <div className="stat-value">{stats.users.total}</div>
                                <div className="stat-label">Total Users</div>
                                <div className="stat-sub">{stats.users.admins} admins</div>
                            </div>
                            <div className="admin-stat-card stat-routes">
                                <div className="stat-icon">🗺️</div>
                                <div className="stat-value">{stats.routes.total}</div>
                                <div className="stat-label">Total Routes</div>
                                <div className="stat-sub">{stats.routes.today} today</div>
                            </div>
                            <div className="admin-stat-card stat-active">
                                <div className="stat-icon">🟢</div>
                                <div className="stat-value">{stats.users.activeToday}</div>
                                <div className="stat-label">Active Today</div>
                                <div className="stat-sub">unique users</div>
                            </div>
                            <div className="admin-stat-card stat-distance">
                                <div className="stat-icon">📏</div>
                                <div className="stat-value">{stats.routes.totalDistanceKm}</div>
                                <div className="stat-label">Total km</div>
                                <div className="stat-sub">navigated</div>
                            </div>
                            <div className="admin-stat-card stat-network">
                                <div className="stat-icon">🌐</div>
                                <div className="stat-value">{stats.network.nodes}</div>
                                <div className="stat-label">Nodes</div>
                                <div className="stat-sub">{stats.network.edges} edges</div>
                            </div>
                            <div className="admin-stat-card stat-zones">
                                <div className="stat-icon">📍</div>
                                <div className="stat-value">{stats.network.zones}</div>
                                <div className="stat-label">Zones</div>
                                <div className="stat-sub">navigation areas</div>
                            </div>
                        </div>

                        {analytics?.recentRoutes?.length > 0 && (
                            <div className="admin-recent">
                                <h3>Recent Activity</h3>
                                <div className="admin-table-wrapper">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>User</th>
                                                <th>Mode</th>
                                                <th>Distance</th>
                                                <th>Duration</th>
                                                <th>When</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytics.recentRoutes.map(r => (
                                                <tr key={r.route_id}>
                                                    <td>{r.user_name || r.user_email || '—'}</td>
                                                    <td>
                                                        <span className={`mode-badge mode-${r.mode}`}>
                                                            {r.mode === 'walk' ? '🚶' : r.mode === 'wheelchair' ? '♿' : '🚴'} {r.mode}
                                                        </span>
                                                    </td>
                                                    <td>{Math.round(r.distance)}m</td>
                                                    <td>{Math.round(r.duration / 60)}min</td>
                                                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ---------- Users Tab ---------- */}
                {activeTab === 'users' && (
                    <div className="admin-users-section">
                        <h3>User Management ({totalUsers} total)</h3>
                        <div className="admin-table-wrapper">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Routes</th>
                                        <th>Joined</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td>#{u.id}</td>
                                            <td>{u.name}</td>
                                            <td>{u.email}</td>
                                            <td>
                                                <span className={`role-badge role-${u.role}`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td>{u.route_count}</td>
                                            <td>{new Date(u.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <button
                                                    className={`role-toggle-btn ${u.role === 'admin' ? 'demote' : 'promote'}`}
                                                    onClick={() => handleRoleToggle(u.id, u.role)}
                                                    disabled={roleUpdating === u.id}
                                                >
                                                    {roleUpdating === u.id ? '...' : u.role === 'admin' ? '↓ Demote' : '↑ Promote'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ---------- Analytics Tab ---------- */}
                {activeTab === 'analytics' && analytics && (
                    <div className="admin-analytics-section">
                        <div className="admin-charts-grid">
                            <BarChart
                                data={analytics.routesPerDay}
                                labelKey="date"
                                valueKey="count"
                                title="📅 Routes Per Day (Last 30 Days)"
                                color="#00E5FF"
                                width={520}
                                height={220}
                            />
                            <PieChart
                                data={analytics.modeBreakdown}
                                labelKey="mode"
                                valueKey="count"
                                title="🚶 Mode Breakdown"
                                width={280}
                                height={260}
                            />
                            <BarChart
                                data={analytics.peakHours}
                                labelKey="hour"
                                valueKey="count"
                                title="⏰ Peak Navigation Hours"
                                color="#7C4DFF"
                                width={520}
                                height={220}
                            />
                        </div>

                        {analytics.modeBreakdown?.length > 0 && (
                            <div className="admin-mode-stats">
                                <h3>Mode Statistics</h3>
                                <div className="admin-table-wrapper">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>Mode</th>
                                                <th>Count</th>
                                                <th>Avg Distance</th>
                                                <th>Avg Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytics.modeBreakdown.map(m => (
                                                <tr key={m.mode}>
                                                    <td>
                                                        <span className={`mode-badge mode-${m.mode}`}>
                                                            {m.mode === 'walk' ? '🚶' : m.mode === 'wheelchair' ? '♿' : '🚴'} {m.mode}
                                                        </span>
                                                    </td>
                                                    <td>{m.count}</td>
                                                    <td>{Math.round(m.avgDistanceM)}m</td>
                                                    <td>{Math.round(m.avgDurationS / 60)}min</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
