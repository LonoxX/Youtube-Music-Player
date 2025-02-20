const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../../config.json');

router.post('/auth/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const response = await axios.post(`http://${config.YoutubeMusicHostIP}:${config.YoutubeMusicHostPort}/auth/${id}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/song-info', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const response = await axios.get(`http://${config.YoutubeMusicHostIP}:${config.YoutubeMusicHostPort}/api/v1/song-info`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/v1/queue', async (req, res) => {
    try {
        const queueResponse = await axios.get(`http://${config.YoutubeMusicHostIP}:${config.YoutubeMusicHostPort}/api/v1/queue`);
        let queue = queueResponse.data;

        if (!Array.isArray(queue)) {
            queue = queue.items || [];
        }

        res.json(queue);
    } catch (error) {
        console.error('Queue fetch error:', error);
        console.error('Response data:', error.response?.data);
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/v1/search', async (req, res) => {
    const { query } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const response = await axios.post(`http://${config.YoutubeMusicHostIP}:${config.YoutubeMusicHostPort}/api/v1/search`,
            { query },
            {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Search error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

router.get('/api/version', (req, res) => {
    const packageJson = require('../../package.json');
    res.json({ version: packageJson.version });
});

module.exports = router;
