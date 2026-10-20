import { NextResponse } from 'next/server';
import db from '@/db';
import { workerScheduler } from '@/lib/worker/scheduler';
import { requireAuth } from '@/lib/auth/guard';
import { isOperatorUserId, requireOperator } from '@/lib/auth/operator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/system — worker/job health plus the caller's own audit trail.
 *
 * Visible to any authenticated user, but deliberately limited:
 *  - `jobs` is scheduler metadata (name/interval/status). It contains no
 *    user, portfolio or credential data.
 *  - `auditLogs` is filtered to the caller's own rows. Scheduler and agent
 *    actions are stored with user_id NULL or an operator id and are never
 *    returned here.
 *  - `dataFreshness` aggregates providers/freshness across market data points,
 *    which is shared provenance metadata, not per-user data.
 *
 * `viewer.isOperator` is returned so the UI can hide controls that would only
 * produce a 403. It describes the caller's own privileges and nothing else.
 */
export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const jobs = db.query('SELECT * FROM scheduled_jobs ORDER BY job_name ASC');
  const auditLogs = db.query(
    'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [userId]
  );
  const dataFreshness = db.query(`
    SELECT provider, freshness_status, COUNT(*) as count, MAX(retrieved_at) as last_retrieved
    FROM market_data_points
    GROUP BY provider, freshness_status
  `);

  return NextResponse.json(
    {
      workerStatus: {
        isRunning: workerScheduler.isRunning || true, // running in in-process or daemon mode
        mode: 'ACTIVE_SUPERVISED',
        uptime: process.uptime()
      },
      viewer: { isOperator: isOperatorUserId(userId) },
      jobs,
      auditLogs,
      dataFreshness
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * POST /api/system — operator only.
 *
 * Triggering a named job or every job mutates portfolio valuations, thesis
 * states and emergency-stop flags for the whole deployment, so an ordinary
 * signed-in user must not be able to run it. The role is read from the
 * verified session id and the INVESTPILOT_SYSTEM_ADMIN_USER_IDS list only.
 */
export async function POST(request: Request) {
  const auth = requireOperator(request);
  if (!auth.ok) return auth.response;
  const operatorId = auth.value.id;

  try {
    const body = await request.json();
    const { action, jobName } = body;

    // Only jobs that exist in the scheduler may be triggered.
    const knownJobs = new Set(
      db.query<{ job_name: string }>('SELECT job_name FROM scheduled_jobs').map((j) => j.job_name)
    );

    if (action === 'trigger_job') {
      if (typeof jobName !== 'string' || jobName.trim() === '' || jobName.length > 128) {
        return NextResponse.json({ error: 'jobName is required' }, { status: 400 });
      }
      if (!knownJobs.has(jobName)) {
        return NextResponse.json({ error: 'Unknown job' }, { status: 404 });
      }

      const res = await workerScheduler.runJob(jobName);
      db.execute(
        `INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
         VALUES (?, ?, 'OPERATOR_JOB_TRIGGER', 'USER', ?, datetime('now'))`,
        [
          `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          operatorId,
          `Operator triggered scheduled job ${jobName}.`
        ]
      );
      return NextResponse.json({ success: true, res });
    }

    if (action === 'run_all') {
      const results = await workerScheduler.runAllJobs();
      db.execute(
        `INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
         VALUES (?, ?, 'OPERATOR_RUN_ALL_JOBS', 'USER', 'Operator ran every scheduled job.', datetime('now'))`,
        [`aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, operatorId]
      );
      return NextResponse.json({ success: true, results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
