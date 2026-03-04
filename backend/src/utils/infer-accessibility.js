/**
 * Infer Accessibility Script
 * 
 * Since OSM doesn't have explicit wheelchair/ramp tags for Monash walkways,
 * we infer accessibility from physical attributes per the SRS requirements:
 * 
 * Wheelchair: Avoid stairs, steep slopes, uneven terrain (sand/gravel)
 * Cycling: Avoid stairs, narrow paths
 * Walk: All terrain allowed
 * 
 * Also infers "ramp" for stair-adjacent smooth paths (common campus pattern).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://walknav_user:walknav_dev_pass@localhost:5432/walknav';

async function infer() {
    const pool = new Pool({ connectionString: DATABASE_URL });
    console.log('♿ Inferring accessibility from physical attributes...');

    // 1. Infer wheelchair accessibility
    // YES: paved surfaces (concrete, asphalt, paving_stones), footway/pedestrian, no stairs
    // NO: stairs, sand/gravel, narrow paths
    // LIMITED: compacted surfaces, paths without surface data
    const wheelchairYes = await pool.query(`
        UPDATE edges SET wheelchair = 'yes' 
        WHERE has_steps = 0 
        AND highway NOT IN ('steps') 
        AND floor_type IN (0, 1, 4)  -- concrete, tar, synthetic
        AND (surface IS NULL OR surface IN ('asphalt', 'concrete', 'paving_stones', 'paved'))
        AND wheelchair IS NULL
    `);
    console.log(`   wheelchair=yes: ${wheelchairYes.rowCount} edges (smooth paved, no stairs)`);

    const wheelchairLimited = await pool.query(`
        UPDATE edges SET wheelchair = 'limited'
        WHERE has_steps = 0
        AND highway NOT IN ('steps')
        AND floor_type IN (0, 1)
        AND surface IN ('concrete:plates', 'compacted')
        AND wheelchair IS NULL
    `);
    console.log(`   wheelchair=limited: ${wheelchairLimited.rowCount} edges (rough paved, no stairs)`);

    const wheelchairNo = await pool.query(`
        UPDATE edges SET wheelchair = 'no'
        WHERE (has_steps = 1 OR highway = 'steps' OR floor_type IN (2, 3))
        AND wheelchair IS NULL
    `);
    console.log(`   wheelchair=no: ${wheelchairNo.rowCount} edges (stairs, sand, gravel, wood)`);

    // 2. Infer bicycle accessibility
    const bicycleYes = await pool.query(`
        UPDATE edges SET bicycle = 'yes'
        WHERE has_steps = 0
        AND highway NOT IN ('steps')
        AND floor_type IN (0, 1, 4)  -- concrete, tar, synthetic
        AND bicycle IS NULL
    `);
    console.log(`\n   bicycle=yes: ${bicycleYes.rowCount} edges (smooth, no stairs)`);

    const bicycleNo = await pool.query(`
        UPDATE edges SET bicycle = 'no'
        WHERE (has_steps = 1 OR highway = 'steps')
        AND bicycle IS NULL
    `);
    console.log(`   bicycle=no: ${bicycleNo.rowCount} edges (stairs)`);

    const bicycleDismount = await pool.query(`
        UPDATE edges SET bicycle = 'dismount'
        WHERE has_steps = 0
        AND floor_type IN (2, 3)  -- sand, wood
        AND bicycle IS NULL
    `);
    console.log(`   bicycle=dismount: ${bicycleDismount.rowCount} edges (sand/wood)`);

    // 3. Detect potential ramp locations
    // Ramps in campuses are typically: smooth paved paths near stairs with slight incline
    // We look for edges that connect to stair endpoints and are paved
    const rampCandidates = await pool.query(`
        UPDATE edges SET highway = 'ramp'
        WHERE id IN (
            SELECT DISTINCT e2.id
            FROM edges e1
            JOIN edges e2 ON (e2.source_node = e1.source_node OR e2.source_node = e1.target_node
                           OR e2.target_node = e1.source_node OR e2.target_node = e1.target_node)
            WHERE e1.has_steps = 1
            AND e2.has_steps = 0
            AND e2.floor_type IN (0, 1)  -- concrete/tar
            AND e2.highway IS NULL OR e2.highway IN ('footway', 'path')
            AND e2.length < 50  -- short segments near stairs are likely ramps
        )
        AND has_steps = 0
        AND highway NOT IN ('pedestrian', 'service', 'unclassified', 'tertiary', 'steps')
    `);
    console.log(`\n   Potential ramps: ${rampCandidates.rowCount} edges (paved paths adjacent to stairs, <50m)`);

    // 4. Print summary
    const summary = await pool.query(`
        SELECT 
            COUNT(*) FILTER (WHERE wheelchair = 'yes') AS wheelchair_yes,
            COUNT(*) FILTER (WHERE wheelchair = 'limited') AS wheelchair_limited,
            COUNT(*) FILTER (WHERE wheelchair = 'no') AS wheelchair_no,
            COUNT(*) FILTER (WHERE bicycle = 'yes') AS bicycle_yes,
            COUNT(*) FILTER (WHERE bicycle = 'no') AS bicycle_no,
            COUNT(*) FILTER (WHERE bicycle = 'dismount') AS bicycle_dismount,
            COUNT(*) FILTER (WHERE bicycle = 'designated') AS bicycle_designated,
            COUNT(*) FILTER (WHERE highway = 'ramp') AS ramps,
            COUNT(*) FILTER (WHERE highway = 'steps') AS stairs
        FROM edges
    `);
    console.log('\n📊 Final Accessibility Summary:');
    const s = summary.rows[0];
    console.log(`   ♿ Wheelchair: ${s.wheelchair_yes} yes, ${s.wheelchair_limited} limited, ${s.wheelchair_no} no`);
    console.log(`   🚴 Bicycle: ${s.bicycle_yes} yes, ${s.bicycle_designated} designated, ${s.bicycle_dismount} dismount, ${s.bicycle_no} no`);
    console.log(`   🪜 Stairs: ${s.stairs}`);
    console.log(`   🔲 Ramps: ${s.ramps}`);

    await pool.end();
    console.log('\n✅ Accessibility inference complete!');
}

infer().catch(console.error);
