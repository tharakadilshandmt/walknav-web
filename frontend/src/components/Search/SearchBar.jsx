import { useState, useCallback, useRef } from 'react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export default function SearchBar({ onPlaceSelect }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);
    const sessionToken = useRef(crypto.randomUUID());

    const searchPlaces = useCallback(async (q) => {
        if (q.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken.current}&language=en&limit=5&proximity=145.134,-37.910`;
            const res = await fetch(url);
            const data = await res.json();
            setResults(data.suggestions || []);
        } catch (err) {
            console.error('Search error:', err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleInputChange = (e) => {
        const value = e.target.value;
        setQuery(value);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchPlaces(value), 300);
    };

    const handleSelect = async (suggestion) => {
        setQuery(suggestion.name || '');
        setResults([]);

        // Get full details (coordinates)
        try {
            const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken.current}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.features?.length > 0) {
                const [lng, lat] = data.features[0].geometry.coordinates;
                onPlaceSelect({
                    lat,
                    lng,
                    name: suggestion.name,
                    address: suggestion.full_address || suggestion.address,
                });
            }
        } catch (err) {
            console.error('Place details error:', err);
        }

        // Start new session
        sessionToken.current = crypto.randomUUID();
    };

    const handleClear = () => {
        setQuery('');
        setResults([]);
    };

    return (
        <div className="search-container" style={{ flex: 1 }}>
            <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input
                    id="place-search"
                    className="input"
                    type="text"
                    placeholder="Search for a place..."
                    value={query}
                    onChange={handleInputChange}
                    autoComplete="off"
                />
                {query && (
                    <button className="search-clear" onClick={handleClear}>✕</button>
                )}
            </div>

            {results.length > 0 && (
                <div className="search-results">
                    {results.map((suggestion, idx) => (
                        <div
                            key={suggestion.mapbox_id || idx}
                            className="search-result-item"
                            onClick={() => handleSelect(suggestion)}
                        >
                            <span>📍</span>
                            <div>
                                <div className="search-result-name">{suggestion.name}</div>
                                <div className="search-result-address">
                                    {suggestion.full_address || suggestion.address || ''}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
