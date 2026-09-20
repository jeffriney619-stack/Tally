import { useEffect, useState } from 'react'
import {
  createLiveTransaction,
  listLiveCategories,
  listLiveTransactions,
  updateLiveTransactionCategory,
} from './services/api'
import type { BudgetCategory, BudgetTransaction } from './types/budget'

const GROUP_ORDER: BudgetCategory['group'][] = ['Needs', 'Wants', 'Savings']

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function categorySpend(transactions: BudgetTransaction[], categoryId: string) {
  return transactions
    .filter((transaction) => transaction.categoryId === categoryId)
    .reduce(
      (total, transaction) => total + transaction.amount / Math.max(1, transaction.spreadMonths),
      0,
    )
}

const emptyForm = { date: '', merchant: '', amount: '', categoryId: '' }

export function LiveEnvelopesView({ username }: { username: string }) {
  const [month, setMonth] = useState('2026-09')
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [liveCategories, liveTransactions] = await Promise.all([
        listLiveCategories(username),
        listLiveTransactions(username, month),
      ])
      setCategories(liveCategories)
      setTransactions(liveTransactions)
    } catch {
      setError('Could not reach the backend. Is it running on localhost:5080?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  async function handleCategorize(transactionId: string, categoryId: string) {
    if (!categoryId) return
    setBusyId(transactionId)
    try {
      await updateLiveTransactionCategory(username, transactionId, categoryId)
      await refresh()
    } catch {
      setError('Could not save that category change.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleAddTransaction(event: React.FormEvent) {
    event.preventDefault()
    if (!form.date || !form.merchant || !form.amount) return
    setSubmitting(true)
    setError('')
    try {
      await createLiveTransaction(username, {
        date: form.date,
        merchant: form.merchant,
        rawDescription: form.merchant.toUpperCase(),
        amount: Number(form.amount),
        categoryId: form.categoryId || null,
        accountId: 'card-a7',
        status: 'posted',
        source: 'manual',
        notes: '',
        spreadMonths: 1,
      })
      setForm(emptyForm)
      await refresh()
    } catch {
      setError('Could not add that transaction.')
    } finally {
      setSubmitting(false)
    }
  }

  const active = categories.filter((category) => !category.archived)
  const spendable = active.filter((category) => category.group !== 'Savings')

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Live data (beta)</p>
          <h1>The real database tables, not the prototype blob.</h1>
          <p>
            This view reads and writes budget_categories / transactions directly through the new API
            — categorizing or adding a charge here recalculates envelope math from real backend
            data, independent of everything else in the app.
          </p>
        </div>
      </header>

      <section className="section-heading compact">
        <div>
          <h2>Month</h2>
          <p>Filters the transactions fetched from the backend.</p>
        </div>
        <input onChange={(event) => setMonth(event.target.value)} type="month" value={month} />
      </section>

      {error && <div className="callout risk">{error}</div>}
      {loading ? (
        <p>Loading live data…</p>
      ) : (
        <>
          <table className="category-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="cell-progress">Progress</th>
                <th className="num">Available</th>
                <th>Status</th>
              </tr>
            </thead>
            {GROUP_ORDER.map((group) => {
              const rows = active
                .filter((category) => category.group === group)
                .map((category) => {
                  const isSavings = category.group === 'Savings'
                  const spent = isSavings ? 0 : categorySpend(transactions, category.id)
                  const available = isSavings
                    ? category.openingBalance + category.monthlyTarget
                    : category.openingBalance + category.monthlyTarget - spent
                  const usage =
                    category.monthlyTarget > 0
                      ? Math.max(0, (isSavings ? 0 : (spent / category.monthlyTarget) * 100))
                      : 0
                  const status = isSavings
                    ? 'healthy'
                    :
                    available < 0 ? 'over' : 'healthy'
                  return { category, spent, available, usage, status, isSavings }
                })
              if (rows.length === 0) return null
              return (
                <tbody className={group.toLowerCase()} key={group}>
                  <tr className="group-header-row">
                    <td colSpan={4}>
                      <div className="group-header-content">
                        <span className="group-name">
                          <i /> {group} · {rows.length}{' '}
                          {rows.length === 1 ? 'category' : 'categories'}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {rows.map(({ category, spent, available, usage, status, isSavings }) => (
                    <tr className={`${status} ${category.group.toLowerCase()}`} key={category.id}>
                      <td>
                        <div className="cat-name-cell">
                          <div>
                            <strong>{category.name}</strong>
                            <span className="group-pill">{category.group}</span>
                          </div>
                        </div>
                      </td>
                      <td className="cell-progress">
                        {isSavings ? (
                          <div className="row-progress-meta">
                            <span>{money(category.monthlyTarget)} auto-funded monthly (non-transactional)</span>
                          </div>
                        ) : (
                          <>
                            <div className="row-progress-track">
                              <span
                                className="row-progress-fill"
                                style={{ width: `${Math.min(100, usage)}%` }}
                              />
                              <span className="row-progress-pct">{Math.round(usage)}%</span>
                            </div>
                            <div className="row-progress-meta">
                              <span>
                                {money(spent)} / {money(category.monthlyTarget)}
                              </span>
                            </div>
                          </>
                        )}
                      </td>
                      <td className="num">{money(available)}</td>
                      <td>
                        {isSavings ? (
                          <span className="status-pill healthy">Auto-funded</span>
                        ) : (
                          <span className={`status-pill ${status}`}>
                            {status === 'over'
                              ? 'Over limit'
                              : 'On track'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>

          <section className="section-heading compact">
            <div>
              <h2>Transactions this month</h2>
              <p>Re-categorizing here updates the table above immediately.</p>
            </div>
          </section>
          <div className="transaction-table">
            <div className="table-head">
              <span>Date</span>
              <span>Merchant</span>
              <span>Charge</span>
              <span>Category</span>
            </div>
            {transactions.map((transaction) => (
              <div className="transaction-row" key={transaction.id}>
                <span>{transaction.date}</span>
                <span className="merchant-cell">
                  <strong>{transaction.merchant}</strong>
                  <small>{transaction.status}</small>
                </span>
                <strong>{money(transaction.amount)}</strong>
                <select
                  disabled={busyId === transaction.id}
                  onChange={(event) => handleCategorize(transaction.id, event.target.value)}
                  value={transaction.categoryId ?? ''}
                >
                  <option value="">Needs review</option>
                  {spendable.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="empty-state">No transactions for this month yet.</div>
            )}
          </div>

          <section className="section-heading compact">
            <div>
              <h2>Add a manual charge</h2>
              <p>Posts straight to the transactions table via the real API.</p>
            </div>
          </section>
          <form className="grid-2" onSubmit={handleAddTransaction}>
            <label>
              Date
              <input
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
                type="date"
                value={form.date}
              />
            </label>
            <label>
              Merchant
              <input
                onChange={(event) => setForm({ ...form, merchant: event.target.value })}
                required
                type="text"
                value={form.merchant}
              />
            </label>
            <label>
              Amount
              <input
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                required
                step="0.01"
                type="number"
                value={form.amount}
              />
            </label>
            <label>
              Category
              <select
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                value={form.categoryId}
              >
                <option value="">Needs review</option>
                {spendable.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="outline-action" disabled={submitting} type="submit">
              {submitting ? 'Adding…' : 'Add transaction'}
            </button>
          </form>
        </>
      )}
    </>
  )
}
