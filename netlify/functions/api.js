const serverless = require('serverless-http');
const { app, init } = require('../../backend/src/app');

const handler = serverless(app);

exports.handler = async (event, context) => {
  await init();
  return handler(event, context);
};

// Serve at /api/* directly (no /.netlify/functions/api prefix), matching
// the paths the Express app and frontend already use.
exports.config = { path: '/api/*' };
