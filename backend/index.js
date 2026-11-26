require('dotenv').config();

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');

const app = express();
const port = Number(process.env.PORT || 3001);
const frontendUrl = process.env.FRONTEND_URL;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!frontendUrl) {
  throw new Error('FRONTEND_URL must be set in backend/.env.');
}

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: frontendUrl }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Backend API listening at http://127.0.0.1:${port}`);
});
