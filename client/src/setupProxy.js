const { createProxyMiddleware } = require('http-proxy-middleware');

// Get the server URL from environment variable or default to localhost
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3002';

module.exports = function (app) {
    console.log(`Setting up proxy middleware to: ${SERVER_URL}`);

    // API proxy with retry and better error handling
    app.use(
        '/api',
        createProxyMiddleware({
            target: SERVER_URL,
            changeOrigin: true,
            secure: false,
            logLevel: 'debug', // Increased logging for debugging
            onError: (err, req, res) => {
                console.error(`Proxy error: ${err.message}`);
                res.status(502).json({
                    status: 'error',
                    message: 'Server connection error',
                    error: 'PROXY_ERROR'
                });
            }
        })
    );

    // Uploads proxy with retry and better error handling
    app.use(
        '/uploads',
        createProxyMiddleware({
            target: SERVER_URL,
            changeOrigin: true,
            secure: false,
            logLevel: 'debug',
            onError: (err, req, res) => {
                console.error(`Upload proxy error: ${err.message}`);
                res.status(502).json({
                    status: 'error',
                    message: 'Upload server connection error',
                    error: 'UPLOAD_PROXY_ERROR'
                });
            }
        })
    );
};
