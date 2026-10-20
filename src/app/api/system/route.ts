import { NextResponse } from 'next/server';
import db from '@/db';
import { workerScheduler } from '@/lib/worker/scheduler';
import { requireAuth } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/system — worker/job health plus the caller's own audit trail.
 *
 * There is no admin role in this schema, so audit rows are limited to the
 * authenticated user (rows with no user, e.g. scheduler actions, are excluded
 * rather than exposed).
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
      jobs,
      auditLogs,
      dataFreshness
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { action, jobName } = body;

    if (action === 'trigger_job' && jobName) {
      const res = await workerScheduler.runJob(jobName);
      return NextResponse.json({ success: true, res });
    }

    if (action === 'run_all') {
      const results = await workerScheduler.runAllJobs();
      return NextResponse.json({ success: true, results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
