const express = require('express');
const QRCode = require('qrcode');
const db = require('../config/db');
const routingService = require('../services/routing.service');
const { sanitizeParams } = require('../middleware/security');

const router = express.Router();

// ============================================
// GET /api/zones
// List all navigation zones
// ============================================
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
      SELECT 
        zone_id, 
        name, 
        description,
        ST_AsGeoJSON(geom)::json AS geometry,
        ST_XMin(ST_Envelope(geom)) AS min_lng,
        ST_YMin(ST_Envelope(geom)) AS min_lat,
        ST_XMax(ST_Envelope(geom)) AS max_lng,
        ST_YMax(ST_Envelope(geom)) AS max_lat,
        created_at
      FROM navigation_zones
      ORDER BY name
    `);

        res.json({
            zones: result.rows.map(zone => ({
                id: zone.zone_id,
                name: zone.name,
                description: zone.description,
                geometry: zone.geometry,
                bounds: {
                    minLat: parseFloat(zone.min_lat),
                    maxLat: parseFloat(zone.max_lat),
                    minLng: parseFloat(zone.min_lng),
                    maxLng: parseFloat(zone.max_lng),
                },
                createdAt: zone.created_at,
            })),
        });
    } catch (err) {
        console.error('Zones fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch zones' });
    }
});

// ============================================
// GET /api/zones/:id/graph
// Get the walking network graph for a specific zone as GeoJSON
// ============================================
router.get('/:id/graph', sanitizeParams, async (req, res) => {
    try {
        const geojson = routingService.getGraphAsGeoJSON();
        res.json(geojson);
    } catch (err) {
        console.error('Zone graph error:', err);
        res.status(500).json({ error: 'Failed to fetch zone graph' });
    }
});

// ============================================
// GET /api/zones/:id/stats
// Get statistics for a zone
// ============================================
router.get('/:id/stats', sanitizeParams, async (req, res) => {
    try {
        const zoneId = parseInt(req.params.id);

        const stats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM nodes WHERE zone_id = $1) AS node_count,
        (SELECT COUNT(*) FROM edges e 
         JOIN nodes n ON e.source_node = n.id 
         WHERE n.zone_id = $1) AS edge_count,
        (SELECT COUNT(*) FROM buildings WHERE zone_id = $1) AS building_count
    `, [zoneId]);

        res.json({
            zoneId,
            ...stats.rows[0],
        });
    } catch (err) {
        console.error('Zone stats error:', err);
        res.status(500).json({ error: 'Failed to fetch zone statistics' });
    }
});

// ============================================
// GET /api/zones/:id/qr
// Generate a QR code for a zone's navigation URL
// ============================================
router.get('/:id/qr', sanitizeParams, async (req, res) => {
    try {
        const zoneId = parseInt(req.params.id);

        // Verify zone exists
        const zone = await db.query(
            'SELECT zone_id, name FROM navigation_zones WHERE zone_id = $1',
            [zoneId]
        );

        if (zone.rows.length === 0) {
            return res.status(404).json({ error: 'Zone not found' });
        }

        // Build navigation URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const zoneUrl = `${frontendUrl}/?zone=${zoneId}`;

        // Generate QR code as data URL (PNG base64)
        const qrDataUrl = await QRCode.toDataURL(zoneUrl, {
            width: 400,
            margin: 2,
            color: {
                dark: '#00E5FF',  // Cyan (matches app theme)
                light: '#0A0E17', // Dark background
            },
            errorCorrectionLevel: 'M',
        });

        res.json({
            qrDataUrl,
            zoneUrl,
            zoneName: zone.rows[0].name,
            zoneId,
        });
    } catch (err) {
        console.error('QR generation error:', err);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

module.exports = router;
