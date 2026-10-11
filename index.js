require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const { PEOPLE, computeLedger } = require('./ledger');

const { MONGODB_URI, APP_KEY, PORT = 4000, DB_NAME = 'flatexpense' } = process.env;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Shared key so random people who find the URL can't edit your data.
app.use('/api', (req, res, next) => {
  if (APP_KEY && req.get('x-api-key') !== APP_KEY) {
    return res.status(401).json({ error: 'Invalid app key' });
  }
  next();
});

let transactions;
let connecting;

// Connect on first request and reuse the connection. This works both as a normal
// server and on Vercel, where each serverless instance keeps it between requests.
function connect() {
  if (!connecting) {
    if (!MONGODB_URI) return Promise.reject(new Error('MONGODB_URI is not set'));
    connecting = (async () => {
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      const collection = client.db(DB_NAME).collection('transactions');
      await collection.createIndex({ date: 1, createdAt: 1 });
      transactions = collection;
    })().catch((e) => {
      connecting = undefined; // retry on the next request
      throw e;
    });
  }
  return connecting;
}

app.use('/api', (_req, _res, next) => connect().then(() => next(), next));

const CATEGORIES = ['groceries', 'food', 'utilities', 'rent', 'household', 'transport', 'other'];

function validate(body) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be a positive number' };
  const isPerson = (p) => PEOPLE.includes(p);
  const description = String(body.description || '').trim().slice(0, 200);
  const createdAt = new Date();
  const date = body.date ? new Date(body.date) : createdAt;
  if (Number.isNaN(date.getTime())) return { error: 'Invalid date' };
  const base = { type: body.type, amount, description, date, createdAt };

  switch (body.type) {
    case 'owe':
      if (!isPerson(body.debtor)) return { error: 'Choose who owes' };
      return { doc: { ...base, debtor: body.debtor, creditor: PEOPLE.find((p) => p !== body.debtor) } };
    case 'settle':
      if (!isPerson(body.from)) return { error: 'Choose who paid back' };
      return { doc: { ...base, from: body.from, to: PEOPLE.find((p) => p !== body.from) } };
    case 'budget':
      if (![...PEOPLE, 'Both'].includes(body.contributedBy)) return { error: 'Choose who added the budget' };
      return { doc: { ...base, contributedBy: body.contributedBy } };
    case 'flat':
      if (!isPerson(body.paidBy)) return { error: 'Choose who paid' };
      return {
        doc: { ...base, paidBy: body.paidBy, category: CATEGORIES.includes(body.category) ? body.category : 'other' },
      };
    default:
      return { error: 'Unknown transaction type' };
  }
}

async function summary() {
  const all = await transactions.find().toArray();
  return computeLedger(all.map((t) => ({ ...t, _id: t._id.toString() })));
}

app.get('/api/summary', async (_req, res, next) => {
  try {
    res.json(await summary());
  } catch (e) {
    next(e);
  }
});

app.post('/api/transactions', async (req, res, next) => {
  try {
    const { doc, error } = validate(req.body || {});
    if (error) return res.status(400).json({ error });
    await transactions.insertOne(doc);
    res.status(201).json(await summary());
  } catch (e) {
    next(e);
  }
});

app.delete('/api/transactions/:id', async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Bad id' });
    await transactions.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(await summary());
  } catch (e) {
    next(e);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;

// Run as a normal server with `npm start`; on Vercel the exported app is used instead.
if (require.main === module) {
  connect()
    .then(() => app.listen(PORT, '0.0.0.0', () => console.log(`API listening on http://localhost:${PORT}`)))
    .catch((e) => {
      console.error('Failed to start:', e.message);
      process.exit(1);
    });
}
