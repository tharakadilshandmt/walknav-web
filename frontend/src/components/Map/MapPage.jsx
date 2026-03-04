import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { useAuth } from '../../context/AuthContext';
import { routesAPI, weatherAPI } from '../../services/api';
import SearchBar from '../Search/SearchBar';
import NavigationPanel from '../Navigation/NavigationPanel';
import RouteHistoryPanel from '../Navigation/RouteHistoryPanel';
import QRCodeModal from '../QR/QRCodeModal';
import Legend from './Legend';
import useGPSTracking from '../../hooks/useGPSTracking';

// Mapbox token
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;

// Monash Clayton center & campus bounds
const CAMPUS_CENTER = { lat: -37.9100, lng: 145.1340 };
const INITIAL_CENTER = [CAMPUS_CENTER.lng, CAMPUS_CENTER.lat];
const INITIAL_ZOOM = 16;
const CAMPUS_RADIUS_M = 2000; // 2km — if GPS is farther, use campus position

// Simulation start points (different locations on campus for variety)
const SIM_START_POINTS = [
    { lat: -37.9115, lng: 145.1320, name: 'Near Monash Science' },
    { lat: -37.9125, lng: 145.1355, name: 'Near Engineering' },
    { lat: -37.9095, lng: 145.1330, name: 'Near Library' },
    { lat: -37.9140, lng: 145.1345, name: 'Near Sports Centre' },
];

// Navigation constants (matching Flutter app)
const DEVIATION_TOLERANCE_M = 15;
const ARRIVAL_THRESHOLD_M = 5;
const LOCAL_SEARCH_WINDOW = 30;
const RECOVERY_SEARCH_TRIGGER_M = 8;
const DENSIFY_SPACING_M = 3;
// Simulation speeds (meters per tick)
const SIM_SPEEDS = {
    walk: 1,         // 1 point per tick (~2 m/s at 1.5s tick)
    wheelchair: 1,
    cycling: 2,
};
const SIM_TICK_MS = 1500; // 1.5s per tick — slow enough for voice to finish between steps

// Terrain colors (match mobile app)
const FLOOR_COLORS = {
    0: '#546E7A', // Concrete
    1: '#0D0D0D', // Tar
    2: '#D1B41C', // Sand
    3: '#8D6E63', // Wood
    4: '#00E676', // Synthetic
};

// ============================================
// Utility Functions
// ============================================

/** Haversine distance in meters */
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Calculate bearing from p1 to p2 in degrees */
function calculateBearing(p1, p2) {
    const lat1 = p1.lat * (Math.PI / 180);
    const lat2 = p2.lat * (Math.PI / 180);
    const dLng = (p2.lng - p1.lng) * (Math.PI / 180);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Densify a polyline so no gap exceeds maxMeters */
function densifyRoute(points, maxMeters = DENSIFY_SPACING_M) {
    if (points.length < 2) return [...points];
    const dense = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const dist = haversineDistance(start.lat, start.lng, end.lat, end.lng);
        if (dist > maxMeters) {
            const steps = Math.ceil(dist / maxMeters);
            for (let j = 1; j < steps; j++) {
                const ratio = j / steps;
                dense.push({
                    lat: start.lat + (end.lat - start.lat) * ratio,
                    lng: start.lng + (end.lng - start.lng) * ratio,
                });
            }
        }
        dense.push(end);
    }
    return dense;
}

/**
 * Find closest point index on route from startIndex forward.
 * Local window + recovery search if too far.
 */
function findClosestPointIndex(currentPos, routePoints, startIndex) {
    if (routePoints.length === 0) return startIndex;

    let bestIndex = startIndex;
    let minDist = haversineDistance(
        currentPos.lat, currentPos.lng,
        routePoints[startIndex].lat, routePoints[startIndex].lng
    );

    const windowEnd = Math.min(startIndex + LOCAL_SEARCH_WINDOW, routePoints.length);
    for (let i = startIndex + 1; i < windowEnd; i++) {
        const dist = haversineDistance(
            currentPos.lat, currentPos.lng,
            routePoints[i].lat, routePoints[i].lng
        );
        if (dist < minDist) { minDist = dist; bestIndex = i; }
    }

    if (minDist > RECOVERY_SEARCH_TRIGGER_M) {
        for (let i = windowEnd; i < routePoints.length; i++) {
            const dist = haversineDistance(
                currentPos.lat, currentPos.lng,
                routePoints[i].lat, routePoints[i].lng
            );
            if (dist < minDist) { minDist = dist; bestIndex = i; }
        }
    }

    return bestIndex;
}

/**
 * Speak text using Web Speech API.
 * Sets speechBusyRef to pause the simulation while voice is playing.
 * @param {string} text - Text to speak
 * @param {boolean} enabled - Whether voice is enabled
 * @param {object} busyRef - React ref to set true while speaking
 */
function speak(text, enabled, busyRef) {
    if (!enabled || !window.speechSynthesis) return;
    // Cancel any pending/current speech first
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';
    // Pause simulation while speaking
    if (busyRef) busyRef.current = true;
    utterance.onend = () => { if (busyRef) busyRef.current = false; };
    utterance.onerror = () => { if (busyRef) busyRef.current = false; };
    window.speechSynthesis.speak(utterance);
}

/** Check if a position is near Monash campus */
function isNearCampus(pos) {
    if (!pos) return false;
    return haversineDistance(pos.lat, pos.lng, CAMPUS_CENTER.lat, CAMPUS_CENTER.lng) < CAMPUS_RADIUS_M;
}


