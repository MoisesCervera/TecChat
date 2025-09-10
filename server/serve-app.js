/**
 * Unified server to serve both API and client app
 * This makes it easier to run on mobile devices in the same network
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

// Get the main server app
const { app, server } = require('./index-export');

const CLIENT_BUILD_PATH = path.join(__dirname, '../client/build');

// Check if client build exists
const clientBuildExists = fs.existsSync(CLIENT_BUILD_PATH);

if (clientBuildExists) {
    console.log('📱 Serving static React app from', CLIENT_BUILD_PATH);

    // Serve static files from the React app
    app.use(express.static(CLIENT_BUILD_PATH));

    // Handle React routing, return all requests to React app
    app.get('*', (req, res, next) => {
        // Skip API routes and direct file requests
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
            return next();
        }
        res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
    });
} else {
    console.warn('⚠️ Client build not found at', CLIENT_BUILD_PATH);
    console.warn('⚠️ Please run "npm run build" in the client directory first');

    // Provide instructions at the root route if client build isn't available
    app.get('/', (req, res) => {
        res.send(`
            <html>
                <head>
                    <title>TecChat Server Running</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
                        h1 { color: #333; }
                        pre { background: #f4f4f4; border-left: 3px solid #ddd; padding: 15px; }
                        .note { background: #fffde7; padding: 10px; border-left: 4px solid #ffd600; }
                    </style>
                </head>
                <body>
                    <h1>TecChat Server Running</h1>
                    <p>The API server is running, but the client build files were not found.</p>
                    
                    <div class="note">
                        <h3>To access TecChat from your phone:</h3>
                        <p>1. Build the client app:</p>
                        <pre>cd ../client && npm run build</pre>
                        <p>2. Restart this server</p>
                        <p>3. Access using this device's IP address: http://${getLocalIpAddress()}:3002</p>
                    </div>
                    
                    <h3>API Status:</h3>
                    <p>API is running at <a href="/api/health">/api/health</a></p>
                </body>
            </html>
        `);
    });
}

// Helper function to get local IP address
function getLocalIpAddress() {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();

    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];

        for (const iface of interfaces) {
            // Skip over internal, non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }

    return 'localhost'; // Fallback
}

module.exports = server;
