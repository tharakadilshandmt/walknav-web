const MODE_ICONS = {
    walk: '🚶',
    wheelchair: '♿',
    cycling: '🚴',
};

function formatDistance(meters) {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
    if (seconds >= 3600) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.round((seconds % 3600) / 60);
        return `${hrs}h ${mins}m`;
    }
    const mins = Math.round(seconds / 60);
    return `${mins} min`;
}

export default function NavigationPanel({
    routeResult,
    destinationName,
    selectedMode,
    isNavigating,
    currentInstruction,
    currentStepIndex,
    totalSteps,
    remainingDistance,
    remainingDuration,
    voiceEnabled,
    onModeChange,
    onStartNavigation,
    onClearRoute,
    onToggleVoice,
}) {
    if (!routeResult) return null;

    const distance = isNavigating ? remainingDistance : routeResult.totalDistance;
    const duration = isNavigating ? remainingDuration : routeResult.totalDuration;

    return (
        <div className="nav-panel card">
            {/* Mode Selector (only before navigation starts) */}
            {!isNavigating && (
                <div className="mode-selector">
                    {['walk', 'wheelchair', 'cycling'].map((mode) => (
                        <button
                            key={mode}
                            className={`mode-btn ${selectedMode === mode ? 'active' : ''}`}
                            onClick={() => onModeChange(mode)}
                        >
                            {MODE_ICONS[mode]} {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                    ))}
                </div>
            )}

            {/* Step Progress (during navigation) */}
            {isNavigating && totalSteps > 0 && (
                <div className="step-progress">
                    <div className="step-progress-bar">
                        <div
                            className="step-progress-fill"
                            style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
                        />
                    </div>
                    <span className="step-progress-label">
                        Step {currentStepIndex + 1} of {totalSteps}
                    </span>
                </div>
            )}

            {/* Route Stats */}
            <div className="nav-stats">
                <div className="nav-stat">
                    <div className="nav-stat-value">{formatDistance(distance)}</div>
                    <div className="nav-stat-label">{isNavigating ? 'Remaining' : 'Distance'}</div>
                </div>
                <div className="nav-stat">
                    <div className="nav-stat-value">{formatDuration(duration)}</div>
                    <div className="nav-stat-label">{isNavigating ? 'ETA' : 'Duration'}</div>
                </div>
                <div className="nav-stat">
                    <div className="nav-stat-value">{MODE_ICONS[selectedMode]}</div>
                    <div className="nav-stat-label">{selectedMode}</div>
                </div>
            </div>

            {/* Destination Name */}
            {!isNavigating && destinationName && (
                <div style={{
                    textAlign: 'center',
                    padding: '0 var(--space-md)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                }}>
                    To: <strong style={{ color: 'var(--color-text)' }}>{destinationName}</strong>
                </div>
            )}

            {/* Step List (collapsible during navigation) */}
            {isNavigating && routeResult.steps && routeResult.steps.length > 0 && (
                <div className="step-list">
                    {routeResult.steps.map((step, idx) => (
                        <div
                            key={idx}
                            className={`step-item ${idx === currentStepIndex ? 'active' : ''} ${idx < currentStepIndex ? 'completed' : ''}`}
                        >
                            <span className="step-icon">
                                {idx < currentStepIndex ? '✅' : idx === currentStepIndex ? '➡️' : '○'}
                            </span>
                            <span className="step-text">{step.instruction}</span>
                            <span className="step-dist">{formatDistance(step.distance)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="nav-actions">
                {!isNavigating ? (
                    <>
                        <button className="btn btn-primary" onClick={onStartNavigation}>
                            🧭 Start Navigation
                        </button>
                        <button className="btn btn-secondary" onClick={onClearRoute}>
                            ✕ Cancel
                        </button>
                    </>
                ) : (
                    <button className="btn btn-danger" onClick={onClearRoute}>
                        ⬛ Stop Navigation
                    </button>
                )}
            </div>
        </div>
    );
}
