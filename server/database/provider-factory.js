/**
 * Database Provider Factory
 * This module provides a way to switch between different database backends
 */

// Import providers
const sqliteProvider = require('./providers/sqlite');
let oracleProvider = null;

// Set the active provider based on environment
const DATABASE_PROVIDER = process.env.DATABASE_PROVIDER || 'sqlite';

/**
 * Initialize the appropriate database connection
 */
async function initializeDatabase() {
    try {
        switch (DATABASE_PROVIDER.toLowerCase()) {
            case 'oracle':
                try {
                    // Load Oracle provider only if selected
                    oracleProvider = require('./providers/oracle');
                    await oracleProvider.initializeDatabase();
                    return oracleProvider;
                } catch (error) {
                    console.error('Failed to initialize Oracle provider:', error);
                    console.log('Falling back to SQLite provider...');
                    await sqliteProvider.initializeDatabase();
                    return sqliteProvider;
                }

            case 'sqlite':
            default:
                await sqliteProvider.initializeDatabase();
                return sqliteProvider;
        }
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

/**
 * Get the active database connection pool
 */
function getPool() {
    switch (DATABASE_PROVIDER.toLowerCase()) {
        case 'oracle':
            if (oracleProvider) {
                return oracleProvider.getPool();
            }
            console.warn('Oracle provider not initialized, falling back to SQLite');
            return sqliteProvider.getPool();

        case 'sqlite':
        default:
            return sqliteProvider.getPool();
    }
}

module.exports = {
    initializeDatabase,
    getPool,
    DATABASE_PROVIDER
};
