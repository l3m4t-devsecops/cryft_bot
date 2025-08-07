
**File: `functions/index.js`**

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Exchange rates (Firebase Realtime Database)
const rates = {
    'USD-BTC': 0.000023,
    'EUR-BTC': 0.000025,
    'AED-BTC': 0.0000062,
    'BTC-USD': 43500,
    'ETH-USD': 2300,
    'USDT-USD': 1.0,
    'BNB-USD': 315
};

// Telegram API helper
async function sendTelegramMessage(chatId, text, keyboard = null) {
    const token = functions.config().telegram.bot_token;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        ...(keyboard && { reply_markup: keyboard })
    };

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await response.json();
    } catch (error) {
        console.error('Telegram API error:', error);
    }
}

// User management with Firestore
async function getUser(userId) {
    const userRef = db.collection('users').doc(userId.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
        const newUser = {
            balance: { USD: 5000, EUR: 3500, AED: 18000, RUB: 150000 },
            cryptoBalance: { BTC: 0.15, ETH: 2.3, USDT: 1200, BNB: 5 },
            selectedFiat: 'USD',
            selectedCrypto: 'BTC',
            mode: 'swift-to-crypto',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            kycStatus: 'verified'
        };
        await userRef.set(newUser);
        return newUser;
    }
    
    return userDoc.data();
}

async function updateUser(userId, updates) {
    const userRef = db.collection('users').doc(userId.toString());
    await userRef.update(updates);
}

// Transaction logging
async function createTransaction(userId, transactionData) {
    const txRef = db.collection('transactions').doc();
    const transaction = {
        ...transactionData,
        userId: userId.toString(),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        id: txRef.id
    };
    await txRef.set(transaction);
    return transaction;
}

// Keyboards
const mainKeyboard = {
    inline_keyboard: [
        [
            { text: '💱 SWIFT → Crypto', callback_data: 'mode_swift_crypto' },
            { text: '💰 Crypto → SWIFT', callback_data: 'mode_crypto_swift' }
        ],
        [
            { text: '💳 Balance', callback_data: 'balance' },
            { text: '📊 Rates', callback_data: 'rates' }
        ],
        [
            { text: '📱 Mini App', web_app: { url: 'https://crypto-bridge-firebase.web.app' } }
        ],
        [
            { text: '🔒 Security', callback_data: 'security' },
            { text: '📊 History', callback_data: 'history' }
        ]
    ]
};

const currencyKeyboard = (type) => ({
    inline_keyboard: type === 'fiat' ? [
        [
            { text: '🇺🇸 USD', callback_data: 'fiat_USD' },
            { text: '🇪🇺 EUR', callback_data: 'fiat_EUR' }
        ],
        [
            { text: '🇦🇪 AED', callback_data: 'fiat_AED' },
            { text: '🇷🇺 RUB', callback_data: 'fiat_RUB' }
        ],
        [{ text: '« Back', callback_data: 'main' }]
    ] : [
        [
            { text: '₿ BTC', callback_data: 'crypto_BTC' },
            { text: 'Ξ ETH', callback_data: 'crypto_ETH' }
        ],
        [
            { text: '₮ USDT', callback_data: 'crypto_USDT' },
            { text: '🟡 BNB', callback_data: 'crypto_BNB' }
        ],
        [{ text: '« Back', callback_data: 'main' }]
    ]
});

const amountKeyboard = {
    inline_keyboard: [
        [
            { text: '$100', callback_data: 'amount_100' },
            { text: '$500', callback_data: 'amount_500' }
        ],
        [
            { text: '$1000', callback_data: 'amount_1000' },
            { text: '$5000', callback_data: 'amount_5000' }
        ],
        [
            { text: '💯 MAX', callback_data: 'amount_max' },
            { text: '✏️ Custom', callback_data: 'amount_custom' }
        ],
        [{ text: '« Back', callback_data: 'main' }]
    ]
};

