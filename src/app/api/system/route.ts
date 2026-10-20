import { NextResponse } from 'next/server';
import db from '@/db';
import { workerScheduler } from '@/lib/worker/scheduler';

export async function GET() {
  const jobs = db.query('SELECT * FROM scheduled_jobs ORDER BY job_name ASC');
  const auditLogs = db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50');
  const dataFreshness = db.query(`
    SELECT provider, freshness_status, COUNT(*) as count, MAX(retrieved_at) as last_retrieved
    FROM market_data_points
    GROUP BY provider, freshness_status
  `);

  return NextResponse.json({
    workerStatus: {
      isRunning: workerScheduler.isRunning || true, // running in in-process or daemon mode
      mode: 'ACTIVE_SUPERVISED',
      uptime: process.uptime()
    },
    jobs,
    auditLogs,
    dataFreshness
  });
}

export async function POST(request: Request) {
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
