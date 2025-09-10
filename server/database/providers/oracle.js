/**
 * Oracle Database Connection Provider
 * 
 * This module provides an abstraction layer for connecting to an Oracle database.
 * It can be used as a drop-in replacement for the SQLite connection when ready to migrate.
 */

const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');

// Oracle connection configuration
const config = {
    user: process.env.ORACLE_USER || 'tecchat',
    password: process.env.ORACLE_PASSWORD || 'tecchat123',
    connectString: process.env.ORACLE_CONNECTION_STRING || 'localhost:1521/XEPDB1',
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
    poolTimeout: 60
};

// Database singleton
let pool = null;

/**
 * Initialize the Oracle connection pool
 */
async function initializeDatabase() {
    try {
        if (pool) {
            console.log('Oracle connection pool already initialized');
            return;
        }

        // Configure oracledb
        oracledb.autoCommit = true;

        // Create connection pool
        pool = await oracledb.createPool(config);

        console.log('✅ Connected to Oracle database');

        // Load schema if needed (first run)
        const schemaPath = path.join(__dirname, '../schema/oracle-schema.sql');
        if (fs.existsSync(schemaPath)) {
            try {
                const schemaSql = fs.readFileSync(schemaPath, 'utf8');
                const connection = await pool.getConnection();
                try {
                    // Execute each SQL statement (basic implementation)
                    const statements = schemaSql.split(';').filter(stmt => stmt.trim().length > 0);
                    let operationCount = 0;

                    for (const stmt of statements) {
                        try {
                            await connection.execute(stmt);
                            operationCount++;
                        } catch (err) {
                            // Ignore "table already exists" errors
                            if (!err.message.includes('ORA-00955')) {
                                console.error(`Schema error: ${err.message}`);
                            }
                        }
                    }

                    console.log(`✅ Oracle database schema created successfully (${operationCount} operations)`);
                } finally {
                    if (connection) {
                        await connection.close();
                    }
                }
            } catch (error) {
                console.error('Error loading Oracle schema:', error);
            }
        }

        return pool;
    } catch (error) {
        console.error('Error initializing Oracle database:', error);
        throw error;
    }
}

/**
 * Execute a query with parameters and return results
 */
async function query(sql, params = []) {
    let connection;
    try {
        // Ensure pool is initialized
        if (!pool) {
            await initializeDatabase();
        }

        connection = await pool.getConnection();

        // Execute query
        const result = await connection.execute(sql, params, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: true
        });

        // Format result to match SQLite format
        if (sql.trim().toUpperCase().startsWith('INSERT')) {
            // For INSERT, return object with lastID
            return {
                lastID: result.lastRowid,
                changes: result.rowsAffected
            };
        } else if (sql.trim().toUpperCase().startsWith('SELECT')) {
            // For SELECT, return array of rows
            return result.rows || [];
        } else {
            // For UPDATE/DELETE, return changes
            return {
                changes: result.rowsAffected
            };
        }
    } catch (error) {
        console.error(`Oracle query error: ${error.message}`);
        console.error('SQL:', sql);
        console.error('Params:', params);
        throw error;
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error('Error closing Oracle connection:', error);
            }
        }
    }
}

/**
 * Close the database connection pool
 */
async function close() {
    if (pool) {
        try {
            await pool.close(10);
            pool = null;
            console.log('Oracle connection pool closed');
        } catch (error) {
            console.error('Error closing Oracle connection pool:', error);
            throw error;
        }
    }
}

/**
 * Get the database connection pool
 */
function getPool() {
    return {
        query,
        close
    };
}

module.exports = {
    initializeDatabase,
    getPool
};
