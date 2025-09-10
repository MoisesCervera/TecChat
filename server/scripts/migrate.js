#!/usr/bin/env node

/**
 * Script to run database migrations
 */

console.log('Running database migrations for TecChat...');

const fetch = require('node-fetch');

async function runMigrations() {
    try {
        const response = await fetch('http://localhost:3002/api/migrations/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // This would normally need authentication, but for local development
            // we'll handle that on the server side
        });

        const result = await response.json();

        if (result.success) {
            console.log('✅ ' + result.message);
            process.exit(0);
        } else {
            console.error('❌ Migration failed:', result.error);
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error running migrations:', error);
        process.exit(1);
    }
}

runMigrations();
