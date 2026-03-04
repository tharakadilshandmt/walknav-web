import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for continuous GPS tracking via the browser Geolocation API.
 * 
 * Features:
 *   - watchPosition with high accuracy
 *   - Heading and accuracy tracking
 *   - Graceful error handling (permission denied, timeout, unavailable)
 *   - Start/stop control
 * 
 * Usage:
 *   const { position, accuracy, heading, isTracking, error, startTracking, stopTracking } = useGPSTracking();
 */
export default function useGPSTracking() {
    const [position, setPosition] = useState(null);      // { lat, lng }
    const [accuracy, setAccuracy] = useState(null);       // meters
    const [heading, setHeading] = useState(null);         // degrees (0 = north)
    const [isTracking, setIsTracking] = useState(false);
    const [error, setError] = useState(null);
    const watchIdRef = useRef(null);

    const handlePosition = useCallback((pos) => {
        const { latitude, longitude, accuracy: acc, heading: hdg } = pos.coords;
        setPosition({ lat: latitude, lng: longitude });
        setAccuracy(acc);
        setHeading(hdg !== null && !isNaN(hdg) ? hdg : null);
        setError(null);
    }, []);

    const handleError = useCallback((err) => {
        switch (err.code) {
            case err.PERMISSION_DENIED:
                setError('Location permission denied. Please enable location access.');
                break;
            case err.POSITION_UNAVAILABLE:
                setError('Location unavailable. Check GPS/Wi-Fi.');
                break;
            case err.TIMEOUT:
                setError('Location request timed out.');
                break;
            default:
                setError('Unknown location error.');
        }
    }, []);

    const startTracking = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser.');
            return;
        }

        if (watchIdRef.current !== null) return; // Already tracking

        const watchId = navigator.geolocation.watchPosition(
            handlePosition,
            handleError,
            {
                enableHighAccuracy: true,
                maximumAge: 2000,       // Accept cached positions up to 2s old
                timeout: 10000,         // Wait up to 10s for a position
            }
        );

        watchIdRef.current = watchId;
        setIsTracking(true);
        setError(null);
    }, [handlePosition, handleError]);

    const stopTracking = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsTracking(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, []);

    return {
        position,
        accuracy,
        heading,
        isTracking,
        error,
        startTracking,
        stopTracking,
    };
}
