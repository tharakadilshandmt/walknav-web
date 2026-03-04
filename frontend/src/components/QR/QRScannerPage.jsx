import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';

export default function QRScannerPage() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const scanIntervalRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);
    const [manualUrl, setManualUrl] = useState('');
    const [scannedResult, setScannedResult] = useState(null);
    const navigate = useNavigate();

    const stopCamera = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    const handleScannedUrl = useCallback((url) => {
        try {
            const parsed = new URL(url);
            const zoneParam = parsed.searchParams.get('zone');
            if (zoneParam) {
                setScannedResult({ url, zoneId: zoneParam });
                stopCamera();
                // Navigate after brief delay to show result
                setTimeout(() => {
                    navigate(`/?zone=${zoneParam}`);
                }, 1500);
            }
        } catch {
            // Not a valid URL
        }
    }, [navigate, stopCamera]);

    const startScanning = useCallback((video) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Use BarcodeDetector if available (Chrome/Edge with HTTPS), else jsQR
        if ('BarcodeDetector' in window) {
            try {
                const detector = new BarcodeDetector({ formats: ['qr_code'] });
                scanIntervalRef.current = setInterval(async () => {
                    if (!video || video.readyState < 2) return;
                    try {
                        const barcodes = await detector.detect(video);
                        if (barcodes.length > 0) {
                            handleScannedUrl(barcodes[0].rawValue);
                        }
                    } catch { /* scan frame error, ignore */ }
                }, 400);
                return;
            } catch {
                // BarcodeDetector constructor failed, fall through to jsQR
            }
        }

        // Fallback: jsQR canvas-based decoding (works in ALL browsers)
        scanIntervalRef.current = setInterval(() => {
            if (!video || video.readyState < 2) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
                handleScannedUrl(code.data);
            }
        }, 300);
    }, [handleScannedUrl]);

    const startCamera = useCallback(async () => {
        setError(null);

        // Progressive camera access — try multiple configurations:
        // 1. Rear camera (ideal for scanning on phones)
        // 2. Front camera (for laptops/desktops)
        // 3. Any available camera
        const cameraConfigs = [
            { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
            { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            { width: { ideal: 640 }, height: { ideal: 480 } },
            true,  // absolute fallback — any video device, any resolution
        ];

        let stream = null;
        let lastError = null;

        for (const videoConfig of cameraConfigs) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: videoConfig });
                break; // Success — stop trying
            } catch (err) {
                lastError = err;
                // Continue to next config
            }
        }

        if (stream) {
            streamRef.current = stream;
            const video = videoRef.current;
            if (video) {
                video.srcObject = stream;
                await video.play();
            }
            setScanning(true);
            startScanning(video);
        } else {
            // All camera configs failed
            const err = lastError;
            if (err?.name === 'NotAllowedError') {
                setError('Camera permission was denied. Please allow camera access in your browser settings to scan QR codes.');
            } else if (err?.name === 'NotFoundError' || err?.name === 'NotReadableError') {
                setError('No camera detected on this device. This feature works best on phones and laptops with a webcam. You can use the manual URL entry below instead.');
            } else if (err?.message?.includes('Could not start video source')) {
                setError('Could not access your camera — it may be in use by another app. Close other apps using the camera and try again.');
            } else {
                setError(`Camera unavailable: ${err?.message || 'Unknown error'}. You can enter the zone URL manually below.`);
            }
            setScanning(false);
        }
    }, [startScanning]);

    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, [startCamera, stopCamera]);

    const handleManualSubmit = (e) => {
        e.preventDefault();
        if (manualUrl.trim()) {
            handleScannedUrl(manualUrl.trim());
        }
    };

    return (
        <div className="qr-scanner-page">
            <div className="qr-scanner-header">
                <button className="qr-scanner-back" onClick={() => navigate('/')}>← Back to Map</button>
                <h1>Scan QR Code</h1>
            </div>

            {scannedResult ? (
                <div className="qr-scanner-result">
                    <div className="qr-scanner-success">✅</div>
                    <h2>QR Code Scanned!</h2>
                    <p>Navigating to zone {scannedResult.zoneId}...</p>
                </div>
            ) : (
                <>
                    <div className="qr-scanner-viewport">
                        <video ref={videoRef} className="qr-scanner-video" playsInline muted />
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                        {scanning && (
                            <div className="qr-scanner-overlay">
                                <div className="qr-scanner-frame" />
                                <p className="qr-scanner-hint">Point your camera at a WalkNav QR code</p>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="qr-scanner-error">
                            <p>{error}</p>
                        </div>
                    )}

                    <div className="qr-scanner-manual">
                        <p>Or enter the zone URL manually:</p>
                        <form onSubmit={handleManualSubmit} className="qr-scanner-form">
                            <input
                                type="url"
                                value={manualUrl}
                                onChange={e => setManualUrl(e.target.value)}
                                placeholder="https://walknav.app/?zone=1"
                                className="qr-scanner-input"
                            />
                            <button type="submit" className="qr-scanner-submit">Go →</button>
                        </form>
                    </div>
                </>
            )}
        </div>
    );
}
