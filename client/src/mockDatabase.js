/**
 * Mock Database using localStorage
 * This simulates a persistent database for the chat application
 * It stores messages, user data, and chat state
 */

// Constants for localStorage keys
const DB_PREFIX = 'tecchat_db_';
const USERS_KEY = `${DB_PREFIX}users`;
const MESSAGES_KEY = `${DB_PREFIX}messages`;
const SCROLL_POSITIONS_KEY = `${DB_PREFIX}scroll_positions`;

// Initial mock data
const initialUsers = [
    { id: 1, name: 'Alejandra' },
    { id: 2, name: 'Reyli' },
    { id: 3, name: 'Sebas' }
];

const initialMessages = {
    1: [
        { id: '1-1', from: 'Alejandra', text: 'Hola!', time: '09:32', status: 'read' },
        { id: '1-2', from: 'Me', text: 'Hola! ¿Cómo estás?', time: '09:33', status: 'read' },
        { id: '1-3', from: 'Alejandra', text: 'Muy bien, gracias. ¿Y tú?', time: '09:35', status: 'read' },
        { id: '1-4', from: 'Me', text: 'Bien también, preparando algunas cosas para la clase.', time: '09:36', status: 'read' }
    ],
    2: [
        { id: '2-1', from: 'Reyli', text: 'Oye, ¿viste el correo del profesor?', time: '10:15', status: 'read' },
        { id: '2-2', from: 'Me', text: 'No, ¿qué decía?', time: '10:17', status: 'delivered' },
        { id: '2-3', from: 'Reyli', text: 'Aplazó la entrega para la próxima semana', time: '10:18', status: 'read' },
        { id: '2-4', from: 'Me', text: '¡Excelente! Necesitaba más tiempo.', time: '10:20', status: 'sent' }
    ],
    3: [
        { id: '3-1', from: 'Sebas', text: 'Hey, ¿vas a ir a la fiesta de Claudia?', time: '12:05', status: 'read' },
        { id: '3-2', from: 'Me', text: 'No estoy seguro todavía, tengo mucho trabajo 😅', time: '12:10', status: 'read' },
        { id: '3-3', from: 'Sebas', text: '¡Vamos! Todos estarán ahí.', time: '12:12', status: 'delivered' },
        { id: '3-4', from: 'Me', text: 'Intentaré terminar a tiempo, te aviso más tarde', time: '12:15', status: 'delivered' },
    ]
};

/**
 * Initialize the database if it doesn't exist
 */
function initializeDatabase() {
    if (!localStorage.getItem(USERS_KEY)) {
        localStorage.setItem(USERS_KEY, JSON.stringify(initialUsers));
    }

    // Initialize messages, but preserve existing ones if they exist
    if (!localStorage.getItem(MESSAGES_KEY)) {
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(initialMessages));
    } else {
        try {
            // Check if we need to add timestamp info to existing messages for deduplication
            const existingMessages = JSON.parse(localStorage.getItem(MESSAGES_KEY));
            let updated = false;

            // Add timestamps to any messages that don't have them
            Object.keys(existingMessages).forEach(userId => {
                existingMessages[userId].forEach(msg => {
                    if (!msg.timestamp) {
                        msg.timestamp = Date.now() - Math.floor(Math.random() * 60000); // Random time in the last minute
                        updated = true;
                    }
                    if (!msg.id) {
                        msg.id = `${userId}-${msg.timestamp}`;
                        updated = true;
                    }
                });
            });

            if (updated) {
                localStorage.setItem(MESSAGES_KEY, JSON.stringify(existingMessages));
                console.log('Added timestamps to existing messages for deduplication');
            }
        } catch (e) {
            console.error('Error upgrading message format:', e);
            // If error, reset to initial state
            localStorage.setItem(MESSAGES_KEY, JSON.stringify(initialMessages));
        }
    }

    if (!localStorage.getItem(SCROLL_POSITIONS_KEY)) {
        localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({}));
    }
}

/**
 * Reset the database to initial state (for testing)
 */
function resetDatabase() {
    localStorage.setItem(USERS_KEY, JSON.stringify(initialUsers));
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(initialMessages));
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({}));
    console.log('Database reset to initial state');
}

/**
 * Get all users from database
 */
function getUsers() {
    initializeDatabase();
    return JSON.parse(localStorage.getItem(USERS_KEY));
}

/**
 * Get all messages for all users
 */
function getAllMessages() {
    initializeDatabase();
    return JSON.parse(localStorage.getItem(MESSAGES_KEY));
}

/**
 * Get messages for a specific user
 */
function getUserMessages(userId) {
    const allMessages = getAllMessages();
    return allMessages[userId] || [];
}

/**
 * Add a new message
 */
function addMessage(userId, message) {
    const allMessages = getAllMessages();

    // Check if this is a duplicate message by comparing with most recent messages
    const userMessages = allMessages[userId] || [];

    // Create a unique timestamp-based ID for the message
    const timestamp = Date.now();
    const messageId = `${userId}-${timestamp}`;

    // Create message with unique ID
    const newMessage = {
        ...message,
        id: messageId,
        timestamp: timestamp  // Store timestamp for sorting/deduplication
    };

    // Check for duplicates by comparing text content with recent messages
    // This helps prevent auto-replies from being generated multiple times
    const isDuplicate = userMessages.some(msg =>
        msg.from === message.from &&
        msg.text === message.text &&
        // Only check messages from last 10 seconds to avoid false positives
        msg.timestamp && (timestamp - msg.timestamp < 10000)
    );

    if (isDuplicate) {
        console.log(`Duplicate message detected, not adding: ${message.text}`);
        return null;
    }

    // Update messages for this user
    allMessages[userId] = [...userMessages, newMessage];

    // Save to localStorage
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
    console.log(`Message added to database for user ${userId}: ${message.text}`);

    return newMessage;
}/**
 * Update a message's status
 */
function updateMessageStatus(userId, messageId, status) {
    const allMessages = getAllMessages();
    const userMessages = allMessages[userId] || [];

    const updatedMessages = userMessages.map(msg =>
        msg.id === messageId ? { ...msg, status } : msg
    );

    allMessages[userId] = updatedMessages;
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allMessages));
}

/**
 * Get scroll position for a specific chat
 */
function getScrollPosition(userId) {
    initializeDatabase();
    const positions = JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY));
    return positions[userId] || null;
}

/**
 * Save scroll position for a specific chat
 */
function saveScrollPosition(userId, position) {
    initializeDatabase();
    const positions = JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY));
    positions[userId] = position;
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
}

/**
 * Clear all scroll positions
 */
function clearScrollPositions() {
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({}));
}

export {
    initializeDatabase,
    resetDatabase,
    getUsers,
    getAllMessages,
    getUserMessages,
    addMessage,
    updateMessageStatus,
    getScrollPosition,
    saveScrollPosition,
    clearScrollPositions
};
