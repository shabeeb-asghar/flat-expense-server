// Replays every transaction in order to work out the shared budget and who owes whom.
// Computing on read (instead of storing results) keeps balances correct after deletes
// and when entries are back-dated.

const PEOPLE = ['Shabeeb', 'Ali'];

const round = (n) => Math.round(n * 100) / 100;
const other = (name) => (name === PEOPLE[0] ? PEOPLE[1] : PEOPLE[0]);

// `net` > 0 means Ali owes Shabeeb, `net` < 0 means Shabeeb owes Ali.
function owedDelta(debtor, amount) {
  return debtor === 'Ali' ? amount : -amount;
}

const when = (t) => new Date(t.date || t.createdAt).getTime();

function computeLedger(transactions) {
  const sorted = [...transactions].sort(
    (a, b) => when(a) - when(b) || new Date(a.createdAt) - new Date(b.createdAt)
  );

  let budget = 0;
  let net = 0;
  let totalBudgetAdded = 0;
  let totalFlatSpent = 0;
  // Over-budget amounts someone paid out of pocket, waiting to be repaid from the next budget.
  const shortfalls = [];

  const items = sorted.map((t) => ({
    ...t,
    date: t.date || t.createdAt,
    amount: Number(t.amount),
    breakdown: {},
  }));

  for (const item of items) {
    const { amount, breakdown } = item;

    switch (item.type) {
      case 'owe': {
        // Direct debt: debtor owes creditor the full amount.
        net += owedDelta(item.debtor, amount);
        break;
      }
      case 'settle': {
        // `from` paid `to` back, which reduces what `from` owes.
        net -= owedDelta(item.from, amount);
        break;
      }
      case 'budget': {
        budget += amount;
        totalBudgetAdded += amount;
        // The budget belongs to both equally, so if one person tops it up alone
        // the other owes them half.
        if (item.contributedBy !== 'Both') {
          net -= owedDelta(item.contributedBy, amount / 2);
          breakdown.owedBy = other(item.contributedBy);
          breakdown.owedAmount = round(amount / 2);
        }
        // New budget first repays earlier over-budget spending. The payer gets their
        // money back from the budget, so the half the other person owed is cancelled.
        let covered = 0;
        while (shortfalls.length && budget > 0) {
          const s = shortfalls[0];
          const repay = Math.min(budget, s.remaining);
          budget -= repay;
          s.remaining -= repay;
          covered += repay;
          net -= owedDelta(other(s.paidBy), repay / 2);
          s.item.breakdown.reimbursed = round(s.item.breakdown.overflow - s.remaining);
          if (s.remaining <= 0.001) shortfalls.shift();
        }
        if (covered > 0) breakdown.coveredShortfall = round(covered);
        break;
      }
      case 'flat': {
        // Budget pays first; whatever is left over is split 50/50 and the
        // person who did not pay owes the payer their half until the next budget.
        const fromBudget = Math.min(budget, amount);
        const overflow = amount - fromBudget;
        budget -= fromBudget;
        totalFlatSpent += amount;
        breakdown.fromBudget = round(fromBudget);
        breakdown.overflow = round(overflow);
        if (overflow > 0) {
          net += owedDelta(other(item.paidBy), overflow / 2);
          breakdown.owedBy = other(item.paidBy);
          breakdown.owedAmount = round(overflow / 2);
          breakdown.reimbursed = 0;
          shortfalls.push({ paidBy: item.paidBy, remaining: overflow, item });
        }
        break;
      }
    }
    item.budgetAfter = round(budget);
  }

  net = round(net);
  let balance;
  if (net > 0) balance = { debtor: 'Ali', creditor: 'Shabeeb', amount: net };
  else if (net < 0) balance = { debtor: 'Shabeeb', creditor: 'Ali', amount: -net };
  else balance = { debtor: null, creditor: null, amount: 0 };

  return {
    budget: round(budget),
    shortfall: round(shortfalls.reduce((sum, s) => sum + s.remaining, 0)),
    balance,
    totals: { budgetAdded: round(totalBudgetAdded), flatSpent: round(totalFlatSpent) },
    transactions: items.reverse(), // newest first for display
  };
}

module.exports = { PEOPLE, computeLedger };
