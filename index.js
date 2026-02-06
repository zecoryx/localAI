const express = require('express');
const { askDeepSeek } = require('./services/ai.service');
require('dotenv').config();

const app = express();
app.use(express.json());

app.post('/generate', async (req, res) => {
    try {
        const { prompt } = req.body;
        const result = await askDeepSeek(prompt);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishga tushdi: http://62.84.179.228:${PORT}`);
});