// Import necessary dependencies
import OpenAI from "openai"; // Library for interfacing with OpenAI API
import cosineSimilarity from "cosine-similarity"; // Library for computing cosine similarity


// Constants
const threshold = 0.81;


// Initializing OpenAI client with API key from environment variable
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});


/**
 * Embeds the input text using OpenAI's text embedding model.
 * @param {string} input - The input text to be embedded.
 * @returns {Promise<Array<number>>} - A promise resolving to the embedding vector of the input text.
 */
async function getEmbedding(input){
    // Request text embedding from OpenAI API
    const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: input,
    })
    // Extract and return the embedding vector from the response data
    return embedding.data[0].embedding
}


/**
 * Computes the cosine similarity between two embedding vectors.
 * @param {Array<number>} vector1 - The embedding vector of the first string.
 * @param {Array<number>} vector2 - The embedding vector of the second string.
 * @returns {number} - The cosine similarity score between the two vectors.
 */
function getSimilarity(string1, string2) {
    // Compute cosine similarity between the two vectors using the cosine-similarity library
    const similarity = cosineSimilarity(string1, string2);
    return similarity;
}


/**
 * Determines the similarity between two strings based on their embeddings.
 * @param {string} query - The query string to compare against the value.
 * @param {string} value - The value string to compare against the query.
 * @returns {Promise<string>} - A promise resolving to "yes" if similarity is above threshold, "no" otherwise.
 */
export default async function similarity(query,value){
    // Embed the query and value strings
    const embeddedQuery = await getEmbedding(query)
    const embeddedValue = await getEmbedding(value);
    
    // Compute cosine similarity between the embeddings
    const similarity = getSimilarity(embeddedQuery, embeddedValue);
  
    // Return "yes" if similarity score is above threshold, "no" otherwise
    if (similarity > threshold) {
        return("yes");
    } else {
        return("no");
    }
}
