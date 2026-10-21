import db from '../../db';
import marketData from '../market-data';
import marketIntelligenceAgent from '../agents/market-intelligence';
import { createWorkerId, HeartbeatController, startHeartbeat } from './heartbeat';

/** A lock older than this is assumed abandoned (a crashed worker). */
const JOB_LOCK_TTL_SECONDS = 15 * 60;

export class BackgroundWorkerScheduler {
  private timer: NodeJS.Timeout | null = null;
  private heartbeat: HeartbeatController | null = null;
  public isRunning = false;
  public readonly workerId = createWorkerId();

  /**
   * Takes a cross-process lock on a job.
   *
   * SQLite has no SELECT ... FOR UPDATE, so the lock is a conditional UPDATE:
   * exactly one writer can flip `locked_by` from NULL for a given row, which
   * serialises the job across processes as well as within one. A stale lock
   * (crashed worker) is reclaimed after JOB_LOCK_TTL_SECONDS.
   */
  private acquireJobLock(jobName: string): boolean {
    const result = db.execute(
      `UPDATE scheduled_jobs
       SET locked_by = ?, locked_at = datetime('now')
       WHERE job_name = ?
         AND (locked_by IS NULL OR locked_at < datetime('now', '-' || ? || ' seconds'))`,
      [this.workerId, jobName, JOB_LOCK_TTL_SECONDS]
    );
    return result.changes === 1;
  }

  private releaseJobLock(jobName: string): void {
    db.execute(
      "UPDATE scheduled_jobs SET locked_by = NULL, locked_at = NULL WHERE job_name = ? AND locked_by = ?",
      [jobName, this.workerId]
    );
  }

