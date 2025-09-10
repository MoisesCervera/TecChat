const bcrypt = require('bcrypt');
const { getPool } = require('./provider-factory');

/**
 * Seed sample data for testing
 * Spanish content with dummy users and conversations
 */

const sampleUsers = [
    {
        telefono: '+34612345678',
        nombre: 'María García',
        password: 'password123'
    },
    {
        telefono: '+34687654321',
        nombre: 'José Rodríguez',
        password: 'password123'
    },
    {
        telefono: '+34611223344',
        nombre: 'Ana López',
        password: 'password123'
    },
    {
        telefono: '+34655443322',
        nombre: 'Carlos Martín',
        password: 'password123'
    }
];

const sampleMessages = [
    {
        chat: 1,
        sender: 1,
        content: '¡Hola! ¿Cómo estás?',
        timestamp: '2024-01-10 10:00:00'
    },
    {
        chat: 1,
        sender: 2,
        content: '¡Hola María! Todo bien, ¿y tú?',
        timestamp: '2024-01-10 10:05:00'
    },
    {
        chat: 1,
        sender: 1,
        content: 'Muy bien también. ¿Vienes a la reunión de mañana?',
        timestamp: '2024-01-10 10:10:00'
    },
    {
        chat: 1,
        sender: 2,
        content: 'Sí, estaré allí a las 3 PM',
        timestamp: '2024-01-10 10:15:00'
    },
    {
        chat: 2,
        sender: 1,
        content: 'Ana, ¿tienes los documentos que te pedí?',
        timestamp: '2024-01-09 15:30:00'
    },
    {
        chat: 2,
        sender: 3,
        content: 'Sí, te los envío por email en un momento',
        timestamp: '2024-01-09 15:45:00'
    },
    {
        chat: 2,
        sender: 3,
        content: 'Ya están enviados ✅',
        timestamp: '2024-01-09 16:00:00'
    },
    {
        chat: 3,
        sender: 4,
        content: '¿Quedamos para tomar un café?',
        timestamp: '2024-01-11 09:00:00'
    },
    {
        chat: 3,
        sender: 1,
        content: 'Me parece perfecto. ¿A qué hora te viene bien?',
        timestamp: '2024-01-11 09:15:00'
    },
    {
        chat: 3,
        sender: 4,
        content: 'Sobre las 5 PM en el café de siempre',
        timestamp: '2024-01-11 09:20:00'
    }
];

