const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getPool } = require('../database/provider-factory');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create subdirectories for different file types
const subdirs = ['images', 'videos', 'documents', 'audio'];
subdirs.forEach(dir => {
    const fullPath = path.join(uploadsDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let subdir = 'documents'; // default

        if (file.mimetype.startsWith('image/')) {
            subdir = 'images';
        } else if (file.mimetype.startsWith('video/')) {
            subdir = 'videos';
        } else if (file.mimetype.startsWith('audio/')) {
            subdir = 'audio';
        }

        const dest = path.join(uploadsDir, subdir);
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: timestamp_userId_originalname
        const timestamp = Date.now();
        const userId = req.userId;
        const ext = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, ext);

        // Clean filename by replacing problematic characters
        const cleanName = nameWithoutExt
            .replace(/[^a-zA-Z0-9\-_]/g, '_') // Replace special chars with underscore
            .replace(/_+/g, '_') // Replace multiple underscores with single
            .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

        const filename = `${timestamp}_${userId}_${cleanName}${ext}`;
        cb(null, filename);
    }
});

// File filter function
const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
        // Images
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        // Videos
        'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/quicktime', 'video/mov', 'video/x-msvideo',
        // Audio
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac',
        // Documents
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 5 // Max 5 files at once
    }
});

/**
 * Upload file and send as message
 */
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const { chatId, caption = '' } = req.body;

        if (!req.file) {
            return res.status(400).json({
                error: 'No se proporcionó archivo',
                code: 'NO_FILE'
            });
        }

        if (!chatId) {
            return res.status(400).json({
                error: 'ID de chat requerido',
                code: 'MISSING_CHAT_ID'
            });
        }

        const db = getPool();

        // Verify user participates in chat
        const participation = await db.query(
            'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
            [chatId, req.userId]
        );

        if (participation.length === 0) {
            // Delete uploaded file if chat verification fails
            fs.unlinkSync(req.file.path);
            return res.status(404).json({
                error: 'Chat no encontrado o sin acceso',
                code: 'CHAT_NOT_FOUND'
            });
        }

        // Determine message type based on file mimetype
        let messageType = 'documento';
        if (req.file.mimetype.startsWith('image/')) {
            messageType = 'imagen';
        } else if (req.file.mimetype.startsWith('video/')) {
            messageType = 'video';
        } else if (req.file.mimetype.startsWith('audio/')) {
            messageType = 'audio';
        }

        // Create message in database
        const messageResult = await db.query(`
            INSERT INTO MENSAJE (id_chat, id_usuario_remitente, contenido, tipo, enviado_en)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [chatId, req.userId, caption, messageType]);

        const messageId = messageResult.lastID;

        // Create multimedia record
        const fileUrl = `/uploads/${path.basename(path.dirname(req.file.path))}/${req.file.filename}`;

        const metadata = {
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            encoding: req.file.encoding
        };

        // Generate thumbnail for videos
        let thumbnailUrl = null;
        if (messageType === 'video') {
            try {
                const videoPath = req.file.path;
                const videoFilename = path.basename(videoPath);
                const thumbnailFilename = `${path.parse(videoFilename).name}_thumb.jpg`;
                const thumbnailDir = path.join(__dirname, '../uploads/thumbnails');
                const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

                // Create thumbnails directory if it doesn't exist
                if (!fs.existsSync(thumbnailDir)) {
                    fs.mkdirSync(thumbnailDir, { recursive: true });
                }

                // Use child_process to extract thumbnail
                const { spawn } = require('child_process');

                // Create promise for thumbnail generation
                await new Promise((resolve, reject) => {
                    const ffmpeg = spawn('ffmpeg', [
                        '-i', videoPath,
                        '-ss', '00:00:01.000',
                        '-vframes', '1',
                        '-vf', 'scale=320:240',
                        '-q:v', '2',
                        thumbnailPath,
                        '-y'  // Overwrite if exists
                    ]);

                    ffmpeg.on('close', (code) => {
                        if (code === 0) {
                            thumbnailUrl = `/uploads/thumbnails/${thumbnailFilename}`;
                            metadata.thumbnailUrl = thumbnailUrl;
                            resolve();
                        } else {
                            console.error(`Error generating thumbnail for ${videoFilename}`);
                            resolve(); // Continue even if thumbnail generation fails
                        }
                    });

                    ffmpeg.on('error', (err) => {
                        console.error('FFmpeg error:', err);
                        resolve(); // Continue even if thumbnail generation fails
                    });
                });
            } catch (error) {
                console.error('Error generating video thumbnail:', error);
                // Continue without thumbnail
            }
        }

        await db.query(`
            INSERT INTO MULTIMEDIA (id_mensaje, url_archivo, tipo, metadata, tamano_bytes)
            VALUES (?, ?, ?, ?, ?)
        `, [messageId, fileUrl, messageType, JSON.stringify(metadata), req.file.size]);

        // Get the complete message with sender info
        const newMessage = await db.query(`
            SELECT 
                m.id_mensaje,
                m.id_chat,
                m.id_usuario_remitente,
                m.contenido,
                m.tipo,
                m.enviado_en,
                m.leido_en,
                u.nombre as nombre_remitente,
                u.telefono as telefono_remitente
            FROM MENSAJE m
            JOIN USUARIO u ON m.id_usuario_remitente = u.id_usuario
            WHERE m.id_mensaje = ?
        `, [messageId]);

        // Get multimedia info
        const multimedia = await db.query(
            'SELECT id_media, url_archivo, tipo, metadata, tamano_bytes FROM MULTIMEDIA WHERE id_mensaje = ?',
            [messageId]
        );

        const message = newMessage[0];
        message.multimedia = multimedia;

        // Emit WebSocket event to other participants
        const socketHandler = req.app.get('socketHandler');
        if (socketHandler) {
            socketHandler.sendToChat(chatId, 'new_message', {
                ...message,
                chat_id: chatId, // Add chat_id for frontend compatibility
                isOwn: false // Will be overridden by sender's client
            });
        }

        res.status(201).json({
            message: 'Archivo subido y mensaje enviado',
            data: message
        });

    } catch (error) {
        console.error('Upload error:', error);

        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            error: 'Error subiendo archivo',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Upload multiple files
 */
router.post('/multiple', requireAuth, upload.array('files', 5), async (req, res) => {
    try {
        const { chatId, captions = [] } = req.body;

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No se proporcionaron archivos',
                code: 'NO_FILES'
            });
        }

        if (!chatId) {
            return res.status(400).json({
                error: 'ID de chat requerido',
                code: 'MISSING_CHAT_ID'
            });
        }

        const db = getPool();

        // Verify user participates in chat
        const participation = await db.query(
            'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
            [chatId, req.userId]
        );

        if (participation.length === 0) {
            // Delete uploaded files if chat verification fails
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
            return res.status(404).json({
                error: 'Chat no encontrado o sin acceso',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const messages = [];
        const captionsArray = Array.isArray(captions) ? captions : JSON.parse(captions || '[]');

        // Process each file
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const caption = captionsArray[i] || '';

            // Determine message type
            let messageType = 'documento';
            if (file.mimetype.startsWith('image/')) {
                messageType = 'imagen';
            } else if (file.mimetype.startsWith('video/')) {
                messageType = 'video';
            } else if (file.mimetype.startsWith('audio/')) {
                messageType = 'audio';
            }

            // Create message
            const messageResult = await db.query(`
                INSERT INTO MENSAJE (id_chat, id_usuario_remitente, contenido, tipo, enviado_en)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [chatId, req.userId, caption, messageType]);

            const messageId = messageResult.lastID;

            // Create multimedia record
            const fileUrl = `/uploads/${path.basename(path.dirname(file.path))}/${file.filename}`;

            const metadata = {
                originalName: file.originalname,
                mimetype: file.mimetype,
                encoding: file.encoding
            };

            await db.query(`
                INSERT INTO MULTIMEDIA (id_mensaje, url_archivo, tipo, metadata, tamano_bytes)
                VALUES (?, ?, ?, ?, ?)
            `, [messageId, fileUrl, messageType, JSON.stringify(metadata), file.size]);

            // Get complete message info
            const newMessage = await db.query(`
                SELECT 
                    m.id_mensaje,
                    m.id_chat,
                    m.id_usuario_remitente,
                    m.contenido,
                    m.tipo,
                    m.enviado_en,
                    m.leido_en,
                    u.nombre as nombre_remitente,
                    u.telefono as telefono_remitente
                FROM MENSAJE m
                JOIN USUARIO u ON m.id_usuario_remitente = u.id_usuario
                WHERE m.id_mensaje = ?
            `, [messageId]);

            const multimedia = await db.query(
                'SELECT id_media, url_archivo, tipo, metadata, tamano_bytes FROM MULTIMEDIA WHERE id_mensaje = ?',
                [messageId]
            );

            const message = newMessage[0];
            message.multimedia = multimedia;
            messages.push(message);
        }

        // Emit WebSocket events for all messages
        const socketHandler = req.app.get('socketHandler');
        if (socketHandler) {
            messages.forEach(message => {
                socketHandler.sendToChat(chatId, 'new_message', {
                    ...message,
                    chat_id: chatId, // Add chat_id for frontend compatibility
                    isOwn: false // Will be overridden by sender's client
                });
            });
        }

        res.status(201).json({
            message: `${messages.length} archivos subidos y mensajes enviados`,
            data: messages
        });

    } catch (error) {
        console.error('Multiple upload error:', error);

        // Clean up uploaded files on error
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }

        res.status(500).json({
            error: 'Error subiendo archivos',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Delete uploaded file
 */
router.delete('/:messageId', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;

        const db = getPool();

        // Get message and verify ownership
        const messages = await db.query(
            'SELECT id_mensaje, id_chat, id_usuario_remitente FROM MENSAJE WHERE id_mensaje = ?',
            [messageId]
        );

        if (messages.length === 0) {
            return res.status(404).json({
                error: 'Mensaje no encontrado',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        const message = messages[0];

        // Verify user owns the message or participates in chat
        if (message.id_usuario_remitente !== req.userId) {
            const participation = await db.query(
                'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
                [message.id_chat, req.userId]
            );

            if (participation.length === 0) {
                return res.status(403).json({
                    error: 'Sin permisos para eliminar este archivo',
                    code: 'FORBIDDEN'
                });
            }
        }

        // Get multimedia files to delete
        const multimedia = await db.query(
            'SELECT url_archivo FROM MULTIMEDIA WHERE id_mensaje = ?',
            [messageId]
        );

        // Delete physical files
        multimedia.forEach(media => {
            const filePath = path.join(__dirname, '..', media.url_archivo);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });

        // Delete from database (CASCADE will handle multimedia table)
        await db.query('DELETE FROM MENSAJE WHERE id_mensaje = ?', [messageId]);

        res.json({ message: 'Archivo y mensaje eliminados' });

        // TODO: Emit WebSocket event for message deletion

    } catch (error) {
        console.error('Delete upload error:', error);
        res.status(500).json({
            error: 'Error eliminando archivo',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;
