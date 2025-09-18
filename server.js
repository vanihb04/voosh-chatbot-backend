const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const redis = require("redis");
const cors = require("cors");
require("dotenv").config();

const NEWS_API_KEY = process.env.NEWS_API_KEY || "9bef794abf664969970fa872ad261705";

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Create Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

(async () => {
  await redisClient.connect();
})();

// Real chat endpoint with news search
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const sessionId = req.headers['x-session-id'];

    // Store user message in Redis
    await redisClient.lPush(
      `session:${sessionId}:messages`,
      JSON.stringify({
        type: "user",
        content: message,
        timestamp: new Date().toISOString(),
      })
    );

    let responseData = {
      type: 'bot',
      content: '',
      articles: [],
      timestamp: new Date().toISOString()
    };

    // Check if the message is asking for news
    if (message.toLowerCase().includes('news') || 
        ['technology', 'sports', 'business', 'health', 'science', 'entertainment', 'general']
        .some(category => message.toLowerCase().includes(category))) {
      
      // Extract category from message
      let category = 'general';
      const categories = ['technology', 'sports', 'business', 'health', 'science', 'entertainment'];
      
      for (const cat of categories) {
        if (message.toLowerCase().includes(cat)) {
          category = cat;
          break;
        }
      }

      try {
        // Fetch news from NewsAPI
        const newsUrl = `https://newsapi.org/v2/top-headlines?category=${category}&country=us&apiKey=${NEWS_API_KEY}`;
        const newsResponse = await axios.get(newsUrl);

        if (newsResponse.data.articles.length > 0) {
          const articles = newsResponse.data.articles.slice(0, 5);
          responseData.content = `Here are the latest ${category} news:`;
          responseData.articles = articles.map(article => ({
            title: article.title,
            description: article.description,
            url: article.url,
            urlToImage: article.urlToImage,
            publishedAt: article.publishedAt
          }));
        } else {
          responseData.content = `I couldn't find any ${category} news at the moment. Try another category.`;
        }
      } catch (newsError) {
        console.error("News API error:", newsError);
        responseData.content = "I'm having trouble accessing news sources right now. Please try again later.";
      }
    } else {
      responseData.content = "I'm your news assistant. You can ask me for the latest news or select a category like technology, sports, business, health, science, or entertainment.";
    }

    // Store bot response in Redis
    await redisClient.lPush(
      `session:${sessionId}:messages`,
      JSON.stringify(responseData)
    );

    // Set TTL for session (24 hours)
    await redisClient.expire(`session:${sessionId}:messages`, 86400);

    res.json(responseData);
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get chat history
app.get("/api/history/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await redisClient.lRange(`session:${sessionId}:messages`, 0, -1);
    
    const history = messages.map(msg => JSON.parse(msg)).reverse();
    res.json({ history });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Clear chat history
app.delete("/api/history/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    await redisClient.del(`session:${sessionId}:messages`);
    res.json({ message: "History cleared" });
  } catch (error) {
    console.error("Error clearing history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});