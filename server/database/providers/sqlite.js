/**
 * SQLite Database Connection Provider
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database singleton
let db = null;
let isInitialized = false;

/**
 * Initialize the SQLite database connection
 */
async function initializeDatabase() {
    try {
        if (isInitialized) {
            console.log('SQLite database already initialized');
            return;
        }

        const dbPath = path.join(__dirname, '../../database.sqlite');

        return new Promise((resolve, reject) => {
            db = new sqlite3.Database(dbPath, async (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err.message);
                    reject(err);
                    return;
                }

                console.log('✅ Connected to SQLite database');

                // Configure SQLite for better performance
                db.run("PRAGMA journal_mode = WAL;");
                db.run("PRAGMA synchronous = NORMAL;");
                db.run("PRAGMA cache_size = 1000;");
                db.run("PRAGMA foreign_keys = ON;");

                // Create schema if needed
                try {
                    await createSchema();
                    isInitialized = true;
                    resolve();
                } catch (schemaError) {
                    reject(schemaError);
                }
            });
        });
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

/**
 * Create database schema if not exists
 */
async function createSchema() {
    return new Promise((resolve, reject) => {
        const schemaPath = path.join(__dirname, '../schema.js');

        try {
            if (!fs.existsSync(schemaPath)) {
                console.warn('Schema file not found:', schemaPath);
                resolve();
                return;
            }

            const { schema } = require('../schema');

            if (!schema || !Array.isArray(schema) || schema.length === 0) {
                console.warn('Invalid schema definition');
                resolve();
                return;
            }

            // Execute each schema operation sequentially
            db.serialize(() => {
                let operationCount = 0;

                schema.forEach(operation => {
                    db.run(operation, [], function (err) {
                        if (err) {
                            // Ignore "table already exists" errors
                            if (!err.message.includes('already exists')) {
                                console.error(`Schema error: ${err.message}`);
                                console.error('SQL:', operation);
                            }
                        } else {
                            operationCount++;
                        }
                    });
                });

                console.log(`✅ Database schema created successfully (${operationCount} operations)`);
                resolve();
            });
        } catch (error) {
            console.error('Schema creation error:', error);
            reject(error);
        }
    });
}

/**
 * Execute a query with parameters and return results
 */
async function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        if (sql.trim().toLowerCase().startsWith('select')) {
            // For SELECT queries
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('SQLite query error:', err.message);
                    console.error('SQL:', sql);
                    console.error('Params:', params);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        } else {
            // For INSERT, UPDATE, DELETE queries
            db.run(sql, params, function (err) {
                if (err) {
                    console.error('SQLite query error:', err.message);
                    console.error('SQL:', sql);
                    console.error('Params:', params);
                    reject(err);
                } else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        }
    });
}

/**
 * Close the database connection
 */
async function close() {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close(err => {
                if (err) {
                    console.error('Error closing database:', err.message);
                    reject(err);
                } else {
                    console.log('Database connection closed');
                    db = null;
                    isInitialized = false;
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

/**
 * Get the database connection interface
 */
function getPool() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }

    return {
        query,
        close
    };
}

module.exports = {
    initializeDatabase,
    getPool
};
