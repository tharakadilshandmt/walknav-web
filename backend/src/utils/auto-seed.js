/**
 * WalkNav Auto-Seed
 * 
 * Checks if the database has walking network data and seeds it if empty.
 * Called automatically on server startup for Docker deployments.
 * Also creates the default admin user if no users exist.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../config/db');

// Possible seed file locations (Docker mount vs local dev)
const SEED_PATHS = [
    path.resolve(__dirname, '../../seed/walkable_network_enriched.json'),
    path.resolve(__dirname, '../../../database/seed/walkable_network_enriched.json'),
    path.resolve(__dirname, '../../seed/walkable_network.json'),
    path.resolve(__dirname, '../../../database/seed/walkable_network.json'),
];

const BATCH_SIZE = 500;

/**
 * Find the first available seed file
 */
function findSeedFile() {
    for (const p of SEED_PATHS) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * Auto-seed the database if walking_nodes table is empty
 */
async function autoSeed() {
    try {
        // Check if nodes table has data
        const result = await db.query('SELECT COUNT(*) as count FROM nodes');
        const nodeCount = parseInt(result.rows[0].count, 10);

        if (nodeCount > 0) {
            console.log(`✅ Database already seeded (${nodeCount} nodes)`);
            await ensureAdminUser();
            return;
        }

        console.log('🌱 Database empty — auto-seeding walking network...');

        const seedFile = findSeedFile();
        if (!seedFile) {
            console.warn('⚠️  No seed file found. Skipping auto-seed.');
            console.warn('   Expected locations:', SEED_PATHS.join('\n   '));
            return;
        }

        // Read and parse seed data
        const raw = fs.readFileSync(seedFile, 'utf8');
        const data = JSON.parse(raw);
        console.log(`📁 Seed file: ${path.basename(seedFile)} (${data.nodes.length} nodes, ${data.edges.length} edges)`);

        const client = await db.pool.connect();

        try {
            await client.query('BEGIN');

            // Get default zone ID
            const zoneResult = await client.query(
                "SELECT zone_id FROM navigation_zones WHERE name = 'Monash University Clayton' LIMIT 1"
            );
            const zoneId = zoneResult.rows.length > 0 ? zoneResult.rows[0].zone_id : null;

            // Insert nodes in batches
            let nodesInserted = 0;
            for (let i = 0; i < data.nodes.length; i += BATCH_SIZE) {
                const batch = data.nodes.slice(i, i + BATCH_SIZE);
                const values = [];
                const params = [];

                batch.forEach((node, idx) => {
                    const offset = idx * 4;
                    values.push(`($${offset + 1}, $${offset + 2}, ST_SetSRID(ST_MakePoint($${offset + 3}, $${offset + 4}), 4326))`);
                    params.push(node.id, zoneId, node.lng, node.lat);
                });

                await client.query(
                    `INSERT INTO nodes (id, zone_id, geom) VALUES ${values.join(', ')} ON CONFLICT (id) DO NOTHING`,
                    params
                );
                nodesInserted += batch.length;
            }
            console.log(`   ✅ ${nodesInserted} nodes inserted`);

            // Insert edges
            let edgesInserted = 0;
            let edgesSkipped = 0;

            for (let i = 0; i < data.edges.length; i += BATCH_SIZE) {
                const batch = data.edges.slice(i, i + BATCH_SIZE);

                for (const edge of batch) {
                    try {
                        const polyline = edge.polyline || [];
                        if (polyline.length < 2) { edgesSkipped++; continue; }

                        const lineCoords = polyline.map(p => `${p.lng} ${p.lat}`).join(', ');
                        const edgeId = edge.id || `edge_${edge.from}_${edge.to}`;

                        await client.query(
                            `INSERT INTO edges (id, source_node, target_node, geom, length, floor_type, has_steps, surface, wheelchair, bicycle, highway, width, lit, incline, way_name, osmid)
                             VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromText($4), 4326), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                             ON CONFLICT (id) DO NOTHING`,
                            [
                                edgeId, edge.from, edge.to,
                                `LINESTRING(${lineCoords})`,
                                edge.distance || 0, edge.floor_type || 0, edge.has_steps || 0,
                                edge.surface || null, edge.wheelchair || null, edge.bicycle || null,
                                edge.highway || null, edge.width || null, edge.lit || null,
                                edge.incline || null, edge.way_name || null, edge.osmid || null,
                            ]
                        );
                        edgesInserted++;
                    } catch {
                        edgesSkipped++;
                    }
                }
            }
            console.log(`   ✅ ${edgesInserted} edges inserted (${edgesSkipped} skipped)`);

            await client.query('COMMIT');
            console.log('🌱 Auto-seed complete!');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ Auto-seed failed:', err.message);
        } finally {
            client.release();
        }

        // Create admin user
        await ensureAdminUser();

    } catch (err) {
        console.warn('⚠️  Auto-seed check failed:', err.message);
    }
}

/**
 * Ensure the default admin user exists
 */
async function ensureAdminUser() {
    try {
        const result = await db.query("SELECT id FROM users WHERE email = 'test@test.com'");
        if (result.rows.length > 0) return;

        console.log('👤 Creating default admin user...');
        const hash = await bcrypt.hash('admin1234', 12);
        await db.query(
            `INSERT INTO users (email, password_hash, name, role)
             VALUES ('test@test.com', $1, 'Admin User', 'admin')
             ON CONFLICT (email) DO NOTHING`,
            [hash]
        );
        console.log('   ✅ Admin: test@test.com / admin1234');
    } catch (err) {
        console.warn('⚠️  Could not create admin user:', err.message);
    }
}

module.exports = { autoSeed };
