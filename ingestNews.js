const Parser = require('rss-parser');
const { QdrantClient } = require('@qdrant/js-client-rest');
const axios = require('axios');

const parser = new Parser();

// Initialize Qdrant
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

// Generate embeddings using Jina API
async function generateEmbeddings(texts) {
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
}

async function ingestNews() {
  try {
    // Parse Reuters RSS feed
    console.log('Fetching news from RSS feed...');
    const feed = await parser.parseURL('https://www.reuters.com/arc/outboundfeeds/news-sitemap-index/?outputType=xml');
    
    const articles = [];
    for (let item of feed.items.slice(0, 50)) {
      articles.push({
        title: item.title,
        content: item.contentSnippet || item.content,
        link: item.link,
        pubDate: item.pubDate
      });
    }
    
    console.log(`Fetched ${articles.length} articles`);
    
    // Create collection in Qdrant if it doesn't exist
    try {
      await qdrantClient.createCollection('news-articles', {
        vectors: { size: 768, distance: 'Cosine' } // Jina embeddings size
      });
      console.log('Created new Qdrant collection');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
      console.log('Qdrant collection already exists');
    }
    
    // Process articles in batches
    const batchSize = 10;
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      
      // Generate embeddings for the batch
      const texts = batch.map(article => `${article.title}\n${article.content}`);
      console.log(`Generating embeddings for batch ${i / batchSize + 1}...`);
      
      const vectors = await generateEmbeddings(texts);
      
      // Prepare points for Qdrant
      const points = batch.map((article, index) => ({
        id: i + index,
        vector: vectors[index],
        payload: {
          title: article.title,
          text: texts[index],
          link: article.link,
          pubDate: article.pubDate
        }
      }));
      
      // Upload to Qdrant
      await qdrantClient.upsert('news-articles', {
        wait: true,
        points: points
      });
      
      console.log(`Uploaded batch ${i / batchSize + 1}`);
    }
    
    console.log('News ingestion completed successfully');
  } catch (error) {
    console.error('Error ingesting news:', error);
  }
}

ingestNews();