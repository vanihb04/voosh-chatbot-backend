const { QdrantClient } = require('@qdrant/js-client-rest');
const { generateEmbeddings } = require('./embeddingService');

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

exports.searchArticles = async (query) => {
  try {
    const queryEmbedding = await generateEmbeddings([query]);
    const results = await qdrantClient.search('news-articles', {
      vector: queryEmbedding[0],
      limit: 5,
      with_payload: true
    });
    
    return results.map(item => item.payload);
  } catch (error) {
    console.error('Error searching articles:', error);
    throw error;
  }
};