// ============================================
// MapPage Component
// ============================================

export default function MapPage() {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();
    const mapContainer = useRef(null);
    const map = useRef(null);
    const userMarkerEl = useRef(null);
    const userMarkerObj = useRef(null);
    const destMarker = useRef(null);

    // Map state
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(null);

    // Position state
    const [currentPosition, setCurrentPosition] = useState(null);
    const [isOnCampus, setIsOnCampus] = useState(false);

    // Navigation state
    const [destination, setDestination] = useState(null);
    const [destinationName, setDestinationName] = useState('');
    const [routeResult, setRouteResult] = useState(null);
    const [selectedMode, setSelectedMode] = useState('walk');
    const [weather, setWeather] = useState(null);
    const [showMenu, setShowMenu] = useState(false);

    // Phase 5 state
    const [showQRModal, setShowQRModal] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    // Live navigation state
    const [isNavigating, setIsNavigating] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [currentInstruction, setCurrentInstruction] = useState('');
    const [hasArrived, setHasArrived] = useState(false);
    const [isRerouting, setIsRerouting] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [remainingDistance, setRemainingDistance] = useState(0);
    const [remainingDuration, setRemainingDuration] = useState(0);
    const [cameraFollowing, setCameraFollowing] = useState(true);

    // Simulation state
    const [simMode, setSimMode] = useState(false);
    const [simRunning, setSimRunning] = useState(false);
    const [simSpeed, setSimSpeed] = useState(1); // 1x, 2x, 5x, 10x
    const [simStatus, setSimStatus] = useState(''); // Status text
    const simIntervalRef = useRef(null);
    const simIndexRef = useRef(0);
    const speechBusyRef = useRef(false); // true while voice is playing → pauses simulation

    // Refs for navigation engine (mutable without re-renders)
    const navStateRef = useRef({
        isNavigating: false,
        routePoints: [],
        steps: [],
        lastTrimIndex: 0,
        currentStepIndex: 0,
        destination: null,
        mode: 'walk',
        voiceEnabled: true,
        cameraFollowing: true,
    });

    // GPS tracking hook
    const gps = useGPSTracking();

    // ============================================
    // Initialize Map
    // ============================================
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        if (!MAPBOX_TOKEN) {
            setMapError('Mapbox token is missing. Add VITE_MAPBOX_TOKEN to frontend/.env');
            return;
        }

        try {
            map.current = new mapboxgl.Map({
                container: mapContainer.current,
                style: 'mapbox://styles/mapbox/dark-v11',
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
                pitch: 45,
                bearing: 0,
                antialias: true,
            });

            map.current.on('error', (e) => {
                console.error('Mapbox error:', e);
                setMapError('Map failed to load: ' + (e.error?.message || 'Unknown error'));
            });

            map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

            map.current.on('load', () => {
                setMapLoaded(true);

                try {
                    const layers = map.current.getStyle().layers;
                    const labelLayer = layers.find(
                        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
                    );
                    map.current.addLayer({
                        id: '3d-buildings',
                        source: 'composite',
                        'source-layer': 'building',
                        filter: ['==', 'extrude', 'true'],
                        type: 'fill-extrusion',
                        minzoom: 14,
                        paint: {
                            'fill-extrusion-color': '#1a1f2e',
                            'fill-extrusion-height': ['get', 'height'],
                            'fill-extrusion-base': ['get', 'min_height'],
                            'fill-extrusion-opacity': 0.6,
                        },
                    }, labelLayer?.id);
                } catch (err) {
                    console.warn('Could not add 3D buildings:', err);
                }
            });
        } catch (err) {
            console.error('Map initialization failed:', err);
            setMapError('Map failed to initialize: ' + err.message);
        }

        return () => {
            if (map.current) { map.current.remove(); map.current = null; }
        };
    }, []);

    // ============================================
    // Load Walking Network from API
    // ============================================
    useEffect(() => {
        if (!mapLoaded || !map.current) return;

        const SURFACE_LABELS = {
            0: 'Concrete/Paved', 1: 'Tar/Asphalt', 2: 'Sand/Gravel', 3: 'Wood/Boardwalk', 4: 'Synthetic/Turf'
        };

        const loadWalkingNetwork = async () => {
            try {
                const response = await routesAPI.getGraph();
                const geojson = response.data;
                if (geojson.features.length === 0) { console.warn('Walking network is empty'); return; }

                if (!map.current.getSource('walkable-source')) {
                    map.current.addSource('walkable-source', { type: 'geojson', data: geojson });
                }

                // Main walking path layer
                if (!map.current.getLayer('walkable-layer')) {
                    map.current.addLayer({
                        id: 'walkable-layer', type: 'line', source: 'walkable-source',
                        paint: {
                            'line-color': [
                                'match', ['get', 'floor_type'],
                                0, FLOOR_COLORS[0], 1, FLOOR_COLORS[1], 2, FLOOR_COLORS[2],
                                3, FLOOR_COLORS[3], 4, FLOOR_COLORS[4], FLOOR_COLORS[0],
                            ],
                            'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 6],
                            'line-opacity': 0.75, 'line-blur': 0.1,
                        },
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                    });
                }

                // Staircase highlight
                if (!map.current.getLayer('stairs-layer')) {
                    map.current.addLayer({
                        id: 'stairs-layer', type: 'line', source: 'walkable-source',
                        filter: ['==', ['get', 'has_steps'], 1],
                        paint: {
                            'line-color': '#FF5252',
                            'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 8],
                            'line-opacity': 0.9, 'line-dasharray': [2, 1],
                        },
                    });
                }

                // Wheelchair accessible
                if (!map.current.getLayer('wheelchair-layer')) {
                    map.current.addLayer({
                        id: 'wheelchair-layer', type: 'line', source: 'walkable-source',
                        filter: ['all', ['!=', ['get', 'has_steps'], 1],
                            ['any', ['==', ['get', 'wheelchair'], 'yes'], ['==', ['get', 'wheelchair'], 'designated']]],
                        paint: {
                            'line-color': '#42A5F5',
                            'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 3],
                            'line-opacity': 0.35,
                            'line-gap-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 6],
                        },
                    });
                }

                // Ramp layer
                if (!map.current.getLayer('ramp-layer')) {
                    map.current.addLayer({
                        id: 'ramp-layer', type: 'line', source: 'walkable-source',
                        filter: ['==', ['get', 'highway'], 'ramp'],
                        paint: {
                            'line-color': '#66BB6A',
                            'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 7],
                            'line-opacity': 0.85,
                        },
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                    });
                }

                // Way name labels
                if (!map.current.getLayer('way-labels')) {
                    map.current.addLayer({
                        id: 'way-labels', type: 'symbol', source: 'walkable-source',
                        filter: ['all', ['has', 'way_name'], ['!=', ['get', 'way_name'], 'unknown'], ['!=', ['get', 'way_name'], '']],
                        minzoom: 16.5,
                        layout: {
                            'symbol-placement': 'line',
                            'text-field': ['get', 'way_name'], 'text-size': 11,
                            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                            'text-max-angle': 30, 'text-allow-overlap': false,
                        },
                        paint: { 'text-color': '#B0BEC5', 'text-halo-color': '#0D1117', 'text-halo-width': 1.5 },
                    });
                }

                // Click popup for path info
                map.current.on('click', 'walkable-layer', (e) => {
                    const f = e.features[0];
                    if (!f) return;
                    const p = f.properties;
                    const surfaceLabel = SURFACE_LABELS[p.floor_type] || p.surface || 'Unknown';
                    const name = p.way_name && p.way_name !== 'unknown' ? p.way_name : '';

                    let html = `<div style="font-family:Inter,sans-serif;font-size:13px;color:#E0E0E0;max-width:220px;">`;
                    if (name) html += `<strong style="font-size:14px;">${name}</strong><br/>`;
                    html += `<span style="color:${FLOOR_COLORS[p.floor_type] || '#546E7A'}">●</span> ${surfaceLabel}`;
                    if (p.surface) html += ` <span style="color:#888;">(${p.surface})</span>`;
                    html += `<br/>`;
                    if (p.distance) html += `📏 ${Math.round(p.distance)}m`;
                    if (p.width) html += ` &nbsp;↔ ${p.width}m wide`;
                    html += `<br/>`;
                    if (p.has_steps === 1) html += `🪜 <span style="color:#FF5252;">Has stairs</span><br/>`;
                    if (p.wheelchair) html += `♿ Wheelchair: <b>${p.wheelchair}</b><br/>`;
                    if (p.bicycle) html += `🚴 Cycling: <b>${p.bicycle}</b><br/>`;
                    if (p.lit === 'yes') html += `💡 Lit at night<br/>`;
                    html += `</div>`;

                    new mapboxgl.Popup({ className: 'path-popup' })
                        .setLngLat(e.lngLat).setHTML(html).addTo(map.current);
                });

                map.current.on('mouseenter', 'walkable-layer', () => { map.current.getCanvas().style.cursor = 'pointer'; });
                map.current.on('mouseleave', 'walkable-layer', () => { map.current.getCanvas().style.cursor = ''; });

                console.log(`Walking network loaded: ${geojson.features.length} edges`);
            } catch (err) {
                console.error('Failed to load walking network:', err);
            }
        };

        loadWalkingNetwork();
    }, [mapLoaded]);

    // ============================================
    // Start GPS tracking & handle campus check
    // ============================================
    useEffect(() => {
        if (!simMode) {
            gps.startTracking();
        }
        return () => gps.stopTracking();
    }, [simMode]);

    // Update position from GPS (only when not in sim mode)
    useEffect(() => {
        if (simMode || !gps.position) return;

        const onCampus = isNearCampus(gps.position);
        setIsOnCampus(onCampus);

        if (onCampus) {
            // User is near campus — use real GPS
            setCurrentPosition(gps.position);
            updateUserMarker(gps.position);
        } else {
            // User is far from campus — set fallback to campus center
            // but show a notice
            const fallback = { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng };
            setCurrentPosition(fallback);
            updateUserMarker(fallback);
        }
    }, [gps.position, simMode]);

    // If GPS fails or is unavailable, set campus fallback immediately
    useEffect(() => {
        if (!currentPosition && mapLoaded) {
            // After a brief delay, if GPS hasn't provided a position, use campus
            const timer = setTimeout(() => {
                if (!currentPosition) {
                    const fallback = { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng };
                    setCurrentPosition(fallback);
                    setIsOnCampus(false);
                    updateUserMarker(fallback);
                }
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [mapLoaded, currentPosition]);

    // ============================================
    // User Marker Management
    // ============================================
    const updateUserMarker = useCallback((pos) => {
        if (!map.current || !pos) return;

        if (!userMarkerObj.current) {
            const el = document.createElement('div');
            el.className = 'user-marker-pulse';
            userMarkerEl.current = el;

            userMarkerObj.current = new mapboxgl.Marker({ element: el })
                .setLngLat([pos.lng, pos.lat])
                .addTo(map.current);

            // Initial fly to position
            map.current.flyTo({ center: [pos.lng, pos.lat], zoom: 17, duration: 1500 });

            // Get weather
            weatherAPI.get(pos.lat, pos.lng)
                .then(res => setWeather(res.data))
                .catch(() => { });
        } else {
            userMarkerObj.current.setLngLat([pos.lng, pos.lat]);
        }
    }, []);

    // ============================================
    // Sync refs with React state
    // ============================================
    useEffect(() => { navStateRef.current.voiceEnabled = voiceEnabled; }, [voiceEnabled]);
    useEffect(() => { navStateRef.current.cameraFollowing = cameraFollowing; }, [cameraFollowing]);

    // ============================================
    // Enable Simulation Mode
    // ============================================
    const enableSimMode = useCallback(() => {
        // Stop real GPS
        gps.stopTracking();

        // Pick a random start point on campus
        const startPt = SIM_START_POINTS[Math.floor(Math.random() * SIM_START_POINTS.length)];
        setCurrentPosition(startPt);
        setIsOnCampus(true);
        setSimMode(true);

        // Update marker
        updateUserMarker(startPt);

        // Fly to campus
        if (map.current) {
            map.current.flyTo({
                center: [startPt.lng, startPt.lat],
                zoom: 17,
                duration: 1500,
            });
        }

        console.log(`🎮 Simulation mode ON — starting at ${startPt.name}`);
    }, [gps, updateUserMarker]);

    const disableSimMode = useCallback(() => {
        stopSimulation();
        setSimMode(false);
        gps.startTracking();
        console.log('🎮 Simulation mode OFF — using real GPS');
    }, [gps]);

    // ============================================
    // Simulation: Walk Along Route
    // ============================================
    const startSimulation = useCallback(() => {
        const nav = navStateRef.current;
        if (!nav.isNavigating || nav.routePoints.length === 0) return;

        simIndexRef.current = nav.lastTrimIndex;
        setSimRunning(true);
        setSimStatus('Walking along route...');

        const tick = () => {
            const nav = navStateRef.current;
            const pts = nav.routePoints;
            if (!nav.isNavigating || simIndexRef.current >= pts.length - 1) {
                setSimStatus('Simulation complete');
                stopSimulation();
                return;
            }

            // ★ PAUSE simulation while voice is speaking — this keeps
            //   the blue dot, text instruction, and voice all in sync
            if (speechBusyRef.current) return;

            // Advance along the route by SIM_SPEED points per tick
            const mode = nav.mode;
            const advance = Math.round((SIM_SPEEDS[mode] || 1) * simSpeed);
            simIndexRef.current = Math.min(simIndexRef.current + advance, pts.length - 1);

            const newPos = pts[simIndexRef.current];
            setCurrentPosition(newPos);
            updateUserMarker(newPos);

            // Update sim status
            const pct = Math.round((simIndexRef.current / (pts.length - 1)) * 100);
            setSimStatus(`Step ${nav.currentStepIndex + 1}/${nav.steps.length} • ${pct}% complete`);
        };

        simIntervalRef.current = setInterval(tick, SIM_TICK_MS);
    }, [simSpeed, updateUserMarker]);

    const stopSimulation = useCallback(() => {
        if (simIntervalRef.current) {
            clearInterval(simIntervalRef.current);
            simIntervalRef.current = null;
        }
        setSimRunning(false);
    }, []);

    /** Move user 20m perpendicular off-route to trigger deviation detection */
    const simulateDeviation = useCallback(() => {
        const nav = navStateRef.current;
        if (!nav.isNavigating || nav.routePoints.length === 0) return;

        // Stop the walking simulation first
        stopSimulation();

        // Get current route point and compute a perpendicular offset of ~20m
        const idx = Math.max(nav.lastTrimIndex, 0);
        const pt = nav.routePoints[idx];

        // 20m offset in latitude (~0.00018 degrees)
        const offsetLat = 0.00020;
        // Alternate direction for visual clarity
        const offRoutePos = {
            lat: pt.lat + offsetLat,
            lng: pt.lng + offsetLat * 0.5,
        };

        setSimStatus('⚠️ Simulating off-route deviation (20m)...');
        setCurrentPosition(offRoutePos);
        updateUserMarker(offRoutePos);
    }, [stopSimulation, updateUserMarker]);

    // Cleanup simulation on unmount
    useEffect(() => {
        return () => { if (simIntervalRef.current) clearInterval(simIntervalRef.current); };
    }, []);

    // ============================================
    // Navigation Engine (runs on position changes)
    // ============================================
    useEffect(() => {
        const nav = navStateRef.current;
        if (!nav.isNavigating || !currentPosition || !map.current) return;

        const routePoints = nav.routePoints;
        if (routePoints.length === 0) return;

        // 1. ARRIVAL CHECK
        const lastPoint = routePoints[routePoints.length - 1];
        const distToDest = haversineDistance(
            currentPosition.lat, currentPosition.lng,
            lastPoint.lat, lastPoint.lng
        );

        if (distToDest < ARRIVAL_THRESHOLD_M) {
            handleArrival();
            return;
        }

        // 2. FIND CLOSEST POINT
        const closestIdx = findClosestPointIndex(currentPosition, routePoints, nav.lastTrimIndex);

        // 3. UPDATE TRACKER
        if (closestIdx > nav.lastTrimIndex) {
            nav.lastTrimIndex = closestIdx;
        }

        // 4. DEVIATION CHECK (works in both real GPS and simulation)
        const distFromRoute = haversineDistance(
            currentPosition.lat, currentPosition.lng,
            routePoints[nav.lastTrimIndex].lat, routePoints[nav.lastTrimIndex].lng
        );
        if (distFromRoute > DEVIATION_TOLERANCE_M) {
            if (simMode) setSimStatus('⚠️ Deviation detected! Auto-rerouting...');
            handleDeviation();
            return;
        }

        // 5. STEP ADVANCEMENT
        checkAndAdvanceStep(nav.lastTrimIndex);

        // 6. ROUTE TRIMMING
        const remaining = routePoints.slice(nav.lastTrimIndex);
        const trimmedCoords = [
            [currentPosition.lng, currentPosition.lat],
            ...remaining.map(p => [p.lng, p.lat])
        ];

        if (map.current.getSource('route-source')) {
            map.current.getSource('route-source').setData({
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: trimmedCoords },
            });
        }

        // 7. UPDATE REMAINING STATS
        updateRemainingStats(nav.lastTrimIndex);

        // 8. CAMERA FOLLOW
        if (nav.cameraFollowing) {
            const nextIdx = Math.min(nav.lastTrimIndex + 5, routePoints.length - 1);
            const bearing = calculateBearing(currentPosition, routePoints[nextIdx]);
            map.current.easeTo({
                center: [currentPosition.lng, currentPosition.lat],
                bearing, pitch: 50, zoom: 18, duration: 800,
            });
        }

    }, [currentPosition, simMode]);

    // ============================================
    // Navigation Helper Functions
    // ============================================

    const checkAndAdvanceStep = useCallback((currentFlattenedIndex) => {
        const nav = navStateRef.current;
        const steps = nav.steps;
        if (steps.length === 0) return;

        const totalOrigPts = steps.reduce((sum, s) => sum + (s.points?.length || 1), 0);
        const ratio = nav.routePoints.length / totalOrigPts;

        // Build step boundary indices (densified)
        const stepBoundaries = [];
        let cumPts = 0;
        for (let i = 0; i < steps.length; i++) {
            cumPts += (steps[i].points?.length || 1);
            stepBoundaries.push(Math.round(cumPts * ratio));
        }

        // Determine which step the user is currently in
        let detectedStep = nav.currentStepIndex;
        for (let i = 0; i < steps.length; i++) {
            if (currentFlattenedIndex < stepBoundaries[i]) {
                detectedStep = i;
                break;
            }
        }

        // ★ When user enters a NEW step → update UI text + speak voice
        //   Both update at the same moment → perfectly in sync.
        //   speak() sets speechBusyRef → simulation pauses → user sees
        //   the marker at the step boundary while hearing the instruction.
        if (detectedStep !== nav.currentStepIndex) {
            nav.currentStepIndex = detectedStep;
            setCurrentStepIndex(detectedStep);

            const instruction = steps[detectedStep].instruction || 'Continue';
            setCurrentInstruction(instruction);
            speak(instruction, nav.voiceEnabled, speechBusyRef);
        }
    }, []);

    const updateRemainingStats = useCallback((trimIndex) => {
        const nav = navStateRef.current;
        const remaining = nav.routePoints.slice(trimIndex);
        let dist = 0;
        for (let i = 0; i < remaining.length - 1; i++) {
            dist += haversineDistance(
                remaining[i].lat, remaining[i].lng,
                remaining[i + 1].lat, remaining[i + 1].lng
            );
        }
        setRemainingDistance(Math.round(dist));
        const speeds = { walk: 1.4, wheelchair: 1.2, cycling: 4.5 };
        setRemainingDuration(Math.round(dist / (speeds[nav.mode] || 1.4)));
    }, []);

    const handleArrival = useCallback(() => {
        const nav = navStateRef.current;
        nav.isNavigating = false;
        setIsNavigating(false);
        setHasArrived(true);
        setCurrentInstruction('You have arrived! 🎉');
        speak('You have arrived at your destination.', nav.voiceEnabled, speechBusyRef);
        stopSimulation();

        // Auto-save route to history
        if (routeResult) {
            routesAPI.saveHistory({
                startNode: routeResult.startNode || 'unknown',
                endNode: routeResult.endNode || 'unknown',
                path: routeResult.path || [],
                distance: routeResult.totalDistance || 0,
                duration: routeResult.totalDuration || 0,
                mode: nav.mode || 'walk',
            }).catch(err => console.warn('Failed to save route history:', err));
        }

        setTimeout(() => setHasArrived(false), 6000);
    }, [stopSimulation, routeResult]);

    const handleDeviation = useCallback(async () => {
        const nav = navStateRef.current;
        if (!nav.destination || !currentPosition) return;

        setIsRerouting(true);
        setCurrentInstruction('Rerouting...');
        speak('Rerouting.', nav.voiceEnabled, speechBusyRef);

        try {
            const response = await routesAPI.calculate(currentPosition, nav.destination, nav.mode);
            const result = response.data;
            if (result.error) { setIsRerouting(false); return; }

            const densified = densifyRoute(result.polyline || [], DENSIFY_SPACING_M);
            nav.routePoints = densified;
            nav.steps = result.steps || [];
            nav.lastTrimIndex = 0;
            nav.currentStepIndex = 0;

            setRouteResult(result);
            setCurrentStepIndex(0);
            drawRoute(result.polyline || []);

            setTimeout(() => {
                if (nav.isNavigating && nav.steps.length > 0) {
                    setCurrentInstruction(nav.steps[0].instruction || 'Continue');
                }
                setIsRerouting(false);
            }, 2000);
        } catch (err) {
            console.error('Reroute error:', err);
            setIsRerouting(false);
        }
    }, [currentPosition]);

    // ============================================
    // Handle Place Selection (search bar + map click)
    // ============================================
    const handlePlaceSelect = useCallback(async (place) => {
        if (!map.current) return;

        // Use currentPosition or fall back to campus center
        const origin = currentPosition || { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng };

        const destPos = { lat: place.lat, lng: place.lng };
        setDestination(destPos);
        setDestinationName(place.name || 'Destination');

        // Ensure we have a position set
        if (!currentPosition) {
            setCurrentPosition(origin);
            updateUserMarker(origin);
        }

        // Add destination marker
        if (destMarker.current) destMarker.current.remove();
        destMarker.current = new mapboxgl.Marker({ color: '#F85149' })
            .setLngLat([place.lng, place.lat])
            .setPopup(new mapboxgl.Popup().setHTML(`<strong>${place.name || 'Destination'}</strong>`))
            .addTo(map.current);

        // Calculate route
        try {
            const response = await routesAPI.calculate(origin, destPos, selectedMode);
            const result = response.data;

            if (result.error) {
                console.error('Route error:', result.error);
                alert(`Could not find route: ${result.error}`);
                return;
            }

            setRouteResult(result);
            setRemainingDistance(Math.round(result.totalDistance));
            setRemainingDuration(Math.round(result.totalDuration));

            drawRoute(result.polyline);

            // Fly to show both origin and destination
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([origin.lng, origin.lat]);
            bounds.extend([place.lng, place.lat]);
            map.current.fitBounds(bounds, { padding: 100, duration: 1500 });
        } catch (err) {
            console.error('Route calculation failed:', err);
            const msg = err.response?.data?.error || err.message || 'Unknown error';
            alert(`Route calculation failed: ${msg}`);
            setRouteResult(null);
        }
    }, [currentPosition, selectedMode, updateUserMarker]);

    // ============================================
    // Map Click → Drop Destination Pin
    // ============================================
    const handleMapClick = useCallback(async (e) => {
        // Don't allow clicking during navigation
        if (navStateRef.current.isNavigating) return;
        if (!map.current) return;

        const { lng, lat } = e.lngLat;

        // Reverse geocode to get a name for the clicked location
        let placeName = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=poi,address&limit=1`
            );
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                placeName = data.features[0].place_name || data.features[0].text || placeName;
            }
        } catch {
            // If reverse geocode fails, use coord-based name
        }

        handlePlaceSelect({ lat, lng, name: placeName });
    }, [handlePlaceSelect]);

    // Register the map click listener
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const onClick = (e) => {
            // Ignore clicks on walkable-layer (those show info popups)
            const features = map.current.queryRenderedFeatures(e.point, { layers: ['walkable-layer'] });
            if (features.length > 0) return;

            handleMapClick(e);
        };

        map.current.on('click', onClick);
        return () => { map.current?.off('click', onClick); };
    }, [mapLoaded, handleMapClick]);

    // ============================================
    // Draw Route Polyline
    // ============================================
    const drawRoute = useCallback((polyline) => {
        if (!map.current || !polyline || polyline.length === 0) return;

        const geojson = {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: polyline.map(p => [p.lng, p.lat]),
            },
        };

        if (map.current.getSource('route-source')) {
            map.current.getSource('route-source').setData(geojson);
        } else {
            map.current.addSource('route-source', { type: 'geojson', data: geojson });
            map.current.addLayer({
                id: 'route-layer', type: 'line', source: 'route-source',
                paint: { 'line-color': '#1A73E8', 'line-width': 6, 'line-opacity': 0.85 },
                layout: { 'line-join': 'round', 'line-cap': 'round' },
            });
        }
    }, []);

    // ============================================
    // Handle Mode Change
    // ============================================
    const handleModeChange = useCallback(async (mode) => {
        setSelectedMode(mode);
        if (!destination || !currentPosition) return;

        try {
            const response = await routesAPI.calculate(currentPosition, destination, mode);
            const result = response.data;
            if (result.error) return;
            setRouteResult(result);
            setRemainingDistance(Math.round(result.totalDistance));
            setRemainingDuration(Math.round(result.totalDuration));
            drawRoute(result.polyline);
        } catch (err) {
            console.error('Mode change route error:', err);
        }
    }, [destination, currentPosition, drawRoute]);

    // ============================================
    // Start Navigation
    // ============================================
    const handleStartNavigation = useCallback(() => {
        if (!routeResult || !destination) return;

        const allPoints = routeResult.polyline || [];
        const densified = densifyRoute(allPoints, DENSIFY_SPACING_M);

        const nav = navStateRef.current;
        nav.isNavigating = true;
        nav.routePoints = densified;
        nav.steps = routeResult.steps || [];
        nav.lastTrimIndex = 0;
        nav.currentStepIndex = 0;
        nav.destination = destination;
        nav.mode = selectedMode;

        setIsNavigating(true);
        setCurrentStepIndex(0);
        setHasArrived(false);
        setCameraFollowing(true);

        if (routeResult.steps.length > 0) {
            const instruction = routeResult.steps[0].instruction;
            setCurrentInstruction(instruction);
            speak(instruction, voiceEnabled, speechBusyRef);
        }

        if (map.current && currentPosition) {
            map.current.easeTo({
                center: [currentPosition.lng, currentPosition.lat],
                zoom: 18, pitch: 50, duration: 1500,
            });
        }
    }, [routeResult, destination, selectedMode, currentPosition, voiceEnabled]);

    // ============================================
    // Clear Route / Stop Navigation
    // ============================================
    const handleClearRoute = useCallback(() => {
        navStateRef.current.isNavigating = false;
        navStateRef.current.routePoints = [];
        navStateRef.current.steps = [];
        navStateRef.current.lastTrimIndex = 0;

        stopSimulation();

        setDestination(null);
        setDestinationName('');
        setRouteResult(null);
        setIsNavigating(false);
        setCurrentInstruction('');
        setCurrentStepIndex(0);
        setHasArrived(false);
        setIsRerouting(false);
        setRemainingDistance(0);
        setRemainingDuration(0);

        window.speechSynthesis?.cancel();

        if (destMarker.current) { destMarker.current.remove(); destMarker.current = null; }

        if (map.current?.getSource('route-source')) {
            map.current.getSource('route-source').setData({ type: 'FeatureCollection', features: [] });
        }

        if (map.current && currentPosition) {
            map.current.easeTo({ pitch: 45, zoom: 16, center: [currentPosition.lng, currentPosition.lat], duration: 1000 });
        }
    }, [currentPosition, stopSimulation]);

    // ============================================
    // Center on User
    // ============================================
    const handleCenterOnUser = useCallback(() => {
        if (!map.current || !currentPosition) return;
        setCameraFollowing(true);
        map.current.flyTo({ center: [currentPosition.lng, currentPosition.lat], zoom: 17, duration: 1000 });
    }, [currentPosition]);

    // Detect manual map interaction
    useEffect(() => {
        if (!map.current) return;
        const onDrag = () => { if (isNavigating) setCameraFollowing(false); };
        map.current.on('dragstart', onDrag);
        return () => { map.current?.off('dragstart', onDrag); };
    }, [isNavigating]);

    return (
        <div className="app-layout">
            {/* Map Error */}
            {mapError && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--color-bg)',
                }}>
                    <div className="card" style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 'var(--space-md)' }}>⚠️</div>
                        <h2 style={{ marginBottom: 'var(--space-sm)' }}>Map Error</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>{mapError}</p>
                        <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
                    </div>
                </div>
            )}

            {/* Map Loading Skeleton */}
            {!mapLoaded && !mapError && (
                <div className="skeleton-map">
                    <div className="skeleton-map-icon">🗺️</div>
                    <div className="spinner" />
                    <div className="skeleton-map-text">Loading map...</div>
                </div>
            )}

            {/* Map */}
            <div className="map-container" ref={mapContainer} />

            {/* Off-campus notice */}
            {!isOnCampus && !simMode && currentPosition && !isNavigating && (
                <div className="off-campus-notice glass">
                    📍 You're not on campus. Position set to Monash Clayton.
                    <button className="btn btn-sm" style={{ marginLeft: 8, background: 'var(--color-primary)', color: '#fff' }}
                        onClick={enableSimMode}>
                        🎮 Use Simulator
                    </button>
                </div>
            )}

            {/* Simulation Controls */}
            {simMode && (
                <div className="sim-controls glass">
                    <div className="sim-header">
                        <span>🎮 Simulation Mode</span>
                        <button className="btn btn-sm btn-secondary" onClick={disableSimMode}>Exit</button>
                    </div>
                    {isNavigating && (
                        <div className="sim-actions">
                            {/* Walk / Pause controls */}
                            <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                {!simRunning ? (
                                    <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={startSimulation}>
                                        ▶ Start Walking
                                    </button>
                                ) : (
                                    <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={stopSimulation}>
                                        ⏸ Pause
                                    </button>
                                )}
                                <button className="btn btn-sm"
                                    style={{ flex: 1, background: 'var(--color-warning)', color: '#000', fontWeight: 600 }}
                                    onClick={simulateDeviation}
                                    title="Move 20m off-route to test deviation detection & auto-reroute">
                                    🔀 Test Deviation
                                </button>
                            </div>

                            {/* Speed selector */}
                            <div className="sim-speed-selector">
                                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginRight: 4 }}>Speed:</span>
                                {[1, 2, 3, 5].map(s => (
                                    <button key={s}
                                        className={`btn btn-sm ${simSpeed === s ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => {
                                            setSimSpeed(s);
                                            if (simRunning) {
                                                stopSimulation();
                                                setTimeout(() => {
                                                    simIntervalRef.current = setInterval(() => {
                                                        const nav = navStateRef.current;
                                                        const pts = nav.routePoints;
                                                        if (!nav.isNavigating || simIndexRef.current >= pts.length - 1) {
                                                            stopSimulation(); return;
                                                        }
                                                        // Pause during voice
                                                        if (speechBusyRef.current) return;
                                                        const advance = Math.round((SIM_SPEEDS[nav.mode] || 1) * s);
                                                        simIndexRef.current = Math.min(simIndexRef.current + advance, pts.length - 1);
                                                        const newPos = pts[simIndexRef.current];
                                                        setCurrentPosition(newPos);
                                                        updateUserMarker(newPos);
                                                        const pct = Math.round((simIndexRef.current / (pts.length - 1)) * 100);
                                                        setSimStatus(`Step ${nav.currentStepIndex + 1}/${nav.steps.length} • ${pct}%`);
                                                    }, SIM_TICK_MS);
                                                    setSimRunning(true);
                                                }, 50);
                                            }
                                        }}
                                    >
                                        {s}x
                                    </button>
                                ))}
                            </div>

                            {/* Sim status */}
                            {simStatus && (
                                <div className="sim-status">
                                    {simStatus}
                                </div>
                            )}
                        </div>
                    )}
                    {!isNavigating && (
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                            Click map or search a place → Start Navigation → ▶ Start Walking
                        </div>
                    )}
                </div>
            )}

            {/* Top Overlay: Search + Weather */}
            <div className="overlay-top">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)' }}>
                    {!isNavigating && <SearchBar onPlaceSelect={handlePlaceSelect} />}

                    {isNavigating && (
                        <div className="nav-instruction-bar glass">
                            <div className="nav-instruction-icon">
                                {isRerouting ? '🔄' : getDirectionIcon(currentInstruction)}
                            </div>
                            <div className="nav-instruction-text">
                                {currentInstruction || 'Navigating...'}
                            </div>
                        </div>
                    )}

                    {weather && (
                        <div className="weather-widget glass">
                            <span>{weather.precipitation > 0 ? '🌧️' : '☀️'}</span>
                            <span className="weather-temp">{weather.temperature}°C</span>
                        </div>
                    )}

                    <div style={{ position: 'relative' }}>
                        <button className="btn btn-icon glass" onClick={() => setShowMenu(!showMenu)} title={user?.name}>👤</button>
                        {showMenu && (
                            <div className="card" style={{ position: 'absolute', right: 0, top: 48, minWidth: 180, zIndex: 20, padding: 'var(--space-md)' }}>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>{user?.name}</div>
                                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>{user?.email}</div>
                                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={logout}>Sign Out</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Rerouting Banner */}
            {isRerouting && (
                <div className="rerouting-banner">
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    <span>Recalculating route...</span>
                </div>
            )}

            {/* Arrival Banner */}
            {hasArrived && (
                <div className="overlay-bottom">
                    <div className="arrival-banner card">
                        <div className="arrival-icon">🎉</div>
                        <div className="arrival-title">You have arrived!</div>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)' }}>{destinationName}</p>
                    </div>
                </div>
            )}

            {/* Bottom Overlay: Navigation Panel */}
            {!hasArrived && (
                <div className="overlay-bottom">
                    <NavigationPanel
                        routeResult={routeResult}
                        destinationName={destinationName}
                        selectedMode={selectedMode}
                        isNavigating={isNavigating}
                        currentInstruction={currentInstruction}
                        currentStepIndex={currentStepIndex}
                        totalSteps={routeResult?.steps?.length || 0}
                        remainingDistance={remainingDistance}
                        remainingDuration={remainingDuration}
                        voiceEnabled={voiceEnabled}
                        onModeChange={handleModeChange}
                        onStartNavigation={handleStartNavigation}
                        onClearRoute={handleClearRoute}
                        onToggleVoice={() => setVoiceEnabled(v => !v)}
                    />
                </div>
            )}

            {/* Floating buttons */}
            {isNavigating && !cameraFollowing && (
                <button className="btn btn-icon glass center-on-user-btn" onClick={handleCenterOnUser} title="Center on my location">📍</button>
            )}
            {isNavigating && (
                <button className="btn btn-icon glass voice-toggle-btn" onClick={() => setVoiceEnabled(v => !v)}
                    title={voiceEnabled ? 'Mute voice' : 'Enable voice'}>
                    {voiceEnabled ? '🔊' : '🔇'}
                </button>
            )}

            {/* Phase 5 Toolbar */}
            {!isNavigating && (
                <div className="phase5-toolbar">
                    <button className="btn btn-icon glass toolbar-btn" onClick={() => setShowQRModal(true)} title="QR Code">
                        📱
                    </button>
                    <button className="btn btn-icon glass toolbar-btn" onClick={() => setShowHistory(!showHistory)} title="Route History">
                        📋
                    </button>
                    {isAdmin && (
                        <button className="btn btn-icon glass toolbar-btn admin-btn" onClick={() => navigate('/admin')} title="Admin Dashboard">
                            ⚙️
                        </button>
                    )}
                </div>
            )}

            {/* QR Code Modal */}
            {showQRModal && (
                <QRCodeModal zoneId={1} onClose={() => setShowQRModal(false)} />
            )}

            {/* Route History Panel */}
            <RouteHistoryPanel
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                onReplayRoute={(route) => {
                    setShowHistory(false);
                    // Could add route replay logic here in future
                }}
            />

            {/* GPS accuracy (real GPS only) */}
            {gps.accuracy && !simMode && isNavigating && (
                <div className="gps-accuracy glass">GPS ±{Math.round(gps.accuracy)}m</div>
            )}

            {/* Legend (only when not navigating) */}
            {!isNavigating && <Legend />}
        </div>
    );
}

function getDirectionIcon(instruction) {
    if (!instruction) return '➡️';
    const lower = instruction.toLowerCase();
    if (lower.includes('left')) return '⬅️';
    if (lower.includes('right')) return '➡️';
    if (lower.includes('straight') || lower.includes('continue')) return '⬆️';
    if (lower.includes('start')) return '🏁';
    if (lower.includes('stair')) return '🪜';
    if (lower.includes('arrived') || lower.includes('destination')) return '🎯';
    return '➡️';
}
