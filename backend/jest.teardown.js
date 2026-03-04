// Global teardown for unit tests — close any DB pools that persist
// This file is referenced by jest.config.js via globalTeardown
const db = require('./src/config/db');

module.exports = async () => {
    try {
        await db.pool.end();
    } catch {
        // Pool may already be closed or not initialized
    }
};
