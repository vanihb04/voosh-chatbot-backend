const axios = require('axios');

exports.generateEmbeddings = async (texts) => {
  try {
    const response = await axios.post('https://api.jina.ai/v1/embeddings', {
      input: texts,
      model: 'jina-embeddings-v2-base-en'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.JINA_API_KEY}`
      }
    });
    
    return response.data.data.map(item => item.embedding);
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw error;
  }
};