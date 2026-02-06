const axios = require('axios');
require('dotenv').config();

const askDeepSeek = async (prompt) => {
    try {
        const response = await axios.post(process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434/api/generate', {
            model: process.env.MODEL_NAME,
            prompt: `Sen veb-sayt dizaynerisan. Faqat JSON qaytar. So'rov: ${prompt}`,
            stream: false,
            format: "json"
        });
        return JSON.parse(response.data.response);
    } catch (error) {
        console.error("AI xatosi:", error.message);
        throw error;
    }
};

module.exports = { askDeepSeek };