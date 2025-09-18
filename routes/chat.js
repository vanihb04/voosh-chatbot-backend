const express = require('express');
const router = express.Router();
const { chat, getHistory, clearHistory } = require('../controllers/chatController');

router.post('/', chat);
router.get('/history/:sessionId', getHistory);
router.delete('/history/:sessionId', clearHistory);

module.exports = router;