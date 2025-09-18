const { generateResponse } = require('../services/geminiService');
const { storeMessage, getMessages, clearMessages } = require('../services/redisService');
const { searchArticles } = require('../services/newsService');

exports.chat = async (req, res) => {
  try {
    const { message } = req.body;
    const sessionId = req.sessionId;
    
    // Store user message
    await storeMessage(sessionId, 'user', message);
    
    // Retrieve relevant articles
    const relevantArticles = await searchArticles(message);
    const context = relevantArticles.map(article => article.text).join('\n\n');
    
    // Generate response
    const answer = await generateResponse(message, context);
    
    // Store bot response
    await storeMessage(sessionId, 'bot', answer);
    
    res.json({ answer, sessionId });
  } catch (error) {
    console.error('Error in chat controller:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await getMessages(sessionId);
    res.json({ history: messages });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.clearHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await clearMessages(sessionId);
    res.json({ message: 'Session history cleared' });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};