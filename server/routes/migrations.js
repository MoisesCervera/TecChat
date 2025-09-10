/**
 * Migrations API for database schema updates
 */

const express = require('express');
const { getPool } = require('../database/provider-factory');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Run all migrations
router.post('/migrations/run', requireAuth, async (req, res) => {
    try {
        const db = getPool();

        // Check if MENSAJE_INFO table exists
        const tableExists = await db.query(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='MENSAJE_INFO'
        `);

        if (tableExists.length === 0) {
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

            // Migrate existing read status data from MENSAJE table
            await db.query(`
                INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, leido_en)
                SELECT m.id_mensaje, cp.id_usuario, m.leido_en
                FROM MENSAJE m
                JOIN CHAT_PARTICIPANTE cp ON m.id_chat = cp.id_chat
                WHERE m.leido_en IS NOT NULL
                  AND cp.id_usuario != m.id_usuario_remitente
            `);

            res.json({ success: true, message: 'Migration completed successfully' });
        } else {
            res.json({ success: true, message: 'No migrations needed' });
        }
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ success: false, error: 'Failed to run migrations' });
    }
});

module.exports = router;
