import "dotenv/config.js";
if (
    !process.env.MONGODB_URI
    || !process.env.OPENAI_API_KEY) {
    throw new Error('Missing env variables');
}
console.log("configuration completed");