# Lessons Learned — Hard-Won Knowledge from Live Trading

This document captures every bug, false assumption, and data integrity
lesson we learned building WolfQuant while trading real money.  These
are the things that won't show up in a tutorial.

---

## 1. Portfolio Value ≠ Cash + Equity

**The trap:** Computing portfolio as `cash + equity_value` from snapshots
shows buying power, not settled value.  After selling positions, cash
may still be unsettled (T+1), making `cash` show $150 while actual
settled balance is $4,085.

**The fix:** Always use `portfolio_snapshots.portfolio_value` as the
authoritative portfolio total.  Cash is a separate sub-field (buying
power) and may lag.

---

## 2. Deposits Baseline for Performance Charts

**The trap:** Performance charts normalize from the first data point.
If the first snapshot has `portfolio_value = $0` or a tiny value, every
subsequent point shows 100%+ growth.

**The fix:** Prepend a synthetic baseline point with
`portfolio = total_deposits` as the first entry.  Now 0% on the chart
means break-even on invested capital.

**Critical detail:** Do NOT insert the baseline into the hourly dedup
dict — if a real snapshot shares the same hour key, it overwrites the
baseline.  Prepend after dedup, as a separate list insert.

---

## 3. Portfolio Value Filter: Absolute Floor, Not Ratio

**The trap:** `WHERE portfolio_value >= total_deposits * 0.8` ($3,200
floor on $4,000 deposits) filters out periods when the portfolio was
under water ($1,900–$2,300 during active trading).  Result: "ALL" range
shows same 3 data points as "7D".

**The fix:** Use `WHERE portfolio_value >= 100` — catches zero-value
outliers without eliminating legitimate trading history.

**Rule:** Never use a ratio of deposits as a data quality filter.  The
periods below deposits are exactly where you need drawdown data.

---

## 4. API Endpoint Consistency Is a Hard Requirement

**The trap:** Dashboard embedded performance had a deposits baseline.
Standalone `/api/performance` did not.  When PerformanceChart
switched from dashboard data to its own endpoint, the chart broke.
"It works on the dashboard but not on the chart" — classic symptom.

**The fix:** Either share implementation via a helper function, or
at minimum use identical formulas, identical filters, identical
baselines across all endpoints computing the same logical metric.

---

## 5. SQLite `rowid` Aliasing

**The trap:** `SELECT rowid, * FROM trades` produces duplicate `rowid`
columns because `*` includes `rowid` for regular tables.  Python's
`sqlite3.Row` chokes: `IndexError: No item with that key`.

**The fix:** Always alias: `SELECT rowid AS _rowid, * FROM trades`.
Strip `_rowid` from API response dicts before returning to clients.

---

## 6. Account Scoping Matters

**The trap:** Pulling trade history from "all accounts" includes
drip/recurring fractional buys (APPL, AMZN, MSFT fractional shares).
These have no matching buys in the API range, producing 50–60
unmatched sells that dilute win rate and profit factor.

**The fix:** Scope analytics to the specific trading strategy or
account.  Drip/401k/HSA trades are not trading performance — they're
savings behavior.  Filter them out.

---

## 7. Cash Fallback When Snapshots Are Missing

**The trap:** Wiping `portfolio_snapshots` during a warehouse rebuild
makes `portfolio_value` = $0.  When positions are also fully sold
(all cash), the dashboard shows $0 portfolio and -$deposits total P&L.

**The fix:** When snapshots are empty AND positions are zero, derive
cash from the trade ledger:
```
cash = deposits + total_fifo_pnl - total_fees
```
This uses the trade ledger as the source of truth.

---

## 8. Double-Encoded JSON from Robinhood MCP

**The trap:** Robinhood MCP responses wrap JSON in JSON:
```
{"result": "{\"data\":{\"orders\":[...]}}"}
```
Single `json.loads()` gives a dict with key `"result"` — not `"data"`.

**The fix:** Always double-decode:
```python
outer = json.loads(raw)
inner = json.loads(outer["result"])
orders = inner["data"]["orders"]
```

---

## 9. FIFO Silent Failure When Buys Are Missing

**The trap:** FIFO matching skips sells with no matching buys and
simply omits the `pnl` key from the API response.  No error, no
warning — just missing data that's easy to miss in testing.

**The test:** Always check `sells_with_pnl / total_sells`.  If it's
less than 100%, investigate the gap.

---

## 10. Conviction Over Clock

**The trap:** A cron job closing all positions at 3:55 PM regardless
of thesis validity.  Good for risk management, terrible for returns
when you're in winning positions.

**The rule:** Close when the thesis invalidates, not when the clock
ticks.  Overnight risk is a sizing factor, not a veto.  Track
overnight P&L separately to build conviction data.

---

## Summary

| # | Lesson | Symptom | Impact |
|---|--------|---------|--------|
| 1 | Use portfolio_value, not cash | $150 vs $4,085 displayed | Critical |
| 2 | Deposits baseline for charts | 100%+ growth shown | High |
| 3 | Absolute floor, not ratio | All date ranges identical | High |
| 4 | API endpoint consistency | "Works here but not there" | High |
| 5 | rowid aliasing | IndexError crashes | Medium |
| 6 | Account scoping | Diluted metrics | Medium |
| 7 | Cash fallback | $0 portfolio after rebuild | Critical |
| 8 | Double-encoded JSON | KeyError on MCP data | Medium |
| 9 | FIFO silent failure | Missing P&L with no error | High |
| 10 | Conviction over clock | Premature exits | Strategy |

---

*These lessons cost real money to learn.  Use them wisely. 🐺*
