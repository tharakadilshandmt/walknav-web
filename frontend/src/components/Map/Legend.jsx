const TERRAIN_TYPES = [
    { color: '#546E7A', label: 'Concrete' },
    { color: '#0D0D0D', label: 'Tar', border: '#333' },
    { color: '#D1B41C', label: 'Sand/Gravel' },
    { color: '#8D6E63', label: 'Wood' },
    { color: '#00E676', label: 'Synthetic' },
];

const SPECIAL_TYPES = [
    { color: '#FF5252', label: 'Stairs', dashed: true },
    { color: '#66BB6A', label: 'Ramp' },
    { color: '#42A5F5', label: 'Wheelchair ♿', glow: true },
];

export default function Legend() {
    return (
        <div className="legend">
            <div className="glass legend-content">
                <div className="legend-title">Surfaces</div>
                {TERRAIN_TYPES.map((type) => (
                    <div key={type.label} className="legend-item">
                        <div
                            className="legend-color"
                            style={{
                                backgroundColor: type.color,
                                border: type.border ? `1px solid ${type.border}` : 'none',
                            }}
                        />
                        <span className="legend-label">{type.label}</span>
                    </div>
                ))}
                <div className="legend-title" style={{ marginTop: 6 }}>Accessibility</div>
                {SPECIAL_TYPES.map((type) => (
                    <div key={type.label} className="legend-item">
                        <div
                            className="legend-color"
                            style={{
                                backgroundColor: type.color,
                                opacity: type.glow ? 0.5 : 1,
                                borderRadius: type.dashed ? 0 : 2,
                                backgroundImage: type.dashed
                                    ? `repeating-linear-gradient(90deg, ${type.color} 0px, ${type.color} 6px, transparent 6px, transparent 10px)`
                                    : 'none',
                                ...(type.dashed ? { backgroundColor: 'transparent' } : {}),
                            }}
                        />
                        <span className="legend-label">{type.label}</span>
                    </div>
                ))}
                <div className="legend-hint">Click a path for details</div>
            </div>
        </div>
    );
}
