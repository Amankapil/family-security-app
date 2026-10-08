const app = require('../src/app');
const { connectDB } = require('../src/config/db');

module.exports = async (req, res) => {
  if (process.env.MONGODB_URI) {
    await connectDB(process.env.MONGODB_URI);
  }
  return app(req, res);
};
