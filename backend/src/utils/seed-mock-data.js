/**
 * Seed mock data for the admin dashboard.
 * 
 * This script:
 * 1. Resets the admin user password to 'admin1234'
 * 2. Adds additional realistic users
 * 3. Creates 30 days of realistic route_history data
 * 
 * Run: node src/utils/seed-mock-data.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const bcrypt = require('bcrypt');
const db = require('../config/db');

async function seedMockData() {
    console.log('🌱 Seeding mock data for admin dashboard...\n');

    try {
        // ============================================
        // 1. Reset admin password → "admin1234"
        // ============================================
        const adminHash = await bcrypt.hash('admin1234', 12);
        await db.query(
            `UPDATE users SET password_hash = $1, role = 'admin' WHERE email = 'test@test.com'`,
            [adminHash]
        );
        console.log('✅ Admin password reset → test@test.com / admin1234');

        // ============================================
        // 2. Add more realistic users
        // ============================================
        const mockUsers = [
            { name: 'Sarah Chen', email: 'sarah.chen@monash.edu', role: 'visitor' },
            { name: 'James Wilson', email: 'james.wilson@monash.edu', role: 'visitor' },
            { name: 'Priya Sharma', email: 'priya.sharma@monash.edu', role: 'visitor' },
            { name: 'Liam O\'Brien', email: 'liam.obrien@monash.edu', role: 'visitor' },
            { name: 'Mei Tanaka', email: 'mei.tanaka@monash.edu', role: 'visitor' },
            { name: 'Carlos Rivera', email: 'carlos.rivera@monash.edu', role: 'visitor' },
            { name: 'Aisha Patel', email: 'aisha.patel@monash.edu', role: 'visitor' },
            { name: 'David Kim', email: 'david.kim@monash.edu', role: 'admin' },
            { name: 'Emma Thompson', email: 'emma.thompson@monash.edu', role: 'visitor' },
            { name: 'Raj Nair', email: 'raj.nair@monash.edu', role: 'visitor' },
            { name: 'Sophie Laurent', email: 'sophie.laurent@monash.edu', role: 'visitor' },
            { name: 'Tom Nguyen', email: 'tom.nguyen@monash.edu', role: 'visitor' },
        ];

        const defaultPassword = await bcrypt.hash('visitor1234', 12);

        for (const u of mockUsers) {
            const exists = await db.query('SELECT id FROM users WHERE email = $1', [u.email]);
            if (exists.rows.length === 0) {
                const pwd = u.role === 'admin'
                    ? await bcrypt.hash('admin1234', 12)
                    : defaultPassword;
                await db.query(
                    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
                    [u.name, u.email, pwd, u.role]
                );
            }
        }
        console.log(`✅ ${mockUsers.length} mock users added`);

        // Get all user IDs for assigning routes
        const allUsers = await db.query('SELECT id FROM users ORDER BY id');
        const userIds = allUsers.rows.map(r => r.id);

        // ============================================
        // 3. Get some actual nodes from the graph for realistic paths
        // ============================================
        const nodesResult = await db.query('SELECT id FROM nodes ORDER BY id LIMIT 50');
        const nodeIds = nodesResult.rows.map(r => r.id);
        console.log(`📍 Found ${nodeIds.length} nodes for route generation`);

        if (nodeIds.length < 2) {
            console.log('⚠️  Not enough nodes in DB — skipping route generation');
            await db.end();
            return;
        }

        // ============================================
        // 4. Generate 30 days of realistic route history
        // ============================================
        const modes = ['walk', 'walk', 'walk', 'walk', 'wheelchair', 'cycling']; // Walk-heavy distribution
        const now = new Date();
        let routeCount = 0;

        // Clear existing mock routes (keep any real ones from testing)
        // We'll just add new ones so history keeps growing

        for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
            const day = new Date(now);
            day.setDate(day.getDate() - dayOffset);

            // More routes on weekdays, fewer on weekends
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            const routesThisDay = isWeekend
                ? Math.floor(Math.random() * 4) + 1    // 1–4 on weekends
                : Math.floor(Math.random() * 10) + 5;   // 5–14 on weekdays

            for (let r = 0; r < routesThisDay; r++) {
                // Random time — peak hours are 8-10am, 12-2pm, 4-6pm
                const peakHours = [8, 9, 10, 12, 13, 14, 16, 17, 18];
                const allHours = [...peakHours, ...peakHours, 7, 11, 15, 19, 20]; // Double weight peaks
                const hour = allHours[Math.floor(Math.random() * allHours.length)];
                const minute = Math.floor(Math.random() * 60);

                const routeTime = new Date(day);
                routeTime.setHours(hour, minute, 0, 0);

                // Random user
                const userId = userIds[Math.floor(Math.random() * userIds.length)];
                // Random mode
                const mode = modes[Math.floor(Math.random() * modes.length)];
                // Random start/end nodes
                const startIdx = Math.floor(Math.random() * nodeIds.length);
                let endIdx = Math.floor(Math.random() * nodeIds.length);
                while (endIdx === startIdx && nodeIds.length > 1) {
                    endIdx = Math.floor(Math.random() * nodeIds.length);
                }
                const startNode = nodeIds[startIdx];
                const endNode = nodeIds[endIdx];

                // Realistic distance and duration based on mode
                let distance, duration;
                switch (mode) {
                    case 'walk':
                        distance = 100 + Math.floor(Math.random() * 900);   // 100–1000m
                        duration = Math.round(distance / 1.4);               // ~1.4 m/s walking
                        break;
                    case 'wheelchair':
                        distance = 80 + Math.floor(Math.random() * 600);    // 80–680m
                        duration = Math.round(distance / 1.1);               // ~1.1 m/s
                        break;
                    case 'cycling':
                        distance = 200 + Math.floor(Math.random() * 1500);  // 200–1700m
                        duration = Math.round(distance / 4.5);               // ~4.5 m/s cycling
                        break;
                }

                // Build a simple path array (start → end node IDs)
                const pathLength = 3 + Math.floor(Math.random() * 5);
                const path = [startNode];
                for (let p = 0; p < pathLength - 2; p++) {
                    path.push(nodeIds[Math.floor(Math.random() * nodeIds.length)]);
                }
                path.push(endNode);

                try {
                    await db.query(
                        `INSERT INTO route_history 
                         (user_id, start_node, end_node, path, distance, duration, mode, created_at) 
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            userId,
                            startNode,
                            endNode,
                            JSON.stringify(path),
                            distance,
                            duration,
                            mode,
                            routeTime.toISOString(),
                        ]
                    );
                    routeCount++;
                } catch (err) {
                    // Skip dupes or constraint errors
                    if (!err.message.includes('duplicate')) {
                        console.warn(`  ⚠ Route insert error: ${err.message}`);
                    }
                }
            }
        }

        console.log(`✅ ${routeCount} mock routes created over 30 days`);

        // ============================================
        // 5. Summary
        // ============================================
        const userCount = await db.query('SELECT COUNT(*) FROM users');
        const routeTotal = await db.query('SELECT COUNT(*) FROM route_history');
        const modeBreakdown = await db.query(
            `SELECT mode, COUNT(*) as count FROM route_history GROUP BY mode ORDER BY count DESC`
        );

        console.log('\n📊 Database Summary:');
        console.log(`   Users:  ${userCount.rows[0].count}`);
        console.log(`   Routes: ${routeTotal.rows[0].count}`);
        console.log('   Modes:', modeBreakdown.rows.map(r => `${r.mode}=${r.count}`).join(', '));
        console.log('\n🎉 Mock data seeding complete!');
        console.log('   Admin login: test@test.com / admin1234\n');

    } catch (err) {
        console.error('❌ Seed error:', err);
    }

    await db.end();
}

seedMockData();
