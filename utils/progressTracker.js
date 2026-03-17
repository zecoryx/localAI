/**
 * SSE Progress Tracking Utility
 * Helps in formatting SSE messages and calculating progress
 */

/**
 * Creates a formatted SSE message string
 * @param {string} type - The type of event (e.g., 'extraction', 'chunk', 'complete', 'error')
 * @param {Object} data - The data payload for the event
 * @returns {string} - Formatted SSE data string
 */
function createSSEMessage(type, data) {
    return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

/**
 * Calculates progress percentage
 * @param {number} current - Current step/index
 * @param {number} total - Total steps/indices
 * @returns {number} - Progress percentage (0-100)
 */
function calculateProgress(current, total) {
    if (total === 0) return 100;
    return Math.round((current / total) * 100);
}

module.exports = {
    createSSEMessage,
    calculateProgress
};
