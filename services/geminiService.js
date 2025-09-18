const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.AIzaSyBwxeE-42PwZ9Bwhy0_VviBUiQmSE9UgHY);

exports.generateResponse = async (question, context) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Based on the following news context, answer the user's question:\n\nContext: ${context}\n\nQuestion: ${question}\n\nAnswer:`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating response with Gemini:', error);
    throw error;
  }
};