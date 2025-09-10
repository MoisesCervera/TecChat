const sqlite3 = require('sqlite3').verbose();
const path = require('path');

/**
 * Database Connection Pool
 * Designed for easy Oracle migration
 * 
 * For Oracle migration:
 * 1. Replace sqlite3 with oracledb
 * 2. Update connectionConfig
 * 3. Modify getConnection method
 * 4. Connection interface remains the same
 */

class DatabasePool {
    constructor() {
        this.dbPath = path.join(__dirname, '../database.sqlite');
        this.db = null;
        this.isConnected = false;

        // Pool configuration (Oracle-ready)
        this.poolConfig = {
            max: 10,        // Maximum connections
            min: 2,         // Minimum connections
            acquire: 30000, // Maximum time to wait for connection
            idle: 10000     // Connection idle timeout
        };
    }

    /**
     * Initialize database connection
     */
    async connect() {
        try {
            return new Promise((resolve, reject) => {
                // SQLite connection (single connection, but structured for pool)
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        console.error('❌ Database connection failed:', err.message);
                        reject(err);
                    } else {
                        console.log('✅ Connected to SQLite database');
                        this.isConnected = true;

                        // Configure SQLite for better performance
                        this.db.run("PRAGMA journal_mode = WAL;");
                        this.db.run("PRAGMA synchronous = NORMAL;");
                        this.db.run("PRAGMA cache_size = 1000;");
                        this.db.run("PRAGMA foreign_keys = ON;");

                        // Run migrations
                        this.runMigrations().then(() => {
                            resolve();
                        }).catch(err => {
                            console.error('Migration error:', err);
                            // Continue despite migration errors
                            resolve();
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Database connection error:', error);
            throw error;
        }
    }

    /**
     * Get database connection
     * For Oracle: This will return a connection from the pool
     */
    getConnection() {
        if (!this.isConnected || !this.db) {
            throw new Error('Database not connected');
        }
        return this.db;
    }

    /**
     * Execute query with connection management
     * Oracle-compatible interface
     */
    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();

            if (sql.trim().toLowerCase().startsWith('select')) {
                // SELECT query
                db.all(sql, params, (err, rows) => {
                    if (err) {
                        console.error('Query error:', err);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            } else {
                // INSERT, UPDATE, DELETE
                db.run(sql, params, function (err) {
                    if (err) {
                        console.error('Query error:', err);
                        reject(err);
                    } else {
                        resolve({
                            changes: this.changes,
                            lastID: this.lastID
                        });
                    }
                });
            }
        });
    }

    /**
     * Execute multiple queries in transaction
     * Oracle-compatible interface
     */
    async transaction(queries) {
        return new Promise((resolve, reject) => {
            const db = this.getConnection();

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");

                let completed = 0;
                let results = [];
                let hasError = false;

                const executeNext = (index) => {
                    if (index >= queries.length) {
                        if (hasError) {
                            db.run("ROLLBACK", () => reject(new Error('Transaction failed')));
                        } else {
                            db.run("COMMIT", () => resolve(results));
                        }
                        return;
                    }

                    const { sql, params = [] } = queries[index];

                    if (sql.trim().toLowerCase().startsWith('select')) {
                        db.all(sql, params, (err, rows) => {
                            if (err) {
                                hasError = true;
                                console.error('Transaction query error:', err);
                            }
                            results[index] = err ? null : rows;
                            executeNext(index + 1);
                        });
                    } else {
                        db.run(sql, params, function (err) {
                            if (err) {
                                hasError = true;
                                console.error('Transaction query error:', err);
                            }
                            results[index] = err ? null : {
                                changes: this.changes,
                                lastID: this.lastID
                            };
                            executeNext(index + 1);
                        });
                    }
                };

                executeNext(0);
            });
        });
    }

    /**
     * Close database connection
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                        reject(err);
                    } else {
                        console.log('✅ Database connection closed');
                        this.isConnected = false;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Check database health
     */
    async healthCheck() {
        try {
            const result = await this.query('SELECT 1 as health');
            return result[0].health === 1;
        } catch (error) {
            console.error('Database health check failed:', error);
            return false;
        }
    }

    /**
     * Run database migrations
     */
    async runMigrations() {
        try {
            console.log('Running database migrations...');

            // Import and run migrations
            const fs = require('fs');
            const path = require('path');

            // Add message read status migration
            const { runMigration: addMessageReadStatus } = require('./migrations/add_message_read_status');
            await addMessageReadStatus(this.db);

            console.log('✅ All migrations completed successfully');
            return true;
        } catch (error) {
            console.error('Migration execution failed:', error);
            return false;
        }
    }
}

// Singleton instance
let dbPool = null;

/**
 * Get database pool instance
 */
const getPool = () => {
    if (!dbPool) {
        dbPool = new DatabasePool();
    }
    return dbPool;
};

/**
 * Initialize database
 */
const initializeDatabase = async () => {
    const pool = getPool();
    await pool.connect();

    // Create schema
    const { createTables } = require('./schema');
    await createTables(pool.getConnection());

    return pool;
};

module.exports = {
    DatabasePool,
    getPool,
    initializeDatabase
};
