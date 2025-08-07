//javascript
// Crypto Bridge Bot - iPhone Compatible Version
const express = require('express');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (for iPhone development)
const users = new Map();
const transactions = new Map();

// Exchange rates (simulated)
const rates = {
    'USD-BTC': 0.000023,
    'EUR-BTC': 0.000025,
    'AED-BTC': 0.0000062,
    'BTC-USD': 43500,
    'ETH-USD': 2300,
    'USDT-USD': 1.0
};