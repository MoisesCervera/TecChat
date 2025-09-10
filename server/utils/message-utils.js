/**
 * Utility to ensure message event data is properly formatted
 * This file contains helper functions for the websocket.js file
 */

/**
 * Ensures messageIds is always a valid array
 * @param {any} messageIds - The message IDs to sanitize
 * @returns {number[]} - An array of valid message IDs
 */
function sanitizeMessageIds(messageIds) {
    if (!messageIds) return [];

    if (Array.isArray(messageIds)) {
        return messageIds.filter(id => id !== null && id !== undefined);
    }

    if (typeof messageIds === 'object') {
        // If it's an object with messageId properties, extract them
        return Object.values(messageIds)
            .filter(val => val !== null && val !== undefined)
            .map(val => typeof val === 'object' && val.id_mensaje ? val.id_mensaje : val);
    }

    // If it's a single value, wrap in array
    return [messageIds].filter(id => id !== null && id !== undefined);
}

/**
 * Prepares message delivery data for sending
 * @param {object} options - Options for the message delivery data
 * @returns {object} - Formatted message delivery data
 */
function prepareMessageDeliveryData({ messageIds, userId, chatId, chatType, timestamp = new Date().toISOString() }) {
    const sanitizedIds = sanitizeMessageIds(messageIds);

    if (sanitizedIds.length === 0) {
        return null; // Don't send empty arrays
    }

    return {
        messageIds: sanitizedIds,
        userId,
        chatId,
        chatType,
        timestamp
    };
}

module.exports = {
    sanitizeMessageIds,
    prepareMessageDeliveryData
};
