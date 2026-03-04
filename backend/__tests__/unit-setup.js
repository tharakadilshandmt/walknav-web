/**
 * Global setup for unit tests — mocks the DB module
 * to prevent real database connections during unit tests.
 */
const mockPool = {
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn().mockReturnThis(),
    query: jest.fn(),
};

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    pool: mockPool,
    getClient: jest.fn(),
    on: jest.fn(),
}));