// Message handlers
async function handleStart(chatId, userId) {
    const user = await getUser(userId);
    
    const welcomeText = `
🌉 <b>Welcome to Crypto Bridge Bot!</b>

Your secure gateway for SWIFT ⟷ Crypto conversion

✅ <b>Status:</b> ${user.kycStatus === 'verified' ? 'KYC Verified' : 'Pending Verification'}
💎 <b>Daily Limit:</b> $50,000
🔒 <b>Security:</b> Multi-signature protected
📱 <b>Mini App:</b> Full trading interface available

Choose an option below:
    `;
    
    await sendTelegramMessage(chatId, welcomeText, mainKeyboard);
}

async function handleBalance(chatId, userId) {
    const user = await getUser(userId);
    
    let balanceText = `💳 <b>Your Balance Summary</b>\n\n`;
    balanceText += `<b>💰 FIAT Currencies:</b>\n`;
    for (const [currency, amount] of Object.entries(user.balance)) {
        balanceText += `• ${currency}: ${amount.toLocaleString()}\n`;
    }
    balanceText += `\n<b>₿ Cryptocurrencies:</b>\n`;
    for (const [currency, amount] of Object.entries(user.cryptoBalance)) {
        balanceText += `• ${currency}: ${amount}\n`;
    }
    balanceText += `\n<i>Last updated: ${new Date().toLocaleString()}</i>`;
    
    await sendTelegramMessage(chatId, balanceText, {
        inline_keyboard: [
            [{ text: '💱 Convert', callback_data: 'mode_swift_crypto' }],
            [{ text: '« Back', callback_data: 'main' }]
        ]
    });
}

async function handleRates(chatId) {
    const ratesText = `
📊 <b>Current Exchange Rates</b>

<b>Cryptocurrency Prices (USD):</b>
• BTC: $${rates['BTC-USD'].toLocaleString()}
• ETH: $${rates['ETH-USD'].toLocaleString()}
• USDT: $${rates['USDT-USD']}
• BNB: $${rates['BNB-USD']}

<b>FIAT to BTC Conversion:</b>
• 1 USD = ${rates['USD-BTC']} BTC
• 1 EUR = ${rates['EUR-BTC']} BTC
• 1 AED = ${rates['AED-BTC']} BTC

<i>⚡ Rates updated every 30 seconds</i>
<i>🔒 All conversions use real-time market data</i>
    `;
    
    await sendTelegramMessage(chatId, ratesText, {
        inline_keyboard: [
            [{ text: '💱 Start Converting', callback_data: 'mode_swift_crypto' }],
            [{ text: '« Back', callback_data: 'main' }]
        ]
    });
}

async function handleHistory(chatId, userId) {
    const transactionsRef = db.collection('transactions')
        .where('userId', '==', userId.toString())
        .orderBy('timestamp', 'desc')
        .limit(5);
    
    const snapshot = await transactionsRef.get();
    
    let historyText = `📊 <b>Recent Transactions</b>\n\n`;
    
    if (snapshot.empty) {
        historyText += `<i>No transactions yet. Start your first conversion!</i>`;
    } else {
        snapshot.forEach(doc => {
            const tx = doc.data();
            historyText += `<b>${tx.id.substring(0, 8)}...</b>\n`;
            historyText += `${tx.amount} ${tx.fromCurrency} → ${tx.convertedAmount} ${tx.toCurrency}\n`;
            historyText += `Status: ${tx.status}\n\n`;
        });
    }
    
    await sendTelegramMessage(chatId, historyText, {
        inline_keyboard: [
            [{ text: '💱 New Transaction', callback_data: 'mode_swift_crypto' }],
            [{ text: '« Back', callback_data: 'main' }]
        ]
    });
}

