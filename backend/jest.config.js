/** @type {import('jest').Config} */
module.exports = {
    testTimeout: 15000,
    projects: [
        {
            displayName: 'unit',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/__tests__/unit/**/*.test.js'],
            setupFiles: ['<rootDir>/__tests__/unit-setup.js'],
            moduleNameMapper: {
                '(.*)config/db$': '<rootDir>/__mocks__/db.js',
            },
        },
        {
            displayName: 'integration',
            testEnvironment: 'node',
            testMatch: [
                '<rootDir>/__tests__/integration/**/*.test.js',
                '<rootDir>/__tests__/security/**/*.test.js',
            ],
            globalTeardown: '<rootDir>/__tests__/global-teardown.js',
        },
    ],
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/utils/seed.js',
        '!src/utils/enrich-osm.js',
        '!src/utils/update-enriched.js',
    ],
};
