#!/usr/bin/env node

/**
 * Direct database migration script
 */

console.log('Migrating TecChat database directly...');

const { getPool, initializeDatabase } = require('../database/provider-factory');

async function runMigrations() {
    try {
        // Initialize database connection
        await initializeDatabase();
        console.log('Connected to database');

        // Get database connection
        const db = getPool();

        // Check if MENSAJE_INFO table exists
        const tableExists = await db.query(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='MENSAJE_INFO'
        `);

        if (tableExists.length === 0) {
            console.log('Creating MENSAJE_INFO table...');

            // Create the MENSAJE_INFO table
            await db.query(`
                CREATE TABLE IF NOT EXISTS MENSAJE_INFO (
                    id_mensaje INTEGER NOT NULL,
                    id_usuario INTEGER NOT NULL,
                    entregado_en TIMESTAMP,
                    leido_en TIMESTAMP,
                    PRIMARY KEY (id_mensaje, id_usuario),
                    FOREIGN KEY (id_mensaje) REFERENCES MENSAJE(id_mensaje) ON DELETE CASCADE,
                    FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
                )
            `);

            console.log('Migrating existing read status data...');

            // Migrate existing read status data from MENSAJE table
            await db.query(`
                INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, leido_en)
                SELECT m.id_mensaje, cp.id_usuario, m.leido_en
                FROM MENSAJE m
                JOIN CHAT_PARTICIPANTE cp ON m.id_chat = cp.id_chat
                WHERE m.leido_en IS NOT NULL
                  AND cp.id_usuario != m.id_usuario_remitente
            `);

            console.log('✅ Migration completed successfully');
        } else {
            console.log('✅ MENSAJE_INFO table already exists, no migration needed');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    }
}

runMigrations();
