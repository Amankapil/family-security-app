const mongoose = require('mongoose');

let cachedConnection = null;
let cachedUri = null;

/**
 * Connect to MongoDB with connection caching for serverless/Vercel support.
 * @param {string} uri - MongoDB connection string
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  if (cachedConnection && mongoose.connection.readyState === 1) {
    if (cachedUri === uri) {
      return cachedConnection;
    }
    await mongoose.disconnect();
    cachedConnection = null;
  }

  // Prevent multiple connection attempts while connecting
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => {
      mongoose.connection.once('open', resolve);
    });
    return mongoose;
  }

  const opts = {
    bufferCommands: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    autoIndex: true // Ensure indexes like 2dsphere and TTL are built
  };

  try {
    cachedConnection = await mongoose.connect(uri, opts);
    cachedUri = uri;
    return cachedConnection;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
}

/**
 * Disconnect from MongoDB (useful for test suites)
 */
async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    cachedConnection = null;
  }
}

module.exports = {
  connectDB,
  disconnectDB
};
