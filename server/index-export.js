/**
 * Export server app and http server instance for use in serve-app.js
 */

// Import the original index.js but capture the exported objects
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const { initializeDatabase, DATABASE_PROVIDER } = require('./database/provider-factory');
const { seedDatabase } = require('./database/seed');
const { authCors } = require('./middleware/auth');
const SocketHandler = require('./websocket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces

// Initialize Socket.IO with improved configuration
const io = socketIo(server, {
    cors: {
        // Allow connections from any origin
        origin: (origin, callback) => {
            // For development, accept any origin
            callback(null, true);
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true
    },
    allowEIO3: true, // Allow Engine.IO 3 compatibility
    pingTimeout: 60000, // 60s without a pong packet to consider the connection closed
    pingInterval: 25000, // How often to ping the client (25s)
    transports: ['websocket', 'polling'], // Prefer WebSocket, fall back to polling
    cookie: false, // Don't use cookies for session management (use auth instead)
    upgradeTimeout: 10000 // Wait 10s for upgrade to WebSocket
});

// Initialize database and server
async function startServer() {
    try {
        console.log('Iniciando TecChat Server...');

        // Initialize database
        await initializeDatabase();
        console.log(`Base de datos inicializada (Proveedor: ${DATABASE_PROVIDER})`);

        // Seed sample data
        await seedDatabase();

        // Initialize WebSocket handler
        const socketHandler = new SocketHandler(io);
        console.log('WebSocket handler inicializado');

        // Make socket handler available to routes
        app.set('socketHandler', socketHandler);

        // CORS configuration for local network access
        app.use(cors({
            // For local development and network testing, allow all origins
            origin: true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // Session configuration (48-hour expiration)
        app.use(session({
            secret: 'techat-secret-key-change-in-production',
            resave: false,
            saveUninitialized: true, // Changed to true to ensure session is always created
            cookie: {
                maxAge: 48 * 60 * 60 * 1000, // 48 hours
                httpOnly: true,
                secure: false, // Set to true in production with HTTPS
                sameSite: 'lax', // Helps with cross-site request issues
                path: '/' // Ensure cookie is available for all paths
            }
        }));

        // Parse JSON bodies
        app.use(express.json());

        // Auth CORS middleware
        app.use('/api', authCors);

        // Static files for uploads (protected)
        app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

        // API Routes
        app.use('/api/auth', require('./routes/auth'));
        app.use('/api/users', require('./routes/users'));
        app.use('/api/messages', require('./routes/messages'));
        app.use('/api/upload', require('./routes/upload'));
        app.use('/api/chats', require('./routes/chats'));

        // Health check route
        app.get('/api/health', (req, res) => {
            res.json({
                status: 'ok',
                message: 'TecChat Server funcionando correctamente',
                timestamp: new Date().toISOString(),
                features: {
                    database: 'SQLite',
                    realtime: 'Socket.IO',
                    auth: 'Session-based',
                    uploads: 'Multer'
                }
            });
        });

        // Root route
        app.get('/api', (req, res) => {
            res.json({
                message: 'TecChat Server',
                version: '2.0.0',
                status: 'running',
                endpoints: {
                    health: '/api/health',
                    auth: '/api/auth/*',
                    users: '/api/users/*',
                    messages: '/api/messages/*',
                    upload: '/api/upload/*'
                }
            });
        });

        // Error handling middleware
        app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({
                error: 'Error interno del servidor',
                code: 'INTERNAL_ERROR'
            });
        });

        // 404 handler for API routes
        app.use('/api/*', (req, res) => {
            res.status(404).json({
                error: 'Endpoint no encontrado',
                code: 'NOT_FOUND'
            });
        });

        server.listen(PORT, HOST, () => {
            console.log(`TecChat Server ejecutándose en ${HOST}:${PORT}`);
            console.log(`Acceso local: http://localhost:${PORT}`);

            // Get all network interfaces
            const os = require('os');
            const networkInterfaces = os.networkInterfaces();
            const ipAddresses = [];

            Object.keys(networkInterfaces).forEach((interfaceName) => {
                networkInterfaces[interfaceName].forEach((iface) => {
                    // Skip over internal, non-IPv4 addresses
                    if (iface.family === 'IPv4' && !iface.internal) {
                        ipAddresses.push(iface.address);
                    }
                });
            });

            // Display all available IP addresses
            ipAddresses.forEach(ip => {
                console.log(`Acceso en red: http://${ip}:${PORT}`);
            });

            console.log(`API Health: http://localhost:${PORT}/api/health`);
            console.log(`WebSocket: ws://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Error iniciando servidor:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Cerrando servidor...');
    const { getPool } = require('./database/connection');
    await getPool().close();
    server.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\nCerrando servidor...');
    const { getPool } = require('./database/connection');
    await getPool().close();
    server.close();
    process.exit(0);
});

// Only start server if this is the main module
if (require.main === module) {
    startServer();
}

// Export for use in serve-app.js
module.exports = { app, server, startServer };
