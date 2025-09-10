/**
 * Database Reset Script
 * Deletes all data and recreates tables
 */
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { createTables } = require('./schema');
const { initializeDatabase } = require('./provider-factory');
const bcrypt = require('bcrypt');

// Path to the database files
const dbPath = path.join(__dirname, '../database.sqlite');
const dbWalPath = path.join(__dirname, '../database.sqlite-wal');
const dbShmPath = path.join(__dirname, '../database.sqlite-shm');

// Function to delete database files
function deleteDbFiles() {
    console.log('Deleting existing database files...');

    // Delete main database file
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Deleted database file');
    }

    // Delete WAL file if exists
    if (fs.existsSync(dbWalPath)) {
        fs.unlinkSync(dbWalPath);
        console.log('Deleted WAL file');
    }

    // Delete SHM file if exists
    if (fs.existsSync(dbShmPath)) {
        fs.unlinkSync(dbShmPath);
        console.log('Deleted SHM file');
    }
}

// Sample test users for fresh database
const TEST_USERS = [
    { telefono: '1234567890', nombre: 'Admin', password: 'admin123' },
    { telefono: '1111111111', nombre: 'Juan Pérez', password: 'password123' },
    { telefono: '2222222222', nombre: 'María García', password: 'password123' },
    { telefono: '3333333333', nombre: 'Carlos López', password: 'password123' }
];

// Function to recreate database
async function recreateDatabase() {
    console.log('Creating new database...');

    return new Promise((resolve, reject) => {
        // Create new database connection
        const db = new sqlite3.Database(dbPath, async (err) => {
            if (err) {
                console.error('Error creating database:', err);
                reject(err);
                return;
            }

            console.log('Database created successfully');

            try {
                // Create tables
                await createTables(db);
                console.log('Tables created successfully');

                // Initialize the provider factory to use our new DB
                await initializeDatabase();

                // Insert test users
                for (const user of TEST_USERS) {
                    const passwordHash = await bcrypt.hash(user.password, 10);
                    await db.run(
                        'INSERT INTO USUARIO (telefono, nombre, password_hash, ultima_conexion) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                        [user.telefono, user.nombre, passwordHash]
                    );
                    console.log(`Created test user: ${user.nombre}`);
                }

                // Create a default group chat
                db.run(
                    'INSERT INTO CHAT (tipo) VALUES ("grupo")',
                    function (err) {
                        if (err) {
                            console.error('Error creating chat:', err);
                            reject(err);
                            return;
                        }

                        const chatId = this.lastID;

                        // Create grupo entry
                        db.run(
                            'INSERT INTO GRUPO (id_chat, nombre) VALUES (?, ?)',
                            [chatId, 'TecChat Grupo'],
                            function (err) {
                                if (err) {
                                    console.error('Error creating grupo:', err);
                                    reject(err);
                                    return;
                                }

                                // Add all users to chat and grupo
                                db.all('SELECT id_usuario FROM USUARIO', [], async (err, users) => {
                                    if (err) {
                                        console.error('Error getting users:', err);
                                        reject(err);
                                        return;
                                    }

                                    for (let i = 0; i < users.length; i++) {
                                        const userId = users[i].id_usuario;
                                        await db.run(
                                            'INSERT INTO CHAT_PARTICIPANTE (id_chat, id_usuario) VALUES (?, ?)',
                                            [chatId, userId]
                                        );

                                        const role = i === 0 ? 'admin' : 'member';
                                        await db.run(
                                            'INSERT INTO GRUPO_USUARIO (id_grupo, id_usuario, rol) VALUES (?, ?, ?)',
                                            [this.lastID, userId, role]
                                        );
                                    }

                                    // Add welcome message
                                    db.run(
                                        'INSERT INTO MENSAJE (id_chat, id_usuario_remitente, contenido) VALUES (?, ?, ?)',
                                        [chatId, users[0].id_usuario, '¡Bienvenidos al grupo de TecChat!']
                                    );

                                    console.log('Database initialized with test data');
                                    resolve();
                                });
                            }
                        );
                    }
                );

            } catch (error) {
                console.error('Error setting up database:', error);
                reject(error);
            }
        });
    });
}

// Main function
async function resetDatabase() {
    try {
        console.log('Starting database reset...');

        // Delete existing database files
        deleteDbFiles();

        // Recreate database with fresh tables
        await recreateDatabase();

        console.log('✅ Database reset completed successfully!');
    } catch (error) {
        console.error('❌ Database reset failed:', error);
        process.exit(1);
    }
}

// Run the reset
resetDatabase();