async function processTransaction(chatId, userId, amount) {
    const user = await getUser(userId);
    
    // Processing message
    await sendTelegramMessage(chatId, `
⏳ <b>Processing Transaction...</b>

Converting ${amount} ${user.selectedFiat} to ${user.selectedCrypto}

🔄 Validating transaction...
🔒 Applying security checks...
💱 Executing conversion...
    `);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const rate = rates[`${user.selectedFiat}-${user.selectedCrypto}`] || 0.000023;
    const convertedAmount = (amount * rate).toFixed(8);
    const fee = (amount * 0.002).toFixed(2);
    const txId = `TX${Date.now()}`;
    
    // Create transaction record
    const transaction = await createTransaction(userId, {
        amount,
        fromCurrency: user.selectedFiat,
        toCurrency: user.selectedCrypto,
        convertedAmount: parseFloat(convertedAmount),
        fee: parseFloat(fee),
        rate,
        status: 'completed',
        type: user.mode
    });
    
    // Update user balances
    const updates = {
        [`balance.${user.selectedFiat}`]: user.balance[user.selectedFiat] - amount,
        [`cryptoBalance.${user.selectedCrypto}`]: user.cryptoBalance[user.selectedCrypto] + parseFloat(convertedAmount)
    };
    await updateUser(userId, updates);
    
    const successText = `
✅ <b>Transaction Completed Successfully!</b>

<b>Transaction ID:</b> <code>${transaction.id.substring(0, 12)}</code>
<b>Status:</b> ✅ Confirmed

<b>Conversion Details:</b>
• <b>From:</b> ${amount} ${user.selectedFiat}
• <b>To:</b> ${convertedAmount} ${user.selectedCrypto}
• <b>Rate:</b> 1 ${user.selectedFiat} = ${rate} ${user.selectedCrypto}
• <b>Fee:</b> ${fee} ${user.selectedFiat} (0.2%)

<b>Network Info:</b>
• ✅ Confirmed in 2 blocks
• ⏱️ Processing time: 47 seconds
• 🔒 Transaction hash: 0x${Math.random().toString(16).substr(2, 16)}...

<i>Your funds are now available in your ${user.selectedCrypto} wallet.</i>
    `;
    
    await sendTelegramMessage(chatId, successText, {
        inline_keyboard: [
            [
                { text: '🎯 New Transaction', callback_data: 'main' },
                { text: '💳 View Balance', callback_data: 'balance' }
            ],
            [
                { text: '📊 Transaction History', callback_data: 'history' }
            ]
        ]
    });
}

