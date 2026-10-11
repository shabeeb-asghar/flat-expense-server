# Flat Expenses API

Express + MongoDB backend for the Flat Expenses app (Shabeeb & Ali).

## Deploy to Vercel

1. Import this repo in Vercel. No build settings are needed: Vercel detects the Express app exported from `index.js`.
2. Add these environment variables:
   - `MONGODB_URI`: Atlas connection string
   - `APP_KEY`: shared secret; the app sends it in the `x-api-key` header
   - `DB_NAME`: `flatexpense`
3. In MongoDB Atlas, open **Network Access** and allow `0.0.0.0/0`. Vercel has no fixed IP addresses.
4. Check `https://<your-app>.vercel.app/api/health`, which should return `{"ok":true}`.
5. In the mobile app's `.env`, set `EXPO_PUBLIC_API_URL=https://<your-app>.vercel.app`.

## Run locally

```bash
cp .env.example .env   # fill in values
npm install
npm start              # http://localhost:4000
npm test               # balance calculation tests
```

## API

All routes except `/api/health` require the `x-api-key` header.

| Method | Path | |
|---|---|---|
| GET | `/api/summary` | Budget, shortfall, balance and all entries with their computed breakdown |
| POST | `/api/transactions` | Add an entry (`flat`, `owe`, `budget`, `settle`) |
| DELETE | `/api/transactions/:id` | Delete an entry |
