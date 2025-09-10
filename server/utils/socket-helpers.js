/**
 * Socket.IO helper functions for messaging
 */

const { prepareMessageDeliveryData } = require('./message-utils');

/**
 * Send message delivery notifications to senders
 * 
 * @param {Object} io - Socket.IO instance
 * @param {Map} activeUsers - Map of active user IDs to socket IDs
 * @param {Object} messagesBySender - Object grouping messages by sender ID
 * @param {Object} options - Additional options (userId, chatId, chatType)
 */
function sendDeliveryNotifications(io, activeUsers, messagesBySender, options) {
    const { userId, chatId, chatType } = options;

    for (const senderId in messagesBySender) {
        const senderSocketId = activeUsers.get(parseInt(senderId));

        if (senderSocketId) {
            console.log(`Preparing delivery notification to ${senderId} for messages:`, messagesBySender[senderId]);

            const deliveryData = prepareMessageDeliveryData({
                messageIds: messagesBySender[senderId],
                userId,
                chatId,
                chatType
            });

            if (deliveryData) {
                console.log(`Sending delivery notification with messageIds:`, deliveryData.messageIds);
                io.to(senderSocketId).emit('messages-delivered', deliveryData);
            }
        } else {
            console.log(`User ${senderId} is offline, skipping delivery notification`);
        }
    }
}

module.exports = {
    sendDeliveryNotifications
};
