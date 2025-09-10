const sqlite3 = require('sqlite3').verbose();

/**
 * Database Schema based on ERD
 * Designed for easy Oracle migration
 * Spanish content, English column names for compatibility
 */

const createTables = (db) => {
    return new Promise((resolve, reject) => {
        // Enable foreign key constraints
        db.run("PRAGMA foreign_keys = ON");

        const tables = [
            // USUARIO - Core user table
            `CREATE TABLE IF NOT EXISTS USUARIO (
                id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
                telefono TEXT NOT NULL UNIQUE,
                nombre TEXT NOT NULL,
                foto_perfil TEXT,
                ultima_conexion DATETIME,
                ajustes_privacidad TEXT DEFAULT '{}',
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // CONTACTO - User relationships with block feature
            `CREATE TABLE IF NOT EXISTS CONTACTO (
                id_contacto INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER NOT NULL,
                id_usuario_contacto INTEGER NOT NULL,
                alias TEXT,
                bloqueado BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
                FOREIGN KEY (id_usuario_contacto) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
                UNIQUE(id_usuario, id_usuario_contacto)
            )`,

            // CHAT - Flexible chat system (individual/group)
            `CREATE TABLE IF NOT EXISTS CHAT (
                id_chat INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL CHECK (tipo IN ('individual', 'grupo')),
                archivado BOOLEAN DEFAULT FALSE,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // CHAT_PARTICIPANTE - Who participates in each chat
            `CREATE TABLE IF NOT EXISTS CHAT_PARTICIPANTE (
                id_chat INTEGER NOT NULL,
                id_usuario INTEGER NOT NULL,
                fecha_union DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id_chat, id_usuario),
                FOREIGN KEY (id_chat) REFERENCES CHAT(id_chat) ON DELETE CASCADE,
                FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
            )`,

            // GRUPO - Group-specific information
            `CREATE TABLE IF NOT EXISTS GRUPO (
                id_grupo INTEGER PRIMARY KEY AUTOINCREMENT,
                id_chat INTEGER NOT NULL UNIQUE,
                nombre TEXT NOT NULL,
                foto TEXT,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_chat) REFERENCES CHAT(id_chat) ON DELETE CASCADE
            )`,

            // GRUPO_USUARIO - Group membership with roles
            `CREATE TABLE IF NOT EXISTS GRUPO_USUARIO (
                id_grupo INTEGER NOT NULL,
                id_usuario INTEGER NOT NULL,
                rol TEXT NOT NULL CHECK (rol IN ('admin', 'member')),
                fecha_union DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id_grupo, id_usuario),
                FOREIGN KEY (id_grupo) REFERENCES GRUPO(id_grupo) ON DELETE CASCADE,
                FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
            )`,

            // MENSAJE - Core message table
            `CREATE TABLE IF NOT EXISTS MENSAJE (
                id_mensaje INTEGER PRIMARY KEY AUTOINCREMENT,
                id_chat INTEGER NOT NULL,
                id_usuario_remitente INTEGER NOT NULL,
                contenido TEXT,
                tipo TEXT DEFAULT 'texto' CHECK (tipo IN ('texto', 'imagen', 'audio', 'video', 'documento')),
                enviado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                leido_en DATETIME,
                FOREIGN KEY (id_chat) REFERENCES CHAT(id_chat) ON DELETE CASCADE,
                FOREIGN KEY (id_usuario_remitente) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
            )`,

            // MULTIMEDIA - File attachments
            `CREATE TABLE IF NOT EXISTS MULTIMEDIA (
                id_media INTEGER PRIMARY KEY AUTOINCREMENT,
                id_mensaje INTEGER NOT NULL,
                url_archivo TEXT NOT NULL,
                tipo TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                tamano_bytes INTEGER,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_mensaje) REFERENCES MENSAJE(id_mensaje) ON DELETE CASCADE
            )`,

            // ESTADO - WhatsApp-style status updates
            `CREATE TABLE IF NOT EXISTS ESTADO (
                id_estado INTEGER PRIMARY KEY AUTOINCREMENT,
                id_usuario INTEGER NOT NULL,
                contenido TEXT,
                multimedia_url TEXT,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
                expira_en DATETIME NOT NULL,
                FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
            )`,

            // SESSION - Session management table
            `CREATE TABLE IF NOT EXISTS SESSION (
                session_id TEXT PRIMARY KEY,
                id_usuario INTEGER,
                session_data TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
            )`
        ];

        // Create indexes for better performance
        const indexes = [
            "CREATE INDEX IF NOT EXISTS idx_usuario_telefono ON USUARIO(telefono)",
            "CREATE INDEX IF NOT EXISTS idx_contacto_usuario ON CONTACTO(id_usuario)",
            "CREATE INDEX IF NOT EXISTS idx_mensaje_chat ON MENSAJE(id_chat)",
            "CREATE INDEX IF NOT EXISTS idx_mensaje_fecha ON MENSAJE(enviado_en)",
            "CREATE INDEX IF NOT EXISTS idx_chat_participante ON CHAT_PARTICIPANTE(id_usuario)",
            "CREATE INDEX IF NOT EXISTS idx_session_expires ON SESSION(expires_at)",
            "CREATE INDEX IF NOT EXISTS idx_estado_usuario ON ESTADO(id_usuario)"
        ];

        let completed = 0;
        const total = tables.length + indexes.length;

        const executeNext = (queries, callback) => {
            if (queries.length === 0) return callback();

            const query = queries.shift();
            db.run(query, (err) => {
                if (err) return callback(err);
                completed++;
                executeNext(queries, callback);
            });
        };

        // Execute all table creation queries
        executeNext([...tables, ...indexes], (err) => {
            if (err) {
                console.error('Error creating database schema:', err);
                reject(err);
            } else {
                console.log(`Database schema created successfully (${total} operations)`);
                resolve();
            }
        });
    });
};

module.exports = {
    createTables
};