const seedDatabase = async () => {
    try {
        console.log('🌱 Iniciando seed de la base de datos...');
        const db = getPool();

        // Check if data already exists
        const existingUsers = await db.query('SELECT COUNT(*) as count FROM USUARIO');
        if (existingUsers[0].count > 0) {
            console.log('✅ La base de datos ya contiene datos');
            return;
        }

        // Create users
        console.log('📝 Creando usuarios de prueba...');
        const userIds = [];

        for (const userData of sampleUsers) {
            const passwordHash = await bcrypt.hash(userData.password, 10);

            const result = await db.query(
                `INSERT INTO USUARIO (telefono, nombre, password_hash, ultima_conexion) 
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
                [userData.telefono, userData.nombre, passwordHash]
            );

            userIds.push(result.lastID);
            console.log(`  ✅ Usuario creado: ${userData.nombre} (${userData.telefono})`);
        }

        // Create contacts (mutual relationships)
        console.log('📞 Creando relaciones de contactos...');
        const contacts = [
            { user: userIds[0], contact: userIds[1], alias: 'José' },
            { user: userIds[1], contact: userIds[0], alias: 'María' },
            { user: userIds[0], contact: userIds[2], alias: 'Anita' },
            { user: userIds[2], contact: userIds[0], alias: 'María G.' },
            { user: userIds[0], contact: userIds[3], alias: 'Carlos M.' },
            { user: userIds[3], contact: userIds[0], alias: 'María' },
            { user: userIds[1], contact: userIds[2], alias: 'Ana' },
            { user: userIds[2], contact: userIds[1], alias: 'José R.' }
        ];

        for (const contact of contacts) {
            await db.query(
                'INSERT INTO CONTACTO (id_usuario, id_usuario_contacto, alias) VALUES (?, ?, ?)',
                [contact.user, contact.contact, contact.alias]
            );
        }

        // Create chats
        console.log('💬 Creando chats...');
        const chats = [
            { tipo: 'individual', participantes: [userIds[0], userIds[1]] }, // María - José
            { tipo: 'individual', participantes: [userIds[0], userIds[2]] }, // María - Ana
            { tipo: 'individual', participantes: [userIds[0], userIds[3]] }  // María - Carlos
        ];

        const chatIds = [];
        for (const chat of chats) {
            const result = await db.query(
                'INSERT INTO CHAT (tipo) VALUES (?)',
                [chat.tipo]
            );

            chatIds.push(result.lastID);

            // Add participants
            for (const participante of chat.participantes) {
                await db.query(
                    'INSERT INTO CHAT_PARTICIPANTE (id_chat, id_usuario) VALUES (?, ?)',
                    [result.lastID, participante]
                );
            }
        }

        // Create messages
        console.log('📨 Creando mensajes de prueba...');
        for (const message of sampleMessages) {
            await db.query(
                `INSERT INTO MENSAJE (id_chat, id_usuario_remitente, contenido, enviado_en, leido_en) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    chatIds[message.chat - 1], // Convert to actual chat ID
                    userIds[message.sender - 1], // Convert to actual user ID
                    message.content,
                    message.timestamp,
                    message.timestamp // Mark as read for testing
                ]
            );
        }

        // Create a sample group
        console.log('👥 Creando grupo de prueba...');
        const groupChatResult = await db.query(
            'INSERT INTO CHAT (tipo) VALUES (?)',
            ['grupo']
        );

        const groupChatId = groupChatResult.lastID;

        // Add all users to group chat
        for (const userId of userIds) {
            await db.query(
                'INSERT INTO CHAT_PARTICIPANTE (id_chat, id_usuario) VALUES (?, ?)',
                [groupChatId, userId]
            );
        }

        // Create group
        const groupResult = await db.query(
            'INSERT INTO GRUPO (id_chat, nombre) VALUES (?, ?)',
            [groupChatId, 'Amigos del Café']
        );

        // Add group members with roles
        await db.query(
            'INSERT INTO GRUPO_USUARIO (id_grupo, id_usuario, rol) VALUES (?, ?, ?)',
            [groupResult.lastID, userIds[0], 'admin']
        );

        for (let i = 1; i < userIds.length; i++) {
            await db.query(
                'INSERT INTO GRUPO_USUARIO (id_grupo, id_usuario, rol) VALUES (?, ?, ?)',
                [groupResult.lastID, userIds[i], 'member']
            );
        }

        // Add group messages
        const groupMessages = [
            'Hola a todos! 👋',
            'Hola María!',
            '¿Cómo están todos?',
            'Todo bien por aquí'
        ];

        for (let i = 0; i < groupMessages.length; i++) {
            await db.query(
                `INSERT INTO MENSAJE (id_chat, id_usuario_remitente, contenido, enviado_en, leido_en) 
                 VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [groupChatId, userIds[i % userIds.length], groupMessages[i]]
            );
        }

        console.log('✅ Seed completado exitosamente!');
        console.log('\n📋 Datos de prueba creados:');
        console.log('  👤 4 usuarios (contraseña: password123)');
        console.log('  📞 8 relaciones de contacto');
        console.log('  💬 3 chats individuales + 1 grupo');
        console.log('  📨 ' + (sampleMessages.length + groupMessages.length) + ' mensajes');
        console.log('\n🔑 Usuarios para probar:');
        sampleUsers.forEach(user => {
            console.log(`  📱 ${user.telefono} - ${user.nombre}`);
        });

    } catch (error) {
        console.error('❌ Error en seed:', error);
        throw error;
    }
};

module.exports = {
    seedDatabase
};
