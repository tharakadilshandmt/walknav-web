/**
 * WalkNav Database Seed Script
 * 
 * Reads walkable_network.json and populates the PostgreSQL + PostGIS database
 * with nodes and edges, converting them to proper spatial geometries.
 * 
 * Usage:
 *   cd backend && npm run seed
 *   OR
 *   docker exec walknav-backend npm run seed
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://walknav_user:walknav_dev_pass@localhost:5432/walknav';
const SEED_FILE = path.resolve(__dirname, '../../../database/seed/walkable_network.json');

// Batch size for bulk inserts (prevents memory issues with large datasets)
const BATCH_SIZE = 500;

async function seed() {
    const pool = new Pool({ connectionString: DATABASE_URL });

    console.log('🌱 WalkNav Database Seeder');
    console.log('='.repeat(50));
    console.log(`📁 Reading: ${SEED_FILE}`);

    // 1. Read the JSON file
    let data;
    try {
        const raw = fs.readFileSync(SEED_FILE, 'utf8');
        data = JSON.parse(raw);
        console.log(`✅ Parsed JSON: ${data.nodes.length} nodes, ${data.edges.length} edges`);
    } catch (err) {
        console.error('❌ Failed to read walkable_network.json:', err.message);
        process.exit(1);
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 2. Clear existing data (idempotent re-seeding)
        console.log('\n🗑️  Clearing existing nodes and edges...');
        await client.query('DELETE FROM edges');
        await client.query('DELETE FROM nodes');

        // 3. Get the default zone ID (Monash Clayton)
        const zoneResult = await client.query(
            "SELECT zone_id FROM navigation_zones WHERE name = 'Monash University Clayton' LIMIT 1"
        );
        const zoneId = zoneResult.rows.length > 0 ? zoneResult.rows[0].zone_id : null;
        console.log(`📍 Zone ID: ${zoneId || 'none (will be NULL)'}`);

        // 4. Insert Nodes in batches
        console.log(`\n📌 Inserting ${data.nodes.length} nodes...`);
        let nodesInserted = 0;

        for (let i = 0; i < data.nodes.length; i += BATCH_SIZE) {
            const batch = data.nodes.slice(i, i + BATCH_SIZE);

            // Build a multi-row INSERT
            const values = [];
            const params = [];

            batch.forEach((node, idx) => {
                const offset = idx * 4;
                values.push(`($${offset + 1}, $${offset + 2}, ST_SetSRID(ST_MakePoint($${offset + 3}, $${offset + 4}), 4326))`);
                params.push(node.id, zoneId, node.lng, node.lat);
            });

            const sql = `INSERT INTO nodes (id, zone_id, geom) VALUES ${values.join(', ')} ON CONFLICT (id) DO NOTHING`;
            await client.query(sql, params);

            nodesInserted += batch.length;
            process.stdout.write(`\r   Progress: ${nodesInserted}/${data.nodes.length} nodes`);
        }
        console.log(`\n✅ ${nodesInserted} nodes inserted`);

        // 5. Insert Edges in batches
        console.log(`\n🔗 Inserting ${data.edges.length} edges...`);
        let edgesInserted = 0;
        let edgesSkipped = 0;

        for (let i = 0; i < data.edges.length; i += BATCH_SIZE) {
            const batch = data.edges.slice(i, i + BATCH_SIZE);

            for (const edge of batch) {
                try {
                    // Build LineString WKT from polyline points
                    const polyline = edge.polyline || [];
                    if (polyline.length < 2) {
                        edgesSkipped++;
                        continue;
                    }

                    const lineCoords = polyline.map(p => `${p.lng} ${p.lat}`).join(', ');
                    const lineWkt = `LINESTRING(${lineCoords})`;

                    // Generate edge ID if not present
                    const edgeId = edge.id || `edge_${edge.from}_${edge.to}`;

                    await client.query(
                        `INSERT INTO edges (id, source_node, target_node, geom, length, floor_type, has_steps, surface, wheelchair, bicycle, highway, width, lit, incline, way_name, osmid)
             VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromText($4), 4326), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (id) DO UPDATE SET floor_type = EXCLUDED.floor_type, has_steps = EXCLUDED.has_steps, surface = EXCLUDED.surface, wheelchair = EXCLUDED.wheelchair, bicycle = EXCLUDED.bicycle, highway = EXCLUDED.highway, width = EXCLUDED.width, lit = EXCLUDED.lit, incline = EXCLUDED.incline, way_name = EXCLUDED.way_name, osmid = EXCLUDED.osmid`,
                        [
                            edgeId,
                            edge.from,
                            edge.to,
                            lineWkt,
                            edge.distance || 0,
                            edge.floor_type || 0,
                            edge.has_steps || 0,
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

                    edgesInserted++;
                } catch (edgeErr) {
                    edgesSkipped++;
                    // Only log first few errors to avoid spam
                    if (edgesSkipped <= 5) {
                        console.error(`\n⚠️  Edge error (${edge.from} → ${edge.to}):`, edgeErr.message);
                    }
                }
            }

            process.stdout.write(`\r   Progress: ${edgesInserted + edgesSkipped}/${data.edges.length} edges`);
        }

        console.log(`\n✅ ${edgesInserted} edges inserted, ${edgesSkipped} skipped`);

        // 6. Commit transaction
        await client.query('COMMIT');

        // 7. Print summary stats
        console.log('\n' + '='.repeat(50));
        console.log('📊 Database Summary:');

        const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM nodes) AS node_count,
        (SELECT COUNT(*) FROM edges) AS edge_count,
        (SELECT COUNT(*) FROM navigation_zones) AS zone_count,
        (SELECT COUNT(*) FROM users) AS user_count
    `);

        const s = stats.rows[0];
        console.log(`   Nodes:  ${s.node_count}`);
        console.log(`   Edges:  ${s.edge_count}`);
        console.log(`   Zones:  ${s.zone_count}`);
        console.log(`   Users:  ${s.user_count}`);

        // Verify spatial data
        const extent = await client.query(`
      SELECT 
        ST_XMin(ST_Extent(geom)) AS min_lng,
        ST_YMin(ST_Extent(geom)) AS min_lat,
        ST_XMax(ST_Extent(geom)) AS max_lng,
        ST_YMax(ST_Extent(geom)) AS max_lat
      FROM nodes
    `);

        if (extent.rows[0].min_lng) {
            const e = extent.rows[0];
            console.log(`\n🌍 Spatial Extent:`);
            console.log(`   Lat: ${Number(e.min_lat).toFixed(6)} to ${Number(e.max_lat).toFixed(6)}`);
            console.log(`   Lng: ${Number(e.min_lng).toFixed(6)} to ${Number(e.max_lng).toFixed(6)}`);
        }

        // Floor type distribution
        const floorTypes = await client.query(`
      SELECT floor_type, COUNT(*) AS count
      FROM edges
      GROUP BY floor_type
      ORDER BY floor_type
    `);

        const floorNames = ['Concrete', 'Tar', 'Sand', 'Wood', 'Synthetic'];
        console.log(`\n🏗️  Floor Type Distribution:`);
        floorTypes.rows.forEach(row => {
            const name = floorNames[row.floor_type] || `Type ${row.floor_type}`;
            console.log(`   ${name}: ${row.count} edges`);
        });

        console.log('\n✅ Seeding complete!\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\n❌ Seeding failed:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the seed
seed().catch((err) => {
    console.error(err);
    process.exit(1);
});
