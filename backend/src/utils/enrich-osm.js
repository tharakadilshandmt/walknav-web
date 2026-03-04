/**
 * OSM Data Enrichment Script
 * 
 * Fetches additional tags from OpenStreetMap for edges that have osmid values.
 * Adds: surface, wheelchair, bicycle, width, incline, lit, highway type
 * 
 * Usage: node src/utils/enrich-osm.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const fs = require('fs');
const path = require('path');

const SEED_FILE = path.resolve(__dirname, '../../../database/seed/walkable_network.json');
const OUTPUT_FILE = path.resolve(__dirname, '../../../database/seed/walkable_network_enriched.json');

async function fetchOSMTags(osmIds) {
    // Overpass API query to fetch way tags for given IDs  
    // Process in batches of 200 to avoid URL length limits
    const allTags = new Map();
    const batchSize = 200;

    for (let i = 0; i < osmIds.length; i += batchSize) {
        const batch = osmIds.slice(i, i + batchSize);
        const idList = batch.join(',');

        const query = `[out:json][timeout:60];way(id:${idList});out tags;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

        console.log(`   Fetching OSM batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(osmIds.length / batchSize)} (${batch.length} ways)...`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`   ⚠️ Batch failed (HTTP ${response.status}), retrying in 5s...`);
                await new Promise(r => setTimeout(r, 5000));
                const retry = await fetch(url);
                if (!retry.ok) {
                    console.error(`   ❌ Batch still failed, skipping`);
                    continue;
                }
                const retryData = await retry.json();
                retryData.elements.forEach(el => allTags.set(el.id, el.tags || {}));
                continue;
            }
            const data = await response.json();
            data.elements.forEach(el => allTags.set(el.id, el.tags || {}));
        } catch (err) {
            console.error(`   ❌ Fetch error:`, err.message);
        }

        // Rate limiting: wait 1s between batches
        if (i + batchSize < osmIds.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    return allTags;
}

function mapSurfaceToFloorType(surface) {
    // Map OSM surface tags to our floor_type codes
    const mapping = {
        'asphalt': 1,       // Tar
        'concrete': 0,      // Concrete
        'paved': 0,         // Concrete
        'paving_stones': 0, // Concrete
        'sett': 0,          // Concrete (cobblestones)
        'gravel': 2,        // Sand/Gravel
        'fine_gravel': 2,   // Sand/Gravel
        'sand': 2,          // Sand
        'dirt': 2,          // Sand/earth
        'earth': 2,         // Sand/earth
        'ground': 2,        // Sand/earth
        'compacted': 2,     // Compacted earth
        'wood': 3,          // Wood
        'metal': 3,         // Metal (similar to wood/boardwalk)
        'grass': 4,         // Synthetic/turf
        'rubber': 4,        // Synthetic
        'tartan': 4,        // Synthetic track
        'artificial_turf': 4, // Synthetic
    };
    return mapping[surface] ?? null; // null = don't override existing
}

async function enrich() {
    console.log('🔍 WalkNav OSM Data Enrichment');
    console.log('='.repeat(50));

    // 1. Read existing data
    console.log(`📁 Reading: ${SEED_FILE}`);
    const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    console.log(`   ${data.nodes.length} nodes, ${data.edges.length} edges`);

    // 2. Collect unique osmids
    const osmIds = [...new Set(data.edges.map(e => e.osmid).filter(Boolean))];
    console.log(`\n🌐 Found ${osmIds.length} unique OSM way IDs`);

    // 3. Fetch tags from OSM
    console.log('\n📡 Fetching tags from OpenStreetMap Overpass API...');
    const osmTags = await fetchOSMTags(osmIds);
    console.log(`\n✅ Retrieved tags for ${osmTags.size} ways`);

    // 4. Analyze what OSM data we got
    const tagStats = {};
    for (const [, tags] of osmTags) {
        Object.keys(tags).forEach(k => tagStats[k] = (tagStats[k] || 0) + 1);
    }
    console.log('\n📊 Available OSM tags:');
    const relevantTags = ['surface', 'wheelchair', 'bicycle', 'width', 'incline', 'lit', 'highway', 'footway', 'name', 'access', 'tactile_paving', 'handrail', 'step_count'];
    relevantTags.forEach(tag => {
        if (tagStats[tag]) console.log(`   ${tag}: ${tagStats[tag]} ways`);
    });

    // 5. Enrich edges
    console.log('\n🔧 Enriching edges...');
    let enrichedCount = 0;
    let surfaceUpdated = 0;

    for (const edge of data.edges) {
        if (!edge.osmid || !osmTags.has(edge.osmid)) continue;

        const tags = osmTags.get(edge.osmid);
        enrichedCount++;

        // Add new fields from OSM
        if (tags.surface) {
            edge.surface = tags.surface;
            // Update floor_type if current is default (0) and OSM has better data
            const mappedType = mapSurfaceToFloorType(tags.surface);
            if (mappedType !== null && edge.floor_type === 0) {
                edge.floor_type = mappedType;
                surfaceUpdated++;
            }
        }
        if (tags.wheelchair) edge.wheelchair = tags.wheelchair;
        if (tags.bicycle) edge.bicycle = tags.bicycle;
        if (tags.width) edge.width = parseFloat(tags.width) || null;
        if (tags.incline) edge.incline = tags.incline;
        if (tags.lit) edge.lit = tags.lit;
        if (tags.highway) edge.highway = tags.highway;
        if (tags.access) edge.access = tags.access;
        if (tags.tactile_paving) edge.tactile_paving = tags.tactile_paving;
        if (tags.handrail) edge.handrail = tags.handrail;
        if (tags.step_count) edge.step_count = parseInt(tags.step_count) || null;

        // Infer has_steps from highway=steps if not already set
        if (tags.highway === 'steps' && !edge.has_steps) {
            edge.has_steps = 1;
        }

        // Update way_name from OSM if currently 'unknown'
        if (tags.name && (edge.way_name === 'unknown' || !edge.way_name)) {
            edge.way_name = tags.name;
        }
    }

    console.log(`   Enriched: ${enrichedCount} edges`);
    console.log(`   Surface-updated floor_types: ${surfaceUpdated}`);

    // 6. Post-enrichment stats
    const newFloorTypes = {};
    data.edges.forEach(e => { newFloorTypes[e.floor_type] = (newFloorTypes[e.floor_type] || 0) + 1; });
    console.log('\n📊 Updated floor_type distribution:');
    const names = ['Concrete', 'Tar/Asphalt', 'Sand/Gravel', 'Wood', 'Synthetic'];
    Object.entries(newFloorTypes).sort((a, b) => a[0] - b[0]).forEach(([k, v]) => {
        console.log(`   ${names[k] || 'Unknown'}: ${v} edges`);
    });

    const wheelchairStats = {};
    data.edges.forEach(e => { if (e.wheelchair) wheelchairStats[e.wheelchair] = (wheelchairStats[e.wheelchair] || 0) + 1; });
    if (Object.keys(wheelchairStats).length > 0) {
        console.log('\n♿ Wheelchair accessibility:');
        Object.entries(wheelchairStats).forEach(([k, v]) => console.log(`   ${k}: ${v} edges`));
    }

    const bicycleStats = {};
    data.edges.forEach(e => { if (e.bicycle) bicycleStats[e.bicycle] = (bicycleStats[e.bicycle] || 0) + 1; });
    if (Object.keys(bicycleStats).length > 0) {
        console.log('\n🚴 Bicycle access:');
        Object.entries(bicycleStats).forEach(([k, v]) => console.log(`   ${k}: ${v} edges`));
    }

    // 7. Save enriched data
    console.log('\n💾 Saving enriched data...');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`   Saved to: ${OUTPUT_FILE}`);

    // Also overwrite original for next seed
    fs.writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));
    console.log(`   Also updated original: ${SEED_FILE}`);

    console.log('\n✅ Enrichment complete!\n');
}

enrich().catch(err => {
    console.error('❌ Enrichment failed:', err);
    process.exit(1);
});