  async runJob(jobName: string) {
    if (!this.acquireJobLock(jobName)) {
      const holder = db.queryOne<{ locked_by: string | null; locked_at: string | null }>(
        'SELECT locked_by, locked_at FROM scheduled_jobs WHERE job_name = ?',
        [jobName]
      );
      return {
        success: false,
        skipped: true,
        error: `Job ${jobName} is already running (held by ${holder?.locked_by ?? 'another process'} since ${holder?.locked_at ?? 'unknown'}).`
      };
    }

    try {
      const nowStr = new Date().toISOString();
      let statusMessage = 'Completed successfully.';

      if (jobName === 'market_session_monitor') {
        const session = marketData.getMarketSessionStatus();
        statusMessage = `Session: ${session.session}. ${session.message}`;
      } else if (jobName === 'portfolio_valuation_worker') {
        // Re-evaluate MTM for all open positions across portfolios
        const positions = db.query<{ id: string; portfolio_id: string; portfolio_type: 'REAL' | 'VIRTUAL'; symbol: string; quantity: number; average_buy_price: number }>(`
          SELECT p.id, p.portfolio_id, pf.type AS portfolio_type, a.symbol, p.quantity, p.average_buy_price
          FROM positions p
          JOIN assets a ON p.asset_id = a.id
          JOIN portfolios pf ON pf.id = p.portfolio_id
        `);

        let updatedPositions = 0;
        for (const pos of positions) {
          // A real portfolio must be valued from an authenticated broker/market feed.
          // This build has no such adapter; never rewrite real holdings using demo data.
          if (pos.portfolio_type === 'REAL') continue;
          const quote = await marketData.getQuote(pos.symbol);
          if (!quote || quote.freshness === 'STALE') continue;

          const mktVal = Math.round(pos.quantity * quote.price * 100) / 100;
          const cost = pos.quantity * pos.average_buy_price;
          const unrealised = Math.round((mktVal - cost) * 100) / 100;
          const unrealisedPct = Math.round((unrealised / cost) * 10000) / 100;

          db.execute(`
            UPDATE positions SET
              current_price = ?,
              current_market_value = ?,
              unrealised_pnl = ?,
              unrealised_pnl_pct = ?,
              last_updated_at = datetime('now')
            WHERE id = ?
          `, [quote.price, mktVal, unrealised, unrealisedPct, pos.id]);
          updatedPositions += 1;
        }
        statusMessage = `Re-evaluated ${updatedPositions} virtual positions; real portfolios skipped because broker valuation is not implemented.`;
      } else if (jobName === 'risk_safeguard_checks') {
        // Check portfolios for drawdown limits or loss breaches
        const portfolios = db.query<{ id: string; user_id: string; total_value: number; initial_capital: number; current_cash: number }>(
          'SELECT id, user_id, total_value, initial_capital, current_cash FROM portfolios WHERE is_active = 1'
        );

        for (const p of portfolios) {
          const drawdownPct = p.initial_capital > 0 ? Math.max(0, ((p.initial_capital - p.total_value) / p.initial_capital) * 100) : 0;
          const perm = db.queryOne<{ max_drawdown_limit_pct: number }>('SELECT max_drawdown_limit_pct FROM portfolio_permissions WHERE portfolio_id = ?', [p.id]);
          if (perm && drawdownPct >= perm.max_drawdown_limit_pct) {
            // Trigger emergency halt for portfolio
            db.execute('UPDATE user_settings SET emergency_stop_enabled = 1, emergency_stop_reason = ? WHERE user_id = ?', [
              `Drawdown threshold breached (${drawdownPct.toFixed(1)}% >= ${perm.max_drawdown_limit_pct}%)`,
              p.user_id
            ]);
            statusMessage = `Emergency stop triggered on portfolio ${p.id} due to drawdown breach.`;
          }
        }
      } else if (jobName === 'strategist_thesis_review') {
        // Thesis updates are simulated from local market data; never apply them to REAL accounts.
        const theses = db.query<{ id: string; asset_id: string; stop_loss_price: number; target_price: number }>(`
          SELECT th.id, th.asset_id, th.stop_loss_price, th.target_price
          FROM investment_theses th
          JOIN portfolios pf ON pf.id = th.portfolio_id
          WHERE th.status = 'ACTIVE' AND pf.type = 'VIRTUAL'
        `);
        for (const th of theses) {
          const quote = db.queryOne<{ close: number; freshness_status: string; provider: string }>(
            'SELECT close, freshness_status, provider FROM market_data_points WHERE asset_id = ? ORDER BY timestamp DESC LIMIT 1',
            [th.asset_id]
          );
          if (!quote || !Number.isFinite(quote.close) || quote.close <= 0 ||
              quote.freshness_status === 'STALE' || quote.freshness_status === 'VERIFIED') {
            continue;
          }
          if (th.stop_loss_price && quote.close <= th.stop_loss_price) {
            db.execute("UPDATE investment_theses SET status = 'INVALIDATED', updated_at = datetime('now') WHERE id = ?", [th.id]);
            db.execute(`
              INSERT INTO thesis_reviews (id, thesis_id, review_date, status, notes)
              VALUES (?, ?, datetime('now'), 'INVALIDATED', ?)
            `, [`rev_${Date.now()}`, th.id, `Demo-data close ₹${quote.close}; verify against a real data source before acting.`]);
          } else if (th.target_price && quote.close >= th.target_price) {
            db.execute("UPDATE investment_theses SET status = 'VALIDATED', updated_at = datetime('now') WHERE id = ?", [th.id]);
            db.execute(`
              INSERT INTO thesis_reviews (id, thesis_id, review_date, status, notes)
              VALUES (?, ?, datetime('now'), 'VALIDATED', ?)
            `, [`rev_${Date.now()}`, th.id, `Demo-data close ₹${quote.close}; verify against a real data source before acting.`]);
          }
        }
        statusMessage = `Reviewed ${theses.length} virtual theses using local demo data; REAL theses are skipped.`;
      } else if (jobName === 'order_reconciliation_engine') {
        // Reconcile cash ledger entries with portfolio current_cash
        const ports = db.query<{ id: string; type: 'REAL' | 'VIRTUAL'; current_cash: number }>(
          'SELECT id, type, current_cash FROM portfolios'
        );
        let reconciled = 0;
        for (const port of ports) {
          // Real cash reconciliation requires broker-confirmed balances and fills;
          // local ledger totals alone are not authoritative for a Demat account.
          if (port.type === 'REAL') continue;
          const sumRow = db.queryOne<{ total_ledger: number }>(
            'SELECT COALESCE(SUM(amount), 0) as total_ledger FROM cash_ledger_entries WHERE portfolio_id = ?',
            [port.id]
          );
          if (sumRow && Math.abs(sumRow.total_ledger - port.current_cash) > 0.01) {
            // The ledger is the source of truth for simulated cash, but a silent
            // rewrite would destroy the evidence that a discrepancy existed.
            const difference = Math.round((sumRow.total_ledger - port.current_cash) * 100) / 100;
            db.writeTransaction((database) => {
              database
                .prepare("UPDATE portfolios SET current_cash = ?, updated_at = datetime('now') WHERE id = ? AND type = 'VIRTUAL'")
                .run(sumRow.total_ledger, port.id);
              database
                .prepare(
                  `INSERT INTO audit_logs (id, user_id, portfolio_id, action_type, actor, details, created_at)
                   VALUES (?, NULL, ?, 'CASH_RECONCILED', 'WORKER', ?, datetime('now'))`
                )
                .run(
                  `aud_recon_${port.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  port.id,
                  `Ledger reconciliation adjusted simulated cash by ₹${difference.toFixed(2)} to match the sum of cash-ledger entries.`
                );
            });
            reconciled += 1;
          }
        }
        statusMessage = `Virtual ledger reconciliation complete. ${reconciled} virtual cash discrepancy/discrepancies corrected; real accounts skipped until broker reconciliation exists.`;
      }

      // Update scheduled_jobs record
      db.execute(`
        UPDATE scheduled_jobs SET
          last_run_at = datetime('now'),
          last_run_status = 'SUCCESS',
          last_run_message = ?,
          next_run_at = datetime('now', '+' || interval_seconds || ' seconds')
        WHERE job_name = ?
      `, [statusMessage, jobName]);

      return { success: true, message: statusMessage };
    } catch (err: any) {
      db.execute(`
        UPDATE scheduled_jobs SET
          last_run_at = datetime('now'),
          last_run_status = 'FAILED',
          last_run_message = ?,
          last_run_error_category = ?
        WHERE job_name = ?
      `, [err.message, categorizeError(err), jobName]);
      return { success: false, error: err.message };
    } finally {
      this.releaseJobLock(jobName);
    }
  }

  async runAllJobs() {
    const jobs = db.query<{ job_name: string }>('SELECT job_name FROM scheduled_jobs WHERE is_active = 1');
    const results = [];
    for (const j of jobs) {
      const res = await this.runJob(j.job_name);
      results.push({ job: j.job_name, res });
    }
    return results;
  }

  start(intervalMs = 30000) {
    if (this.isRunning) return;
    this.isRunning = true;
    // A heartbeat is what lets another process tell "running" from "stale".
    this.heartbeat = startHeartbeat(intervalMs);
    console.log('🚀 Background Worker Scheduler started. Running periodic jobs every', intervalMs, 'ms');
    this.runAllJobs().catch(console.error);
    this.timer = setInterval(() => {
      this.runAllJobs().catch(console.error);
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.heartbeat?.stop();
    this.heartbeat = null;
    this.isRunning = false;
    console.log('🛑 Background Worker Scheduler stopped.');
  }
}

/** Coarse, non-secret failure category for health reporting. */
export function categorizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/SQLITE_BUSY|database is locked/i.test(message)) return 'DATABASE_LOCKED';
  if (/SQLITE_|constraint|no such table/i.test(message)) return 'DATABASE_ERROR';
  if (/ETIMEDOUT|network|fetch failed/i.test(message)) return 'NETWORK_ERROR';
  if (/quota|rate limit/i.test(message)) return 'RATE_LIMITED';
  return 'UNKNOWN';
}

export const workerScheduler = new BackgroundWorkerScheduler();
export default workerScheduler;
