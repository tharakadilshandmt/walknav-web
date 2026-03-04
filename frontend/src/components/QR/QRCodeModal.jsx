import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

/**
 * QR Code Modal — generates a QR code CLIENT-SIDE that encodes the WalkNav URL.
 * 
 * HOW IT WORKS (simple explanation):
 * 1. Takes the current app URL (e.g. http://localhost:5173/?zone=1)
 * 2. Converts that URL into a QR code image (a scannable square barcode)
 * 3. Anyone who scans this QR code with their phone camera will be taken
 *    to this same page — useful for sharing navigation starting points
 * 
 * Use case: Print QR codes and place them at building entrances/bus stops
 * so visitors can scan and instantly get walking directions.
 */
export default function QRCodeModal({ zoneId = 1, onClose }) {
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // The URL that will be encoded in the QR code
    const zoneUrl = `${window.location.origin}/?zone=${zoneId}`;
    const zoneName = 'Monash University Clayton';

    useEffect(() => {
        // Generate QR code entirely in the browser (no backend call needed)
        QRCode.toDataURL(zoneUrl, {
            width: 400,
            margin: 2,
            color: {
                dark: '#00E5FF',   // Cyan dots (matches our app theme)
                light: '#0A0E17',  // Dark background
            },
            errorCorrectionLevel: 'M',
        })
            .then(url => {
                setQrDataUrl(url);
                setLoading(false);
            })
            .catch(err => {
                console.error('QR generation error:', err);
                setLoading(false);
            });
    }, [zoneUrl]);

    const handleDownload = () => {
        if (!qrDataUrl) return;
        // Convert data URL to Blob so browsers respect the download filename
        const byteString = atob(qrDataUrl.split(',')[1]);
        const mimeType = qrDataUrl.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.download = `walknav-qr-zone-${zoneId}.png`;
        link.href = blobUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(zoneUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = zoneUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="qr-modal-backdrop" onClick={onClose}>
            <div className="qr-modal" onClick={e => e.stopPropagation()}>
                <button className="qr-modal-close" onClick={onClose}>✕</button>

                <h2 className="qr-modal-title">📱 Zone QR Code</h2>

                {loading ? (
                    <div className="qr-loading">
                        <div className="spinner" />
                        <p>Generating QR code...</p>
                    </div>
                ) : qrDataUrl ? (
                    <>
                        <p className="qr-zone-name">{zoneName}</p>
                        <div className="qr-image-container">
                            <img
                                src={qrDataUrl}
                                alt={`QR code for ${zoneName}`}
                                className="qr-image"
                            />
                        </div>
                        <p className="qr-url">{zoneUrl}</p>
                        <div className="qr-actions">
                            <button className="qr-btn qr-btn-download" onClick={handleDownload}>
                                ⬇️ Download PNG
                            </button>
                            <button className="qr-btn qr-btn-copy" onClick={handleCopy}>
                                {copied ? '✅ Copied!' : '📋 Copy URL'}
                            </button>
                        </div>
                        <p className="qr-hint">
                            Print this QR code and place it at building entrances — visitors can scan to get instant walking directions!
                        </p>
                    </>
                ) : (
                    <p className="qr-error">Failed to generate QR code</p>
                )}
            </div>
        </div>
    );
}
