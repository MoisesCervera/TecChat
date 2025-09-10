/**
 * Helper functions for message status management
 */

// Cache of message status by ID
const messageStatusCache = new Map();

/**
 * Initialize message status tracking
 */
function resetMessageStatus() {
    messageStatusCache.clear();
}

/**
 * Update the status of a message
 * @param {string|number} messageId - The ID of the message
 * @param {string} status - The new status ('sending', 'sent', 'delivered', 'read', 'group-read', 'failed')
 */
function updateMessageStatus(messageId, status) {
    if (!messageId) return;

    console.log(`Updating message ${messageId} status to ${status}`);
    messageStatusCache.set(messageId.toString(), status);
}

/**
 * Update multiple message statuses at once
 * @param {Array<string|number>} messageIds - Array of message IDs
 * @param {string} status - The status to set for all messages
 */
function batchUpdateMessageStatus(messageIds, status) {
    if (!messageIds || !Array.isArray(messageIds)) {
        console.warn('Invalid messageIds provided to batchUpdateMessageStatus:', messageIds);
        return;
    }

    messageIds.forEach(id => {
        if (id) {
            updateMessageStatus(id, status);
        }
    });
}

/**
 * Get the current status of a message
 * @param {string|number} messageId - The ID of the message
 * @param {string} defaultStatus - Default status if none is found
 * @returns {string} The current message status
 */
function getMessageStatus(messageId, defaultStatus = 'sent') {
    if (!messageId) return defaultStatus;

    const status = messageStatusCache.get(messageId.toString());
    return status || defaultStatus;
}

/**
 * Remove a message from tracking
 * @param {string|number} messageId - The ID of the message to remove
 */
function removeMessageStatus(messageId) {
    if (!messageId) return;

    messageStatusCache.delete(messageId.toString());
}

/**
 * Helper to check if a variable is a valid array
 * @param {any} arr - Value to check
 * @returns {boolean} True if it's an array with length > 0
 */
function isValidArray(arr) {
    return Array.isArray(arr) && arr.length > 0;
}

/**
 * Acknowledge message receipt to the server
 * @param {Object} socket - The socket.io connection
 * @param {string|number} messageId - ID of the message received
 * @param {string|number} chatId - ID of the chat
 * @param {string} chatType - Type of chat ('individual' or 'grupo')
 */
function acknowledgeMessageReceipt(socket, messageId, chatId, chatType) {
    if (!socket || !messageId || !chatId) return;

    try {
        console.log(`Acknowledging receipt of message ${messageId} in chat ${chatId}`);
        socket.emit('message-received', {
            messageId,
            chatId,
            chatType: chatType || 'individual'
        });
    } catch (error) {
        console.error('Error acknowledging message receipt:', error);
    }
}

/**
 * Process message delivery data from different formats
 * @param {Object} data - The delivery data object
 * @returns {Array} Array of message IDs that were delivered
 */
function processDeliveryData(data) {
    if (!data) return [];

    // Format 1: {messageIds: [1, 2, 3]}
    if (isValidArray(data.messageIds)) {
        return data.messageIds.filter(id => id);
    }

    // Format 2: {messages: [1, 2, 3]} or {messages: [{id_mensaje: 1}, ...]}
    if (isValidArray(data.messages)) {
        return data.messages
            .filter(msg => msg)
            .map(msg => {
                if (typeof msg === 'object' && msg.id_mensaje) {
                    return msg.id_mensaje;
                }
                return msg;
            })
            .filter(id => id);
    }

    return [];
}

export {
    resetMessageStatus,
    updateMessageStatus,
    batchUpdateMessageStatus,
    getMessageStatus,
    removeMessageStatus,
    processDeliveryData,
    acknowledgeMessageReceipt
};
