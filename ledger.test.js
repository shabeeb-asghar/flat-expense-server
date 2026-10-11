const assert = require('assert');
const { computeLedger } = require('./ledger');

let t = 0;
const tx = (o) => ({ _id: String(++t), createdAt: new Date(2026, 0, 1, 0, 0, t), ...o });

// Budget of 100 from both, food 60 paid by Shabeeb -> fully covered by budget.
let r = computeLedger([
  tx({ type: 'budget', amount: 100, contributedBy: 'Both' }),
  tx({ type: 'flat', amount: 60, paidBy: 'Shabeeb' }),
]);
assert.strictEqual(r.budget, 40);
assert.strictEqual(r.balance.amount, 0);

// Next, groceries 100 paid by Shabeeb: 40 from budget, 60 over -> Ali owes 30.
r = computeLedger([
  tx({ type: 'budget', amount: 100, contributedBy: 'Both' }),
  tx({ type: 'flat', amount: 60, paidBy: 'Shabeeb' }),
  tx({ type: 'flat', amount: 100, paidBy: 'Shabeeb' }),
]);
assert.strictEqual(r.budget, 0);
assert.deepStrictEqual(r.balance, { debtor: 'Ali', creditor: 'Shabeeb', amount: 30 });

// Direct debt + settle up + one-sided budget top-up.
r = computeLedger([
  tx({ type: 'owe', amount: 50, debtor: 'Shabeeb' }), // Shabeeb owes Ali 50
  tx({ type: 'settle', amount: 20, from: 'Shabeeb' }), // Shabeeb paid back 20 -> owes 30
  tx({ type: 'budget', amount: 40, contributedBy: 'Shabeeb' }), // Ali owes 20 -> Shabeeb owes 10
]);
assert.deepStrictEqual(r.balance, { debtor: 'Shabeeb', creditor: 'Ali', amount: 10 });
assert.strictEqual(r.budget, 40);

// Budget 2k, Shabeeb pays 3k -> Ali owes 500. Then both add 10k: the 1k shortfall
// is repaid from it, leaving 9k and nobody owing anything.
const example = [
  tx({ type: 'budget', amount: 2000, contributedBy: 'Both' }),
  tx({ type: 'flat', amount: 3000, paidBy: 'Shabeeb' }),
];
r = computeLedger(example);
assert.deepStrictEqual(r.balance, { debtor: 'Ali', creditor: 'Shabeeb', amount: 500 });
assert.strictEqual(r.shortfall, 1000);
r = computeLedger([...example, tx({ type: 'budget', amount: 10000, contributedBy: 'Both' })]);
assert.strictEqual(r.budget, 9000);
assert.strictEqual(r.shortfall, 0);
assert.strictEqual(r.balance.amount, 0);
assert.strictEqual(r.transactions[0].breakdown.coveredShortfall, 1000);
assert.strictEqual(r.transactions.find((x) => x.type === 'flat').breakdown.reimbursed, 1000);

// Budget smaller than the shortfall only partly covers it.
r = computeLedger([...example, tx({ type: 'budget', amount: 400, contributedBy: 'Both' })]);
assert.strictEqual(r.budget, 0);
assert.strictEqual(r.shortfall, 600);
assert.deepStrictEqual(r.balance, { debtor: 'Ali', creditor: 'Shabeeb', amount: 300 });

// Back-dated expense is applied in date order, not entry order.
r = computeLedger([
  tx({ type: 'budget', amount: 100, contributedBy: 'Both', date: '2026-03-10T12:00:00Z' }),
  tx({ type: 'flat', amount: 80, paidBy: 'Ali', date: '2026-03-01T12:00:00Z' }), // before the budget existed
]);
assert.strictEqual(r.budget, 20); // 80 shortfall repaid from the later budget
assert.strictEqual(r.balance.amount, 0);

console.log('ledger tests passed');