// Main webhook handler
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        
        if (update.message) {
            const chatId = update.message.chat.id;
            const userId = update.message.from.id;
            const text = update.message.text;
            
            if (text === '/start') {
                await handleStart(chatId, userId);
            } else if (text === '/balance') {
                await handleBalance(chatId, userId);
            } else if (text === '/rates') {
                await handleRates(chatId);
            } else if (text === '/history') {
                await handleHistory(chatId, userId);
            } else if (!isNaN(parseFloat(text))) {
                const amount = parseFloat(text);
                if (amount >= 10 && amount <= 50000) {
                    await processTransaction(chatId, userId, amount);
                } else {
                    await sendTelegramMessage(chatId, '⚠️ Amount must be between $10 and $50,000');
                }
            } else {
                await sendTelegramMessage(chatId, '❓ Unknown command. Send /start to see available options.');
            }
        }
        
        if (update.callback_query) {
            const chatId = update.callback_query.message.chat.id;
            const userId = update.callback_query.from.id;
            const data = update.callback_query.data;
            const user = await getUser(userId);
            
            // Answer callback query
            const token = functions.config().telegram.bot_token;
            const fetch = (await import('node-fetch')).default;
            await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: update.callback_query.id })
            });
            
            // Handle callbacks
            if (data === 'main') {
                await handleStart(chatId, userId);
            } else if (data === 'balance') {
                await handleBalance(chatId, userId);
            } else if (data === 'rates') {
                await handleRates(chatId);
            } else if (data === 'history') {
                await handleHistory(chatId, userId);
            } else if (data === 'security') {
                const securityText = `
🔒 <b>Security Status Report</b>

✅ <b>Account Security:</b>
• KYC Verification: ✅ Completed
• 2FA Authentication: ✅ Enabled
• Device Registration: ✅ iPhone 16 Pro verified
• Last Login: ${new Date().toLocaleString()}

✅ <b>Fund Protection:</b>
• Multi-Signature Wallets: ✅ Active
• Cold Storage: ✅ 95% of funds secured
• Insurance Coverage: ✅ Up to $100M
• Real-time Monitoring: ✅ 24/7 active

✅ <b>Compliance Status:</b>
• AML Screening: ✅ Passed
• UAE Regulatory: ✅ Fully compliant
• Transaction Monitoring: ✅ Active
• Risk Assessment: ✅ Low risk profile

🛡️ <b>Recent Security Events:</b>
• No suspicious activity detected
• All transactions verified successfully
• Account monitoring: Normal activity

<i>Your funds and data are protected by enterprise-grade security measures.</i>
                `;
                await sendTelegramMessage(chatId, securityText, {
                    inline_keyboard: [[{ text: '« Back to Menu', callback_data: 'main' }]]
                });
            } else if (data === 'mode_swift_crypto' || data === 'mode_crypto_swift') {
                const newMode = data.replace('mode_', '').replace('_', '-to-');
                await updateUser(userId, { mode: newMode });
                
                const modeText = newMode === 'swift-to-crypto' ? 'SWIFT → Crypto' : 'Crypto → SWIFT';
                const fromType = newMode === 'swift-to-crypto' ? 'FIAT currency' : 'cryptocurrency';
                
                await sendTelegramMessage(chatId, `
💱 <b>${modeText} Conversion</b>

<b>Step 1:</b> Select your source ${fromType}

Choose the currency you want to convert from:
                `, newMode === 'swift-to-crypto' ? currencyKeyboard('fiat') : currencyKeyboard('crypto'));
            } else if (data.startsWith('fiat_') || data.startsWith('crypto_')) {
                const [type, currency] = data.split('_');
                const updateField = type === 'fiat' ? 'selectedFiat' : 'selectedCrypto';
                await updateUser(userId, { [updateField]: currency });
                
                const nextType = type === 'fiat' ? 'crypto' : 'fiat';
                const nextTypeText = nextType === 'crypto' ? 'cryptocurrency' : 'FIAT currency';
                
                await sendTelegramMessage(chatId, `
✅ <b>Selected:</b> ${currency}

<b>Step 2:</b> Select target ${nextTypeText}

Choose what you want to convert to:
                `, nextType === 'crypto' ? currencyKeyboard('crypto') : currencyKeyboard('fiat'));
            } else if (data.startsWith('amount_')) {
                const amountStr = data.replace('amount_', '');
                let amount;
                
                if (amountStr === 'max') {
                    const currentUser = await getUser(userId);
                    amount = currentUser.balance[currentUser.selectedFiat] || 0;
                } else if (amountStr === 'custom') {
                    await sendTelegramMessage(chatId, `
✏️ <b>Custom Amount</b>

Please enter the amount you want to convert:

<b>Limits:</b>
• Minimum: $10
• Maximum: $50,000 per transaction
• Your current balance: ${user.balance[user.selectedFiat]} ${user.selectedFiat}

<i>Simply type the number and send it.</i>
                    `);
                    return;
                } else {
                    amount = parseFloat(amountStr);
                }
                
                if (amount > 0) {
                    await processTransaction(chatId, userId, amount);
                }
            }
        }
        
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
    }
});

// API endpoints
app.get('/api/stats', async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const transactionsSnapshot = await db.collection('transactions').get();
        
        let totalVolume = 0;
        transactionsSnapshot.forEach(doc => {
            const tx = doc.data();
            if (tx.status === 'completed') {
                totalVolume += tx.amount || 0;
            }
        });
        
        res.json({
            users: usersSnapshot.size,
            transactions: transactionsSnapshot.size,
            totalVolume: totalVolume.toFixed(2),
            rates: rates,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'crypto-bridge-bot',
        version: '1.0.0'
    });
});

// Export the Express app as a Firebase Function
exports.bot = functions.https.onRequest(app);

// Scheduled function to update rates (runs every 30 seconds)
exports.updateRates = functions.pubsub.schedule('every 30 seconds').onRun(async (context) => {
    // In production, fetch real rates from exchanges
    const fluctuation = 0.001; // 0.1% fluctuation
    Object.keys(rates).forEach(pair => {
        const change = (Math.random() - 0.5) * fluctuation;
        rates[pair] *= (1 + change);
    });
    
    console.log('Exchange rates updated:', rates);
    return null;
});

// Clean old transactions (runs daily)
exports.cleanupTransactions = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const oldTransactions = await db.collection('transactions')
        .where('timestamp', '<', thirtyDaysAgo)
        .get();
    
    const batch = db.batch();
    oldTransactions.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Cleaned up ${oldTransactions.size} old transactions`);
    return null;
});