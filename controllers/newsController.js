// controllers/newsController.js
const { generateEmbeddings } = require('../services/embeddingService');
const { QdrantClient } = require('@qdrant/js-client-rest');
const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser();

// Initialize Qdrant
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

// News sources configuration
const NEWS_SOURCES = [
  {
    name: 'Reuters',
    url: 'https://www.reuters.com/arc/outboundfeeds/news-sitemap-index/?outputType=xml',
    type: 'rss'
  },
  {
    name: 'BBC News',
    url: 'http://feeds.bbci.co.uk/news/rss.xml',
    type: 'rss'
  },
  {
    name: 'CNN',
    url: 'http://rss.cnn.com/rss/edition.rss',
    type: 'rss'
  }
];

/**
 * Fetch news from RSS feeds
 */
const fetchNewsFromRSS = async (url) => {
  try {
    console.log(`Fetching news from: ${url}`);
    const feed = await parser.parseURL(url);
    return feed.items.map(item => ({
      title: item.title,
      content: item.contentSnippet || item.content,
      link: item.link,
      pubDate: item.pubDate,
      source: url
    }));
  } catch (error) {
    console.error(`Error fetching RSS from ${url}:`, error);
    return [];
  }
};

/**
 * Process and chunk articles for better embedding
 */
const processArticles = (articles) => {
  const chunks = [];
  
  articles.forEach(article => {
    // Split content into chunks of ~500 characters
    const content = `${article.title}\n${article.content}`;
    const chunkSize = 500;
    
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.substring(i, i + chunkSize);
      chunks.push({
        text: chunk,
        metadata: {
          title: article.title,
          link: article.link,
          pubDate: article.pubDate,
          source: article.source,
          chunkIndex: Math.floor(i / chunkSize) + 1
        }
      });
    }
  });
  
  return chunks;
};

/**
 * Ingest news from all configured sources
 */
exports.ingestNews = async (req, res) => {
  try {
    console.log('Starting news ingestion process...');
    
    let allArticles = [];
    
    // Fetch news from all sources
    for (const source of NEWS_SOURCES) {
      if (source.type === 'rss') {
        const articles = await fetchNewsFromRSS(source.url);
        allArticles = [...allArticles, ...articles];
        
        console.log(`Fetched ${articles.length} articles from ${source.name}`);
      }
    }
    
    console.log(`Total articles fetched: ${allArticles.length}`);
    
    // Process articles into chunks
    const chunks = processArticles(allArticles);
    console.log(`Created ${chunks.length} chunks from articles`);
    
    // Create collection in Qdrant if it doesn't exist
    try {
      await qdrantClient.createCollection('news-articles', {
        vectors: { size: 768, distance: 'Cosine' }
      });
      console.log('Created new Qdrant collection: news-articles');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
      console.log('Qdrant collection already exists');
    }
    
    // Process chunks in batches
    const batchSize = 10;
    let processedCount = 0;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      // Generate embeddings for the batch
      const texts = batch.map(chunk => chunk.text);
      console.log(`Generating embeddings for batch ${i / batchSize + 1}...`);
      
      const vectors = await generateEmbeddings(texts);
      
      // Prepare points for Qdrant
      const points = batch.map((chunk, index) => ({
        id: i + index,
        vector: vectors[index],
        payload: {
          text: chunk.text,
          ...chunk.metadata
        }
      }));
      
      // Upload to Qdrant
      await qdrantClient.upsert('news-articles', {
        wait: true,
        points: points
      });
      
      processedCount += batch.length;
      console.log(`Uploaded batch ${i / batchSize + 1}, processed ${processedCount}/${chunks.length} chunks`);
    }
    
    console.log('News ingestion completed successfully');
    
    res.json({
      success: true,
      message: 'News ingestion completed',
      stats: {
        articles: allArticles.length,
        chunks: chunks.length,
        sources: NEWS_SOURCES.length
      }
    });
  } catch (error) {
    console.error('Error in news ingestion:', error);
    res.status(500).json({
      success: false,
      message: 'News ingestion failed',
      error: error.message
    });
  }
};

/**
 * Get statistics about the news articles in the vector store
 */
exports.getNewsStats = async (req, res) => {
  try {
    const collectionInfo = await qdrantClient.getCollection('news-articles');
    
    // Count vectors in the collection
    const countResult = await qdrantClient.count('news-articles', {
      exact: true
    });
    
    res.json({
      success: true,
      stats: {
        collection: collectionInfo,
        vectorsCount: countResult.count
      }
    });
  } catch (error) {
    console.error('Error getting news stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get news statistics',
      error: error.message
    });
  }
};

/**
 * Search for news articles by query
 */
exports.searchNews = async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter is required'
      });
    }
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbeddings([query]);
    
    // Search in Qdrant
    const results = await qdrantClient.search('news-articles', {
      vector: queryEmbedding[0],
      limit: parseInt(limit),
      with_payload: true
    });
    
    res.json({
      success: true,
      query: query,
      results: results
    });
  } catch (error) {
    console.error('Error searching news:', error);
    res.status(500).json({
      success: false,
      message: 'News search failed',
      error: error.message
    });
  }
};

/**
 * Clear all news articles from the vector store
 */
exports.clearNews = async (req, res) => {
  try {
    await qdrantClient.deleteCollection('news-articles');
    
    // Recreate empty collection
    await qdrantClient.createCollection('news-articles', {
      vectors: { size: 768, distance: 'Cosine' }
    });
    
    res.json({
      success: true,
      message: 'News articles cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing news:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear news articles',
      error: error.message
    });
  }
};