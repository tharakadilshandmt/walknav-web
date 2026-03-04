/**
 * Load Test — WalkNav API
 * 
 * Uses autocannon for HTTP load testing.
 * Run: node __tests__/load/load-test.js
 * 
 * Prerequisites: npm install -D autocannon
 * The server must be running on localhost:3001
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function runLoadTest(config) {
    return new Promise((resolve, reject) => {
        const instance = autocannon({
            ...config,
            url: config.url,
        }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });

        autocannon.track(instance, { renderProgressBar: true });
    });
}

function printResults(name, result) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 ${name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Requests/sec:  ${result.requests.average}`);
    console.log(`  Latency avg:   ${result.latency.average} ms`);
    console.log(`  Latency p50:   ${result.latency.p50} ms`);
    console.log(`  Latency p95:   ${result.latency.p95} ms`);
    console.log(`  Latency p99:   ${result.latency.p99} ms`);
    console.log(`  Total req:     ${result.requests.total}`);
    console.log(`  Errors:        ${result.errors}`);
    console.log(`  Timeouts:      ${result.timeouts}`);
    console.log(`  2xx:           ${result['2xx']}`);
    console.log(`  Non-2xx:       ${result.non2xx}`);
}

async function main() {
    console.log('🚀 WalkNav Load Test Suite');
    console.log(`Target: ${BASE_URL}\n`);

    // Test 1: Health Check (simple GET, baseline)
    console.log('\n🏥 Test 1: Health Check Endpoint');
    const healthResult = await runLoadTest({
        url: `${BASE_URL}/api/health`,
        duration: 10,
        connections: 10,
        pipelining: 1,
    });
    printResults('Health Check (GET /api/health)', healthResult);

    // Test 2: Graph Data (large JSON response)
    console.log('\n🗺️ Test 2: Graph Data Endpoint');
    const graphResult = await runLoadTest({
        url: `${BASE_URL}/api/routes/graph`,
        duration: 10,
        connections: 10,
        pipelining: 1,
    });
    printResults('Graph Data (GET /api/routes/graph)', graphResult);

    // Test 3: Route Calculation (CPU-intensive Dijkstra)
    console.log('\n🧮 Test 3: Route Calculation');
    const routeResult = await runLoadTest({
        url: `${BASE_URL}/api/routes/calculate`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            origin: { lat: -37.9105, lng: 145.1340 },
            destination: { lat: -37.9120, lng: 145.1360 },
            mode: 'walk',
        }),
        duration: 10,
        connections: 10,
        pipelining: 1,
    });
    printResults('Route Calculation (POST /api/routes/calculate)', routeResult);

    // Test 4: Zones List (DB query)
    console.log('\n📍 Test 4: Zones List');
    const zonesResult = await runLoadTest({
        url: `${BASE_URL}/api/zones`,
        duration: 10,
        connections: 10,
        pipelining: 1,
    });
    printResults('Zones List (GET /api/zones)', zonesResult);

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📋 SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`  Health:   ${healthResult.requests.average} req/s, p95=${healthResult.latency.p95}ms`);
    console.log(`  Graph:    ${graphResult.requests.average} req/s, p95=${graphResult.latency.p95}ms`);
    console.log(`  Route:    ${routeResult.requests.average} req/s, p95=${routeResult.latency.p95}ms`);
    console.log(`  Zones:    ${zonesResult.requests.average} req/s, p95=${zonesResult.latency.p95}ms`);
    console.log(`${'='.repeat(60)}\n`);

    // Pass/Fail criteria
    const allPassed = [healthResult, graphResult, routeResult, zonesResult]
        .every(r => r.errors === 0 && r.timeouts === 0);

    if (allPassed) {
        console.log('✅ All load tests passed (0 errors, 0 timeouts)');
    } else {
        console.log('⚠️ Some load tests had errors or timeouts');
    }

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    console.error('Load test failed:', err);
    process.exit(1);
});
