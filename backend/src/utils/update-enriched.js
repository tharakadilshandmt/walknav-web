/**
 * Quick update script — adds enriched OSM data to existing edges in DB
 * without deleting/re-creating them.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://walknav_user:walknav_dev_pass@localhost:5432/walknav';
const SEED_FILE = path.resolve(__dirname, '../../../database/seed/walkable_network.json');

async function update() {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

    console.log('🔧 Updating edges with enriched OSM data...');
    let updated = 0;
    let skipped = 0;

    for (const edge of data.edges) {
        const edgeId = edge.id || `edge_${edge.from}_${edge.to}`;

        // Only update if there's enriched data
        if (!edge.surface && !edge.wheelchair && !edge.bicycle && !edge.highway && !edge.way_name) {
            skipped++;
            continue;
        }

        try {
            await pool.query(
                `UPDATE edges SET 
                    floor_type = $2,
                    surface = $3,
                    wheelchair = $4,
                    bicycle = $5,
                    highway = $6,
                    width = $7,
                    lit = $8,
                    incline = $9,
                    way_name = $10,
                    osmid = $11
                WHERE id = $1`,
                [
                    edgeId,
                    edge.floor_type || 0,
                    edge.surface || null,
                    edge.wheelchair || null,
                    edge.bicycle || null,
                    edge.highway || null,
                    edge.width || null,
                    edge.lit || null,
                    edge.incline || null,
                    edge.way_name || null,
                    edge.osmid || null,
                ]
            );
            updated++;
        } catch (err) {
            skipped++;
        }

        if ((updated + skipped) % 500 === 0) {
            process.stdout.write(`\r   Progress: ${updated + skipped}/${data.edges.length}`);
        }
    }

    console.log(`\n✅ Updated: ${updated}, Skipped: ${skipped}`);

    // Verify
    const stats = await pool.query(`
        SELECT 
            COUNT(*) FILTER (WHERE surface IS NOT NULL) AS with_surface,
            COUNT(*) FILTER (WHERE wheelchair IS NOT NULL) AS with_wheelchair,
            COUNT(*) FILTER (WHERE bicycle IS NOT NULL) AS with_bicycle,
            COUNT(*) FILTER (WHERE highway IS NOT NULL) AS with_highway,
            COUNT(*) FILTER (WHERE way_name IS NOT NULL AND way_name != 'unknown') AS with_name
        FROM edges
    `);
    console.log('📊 Enriched columns:', stats.rows[0]);

    const ftStats = await pool.query(`SELECT floor_type, COUNT(*) as cnt FROM edges GROUP BY floor_type ORDER BY floor_type`);
    console.log('📊 Floor types:', ftStats.rows.map(r => `${r.floor_type}:${r.cnt}`).join(', '));

    await pool.end();
}

update().catch(console.error);
