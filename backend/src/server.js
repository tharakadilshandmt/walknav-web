require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { requestId } = require('./middleware/security');

const db = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth.routes');
const routeRoutes = require('./routes/route.routes');
const zoneRoutes = require('./routes/zone.routes');
const weatherRoutes = require('./routes/weather.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// Middleware
// ============================================

// Request ID for tracing
app.use(requestId);

// Security headers — with CSP configured for Mapbox + Open-Meteo
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://api.mapbox.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://*.mapbox.com", "https://api.mapbox.com"],
            connectSrc: [
                "'self'",
                "https://api.mapbox.com",
                "https://*.mapbox.com",
                "https://events.mapbox.com",
                "https://api.open-meteo.com",
                process.env.FRONTEND_URL || "http://localhost:5173",
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            workerSrc: ["'self'", "blob:"],
            childSrc: ["'self'", "blob:"],
            mediaSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Required for Mapbox GL
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

// CORS — explicit origin whitelist
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim());

app.use(cors({
    origin: (origin, callback) => {
        // Allow same-origin requests (no Origin header) and whitelisted origins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Global rate limiting — 100 requests per 15 minutes per IP
if (process.env.NODE_ENV !== 'test') {
    const limiter = rateLimit({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
    });
    app.use('/api/', limiter);
}

// Body parsing — tight limit (1 MB default, routes with larger payloads can override)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// ============================================
// Routes
// ============================================

// Health check — full status
app.get('/api/health', async (req, res) => {
    try {
        const dbResult = await db.query('SELECT NOW() as time, PostGIS_Version() as postgis');
        const mem = process.memoryUsage();
        res.json({
            status: 'healthy',
            version: require('../package.json')?.version || '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: Math.round(process.uptime()),
            memory: {
                rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
                heap: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
            },
            database: {
                connected: true,
                time: dbResult.rows[0].time,
                postgis: dbResult.rows[0].postgis,
            },
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: { connected: false, error: err.message },
        });
    }
});

// Liveness probe — is the process alive?
app.get('/api/health/live', (req, res) => {
    res.json({ status: 'alive', uptime: Math.round(process.uptime()) });
});

// Readiness probe — can we serve requests?
app.get('/api/health/ready', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ready' });
    } catch {
        res.status(503).json({ status: 'not ready', error: 'Database unavailable' });
    }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    // CORS error
    if (err.message && err.message.includes('not allowed by CORS')) {
        return res.status(403).json({ error: 'CORS: Origin not allowed' });
    }

    console.error(`[${req.requestId || 'no-id'}] Unhandled error:`, err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message,
    });
});

// ============================================
// Start Server
// ============================================

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, async () => {
        console.log(`\n🚀 WalkNav API running on http://localhost:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔒 CORS origins: ${allowedOrigins.join(', ')}\n`);

        // Auto-seed database if empty (for Docker one-command deployment)
        try {
            const { autoSeed } = require('./utils/auto-seed');
            await autoSeed();
        } catch (err) {
            console.warn('⚠️  Auto-seed skipped:', err.message);
        }

        // Load routing graph into memory at startup
        try {
            const routingService = require('./services/routing.service');
            await routingService.loadGraph();
        } catch (err) {
            console.warn('⚠️  Could not load routing graph (database may not be seeded yet):', err.message);
        }
    });
}

module.exports = app;
