/**
 * Manual mock for src/config/db.js
 * Used by unit tests to prevent real database connections.
 */
module.exports = {
    query: jest.fn(),
    pool: {
        end: jest.fn().mockResolvedValue(undefined),
        on: jest.fn().mockReturnThis(),
        query: jest.fn(),
    },
    getClient: jest.fn(),
};
