const express = require('express');
const { body, query, validationResult } = require('express-validator');
const routingService = require('../services/routing.service');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ============================================
// POST /api/routes/calculate
// Calculate a route between two points
// ============================================
router.post('/calculate', [
    body('origin.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid origin latitude required'),
    body('origin.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid origin longitude required'),
    body('destination.lat').isFloat({ min: -90, max: 90 }).withMessage('Valid destination latitude required'),
    body('destination.lng').isFloat({ min: -180, max: 180 }).withMessage('Valid destination longitude required'),
    body('mode').optional().isIn(['walk', 'wheelchair', 'cycling']).withMessage('Mode must be walk, wheelchair, or cycling'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { origin, destination, mode = 'walk' } = req.body;

        const startTime = Date.now();

        const result = routingService.calculateRoute(
            origin.lat, origin.lng,
            destination.lat, destination.lng,
            mode
        );

        const elapsed = Date.now() - startTime;

        if (result.error) {
            return res.status(404).json({ error: result.error });
        }

        res.json({
            ...result,
            calculationTimeMs: elapsed,
        });
    } catch (err) {
        console.error('Route calculation error:', err);
        res.status(500).json({ error: 'Route calculation failed' });
    }
});

// ============================================
// POST /api/routes/snap
// Snap a GPS position to the nearest edge
// ============================================
router.post('/snap', [
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { lat, lng } = req.body;
        const result = await routingService.snapToEdge(lat, lng);

        if (!result) {
            return res.status(404).json({ error: 'No nearby edge found' });
        }

        res.json(result);
    } catch (err) {
        console.error('Snap error:', err);
        res.status(500).json({ error: 'Snapping failed' });
    }
});

// ============================================
// GET /api/routes/graph
// Get the walking network as GeoJSON (for map rendering)
// ============================================
router.get('/graph', (req, res) => {
    try {
        const geojson = routingService.getGraphAsGeoJSON();
        res.json(geojson);
    } catch (err) {
        console.error('Graph fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch graph data' });
    }
});

// ============================================
// POST /api/routes/history (Protected)
// Save a completed route
// ============================================
router.post('/history', authMiddleware, [
    body('startNode').trim().notEmpty().escape().withMessage('Start node is required'),
    body('endNode').trim().notEmpty().escape().withMessage('End node is required'),
    body('distance').isFloat({ min: 0, max: 100000 }).withMessage('Distance must be 0-100000 meters'),
    body('duration').isFloat({ min: 0, max: 86400 }).withMessage('Duration must be 0-86400 seconds'),
    body('mode').isIn(['walk', 'wheelchair', 'cycling']).withMessage('Invalid mode'),
    body('path').optional().isArray({ max: 500 }).withMessage('Path must be an array with max 500 items'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { startNode, endNode, path, distance, duration, mode } = req.body;

        const result = await db.query(
            `INSERT INTO route_history (user_id, start_node, end_node, path, distance, duration, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING route_id, created_at`,
            [req.user.id, startNode, endNode, JSON.stringify(path || []), distance, duration, mode]
        );

        res.status(201).json({
            message: 'Route saved',
            routeId: result.rows[0].route_id,
            createdAt: result.rows[0].created_at,
        });
    } catch (err) {
        console.error('Route history save error:', err);
        res.status(500).json({ error: 'Failed to save route' });
    }
});

// ============================================
// GET /api/routes/history (Protected)
// Get user's route history
// ============================================
router.get('/history', authMiddleware, [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        const result = await db.query(
            `SELECT route_id, start_node, end_node, distance, duration, mode, created_at
       FROM route_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
            [req.user.id, limit, offset]
        );

        const countResult = await db.query(
            'SELECT COUNT(*) FROM route_history WHERE user_id = $1',
            [req.user.id]
        );

        res.json({
            routes: result.rows,
            total: parseInt(countResult.rows[0].count),
            limit,
            offset,
        });
    } catch (err) {
        console.error('Route history fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch route history' });
    }
});

module.exports = router;
