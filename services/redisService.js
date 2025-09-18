const redis = require('redis');

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

exports.storeMessage = async (sessionId, type, content) => {
  const message = JSON.stringify({
    type,
    content,
    timestamp: new Date().toISOString()
  });
  
  await redisClient.lPush(`session:${sessionId}:messages`, message);
  await redisClient.expire(`session:${sessionId}:messages`, 86400); // 24 hours TTL
};

exports.getMessages = async (sessionId) => {
  const messages = await redisClient.lRange(`session:${sessionId}:messages`, 0, -1);
  return messages.map(msg => JSON.parse(msg)).reverse();
};

exports.clearMessages = async (sessionId) => {
  await redisClient.del(`session:${sessionId}:messages`);
};