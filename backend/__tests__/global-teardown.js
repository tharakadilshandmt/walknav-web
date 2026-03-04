/**
 * Global Teardown — Integration Tests
 * Closes the shared DB pool ONCE after all integration/security test suites finish.
 */
module.exports = async () => {
    try {
        const db = require('../src/config/db');
        await db.pool.end();
    } catch {
        // Pool may already be closed or never opened — safe to ignore
    }
};
