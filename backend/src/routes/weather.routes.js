const express = require('express');
const { query, validationResult } = require('express-validator');
const { weatherLimiter } = require('../middleware/security');

const router = express.Router();

// ============================================
// GET /api/weather?lat=X&lng=Y
// Proxy to Open-Meteo API (avoids CORS issues in browser)
// ============================================
router.get('/', weatherLimiter, [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('lat must be a valid latitude (-90 to 90)'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('lng must be a valid longitude (-180 to 180)'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);

        const baseUrl = process.env.WEATHER_API_URL || 'https://api.open-meteo.com';
        const url = `${baseUrl}/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation&timezone=auto`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            return res.status(502).json({ error: 'Weather API returned an error', details: data });
        }

        // Return simplified weather data
        res.json({
            temperature: data.current?.temperature_2m,
            precipitation: data.current?.precipitation,
            time: data.current?.time,
            timezone: data.timezone,
        });
    } catch (err) {
        console.error('Weather proxy error:', err);
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});

module.exports = router;
