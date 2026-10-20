import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import db from '../src/db';
import { GET as getSystem, POST as postSystem } from '../src/app/api/system/route';
import { GET as getAgents, POST as postAgents } from '../src/app/api/agents/route';
import { GET as getSession } from '../src/app/api/auth/session/route';
import { GET as getPortfolios } from '../src/app/api/portfolios/route';
import {
  SYSTEM_ADMIN_IDS_ENV,
  getOperatorUserIds,
  isOperatorUserId,
  parseOperatorUserIds
} from '../src/lib/auth/operator';
import {
  USER_A,
  USER_B,
  ensureAllFixtures,
  sessionCookie
} from './helpers/auth-fixtures';

const BASE = 'http://localhost';
const ORIGINAL_ADMIN_IDS = process.env[SYSTEM_ADMIN_IDS_ENV];

function setOperators(value: string | undefined) {
  if (value === undefined) delete process.env[SYSTEM_ADMIN_IDS_ENV];
  else process.env[SYSTEM_ADMIN_IDS_ENV] = value;
}

function request(
  path: string,
  userId?: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Request {
  const headers = new Headers(init.headers ?? {});
  if (userId) headers.set('cookie', sessionCookie(userId));
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
}

function jobStatus(jobName: string): string | null {
  const row = db.queryOne<{ last_run_status: string | null }>(
    'SELECT last_run_status FROM scheduled_jobs WHERE job_name = ?',
    [jobName]
  );
  return row?.last_run_status ?? null;
}

function runCount(): number {
  return db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM agent_runs')!.c;
}

beforeAll(() => {
  ensureAllFixtures();
});

beforeEach(() => {
  setOperators(undefined);
});

afterEach(() => {
  setOperators(ORIGINAL_ADMIN_IDS);
});

describe('operator allowlist parsing', () => {
  it('is empty by default', () => {
    expect([...parseOperatorUserIds(undefined)]).toEqual([]);
    expect([...parseOperatorUserIds('')]).toEqual([]);
    expect([...parseOperatorUserIds('   ')]).toEqual([]);
    expect(getOperatorUserIds().size).toBe(0);
    expect(isOperatorUserId(USER_A.id)).toBe(false);
  });

  it('accepts exact ids and rejects junk or wildcards', () => {
    expect([...parseOperatorUserIds(' usr_a , ,usr_b ')].sort()).toEqual(['usr_a', 'usr_b']);
    expect([...parseOperatorUserIds('*')]).toEqual([]);
    expect([...parseOperatorUserIds('usr a')]).toEqual([]);
    expect([...parseOperatorUserIds('<script>alert(1)</script>')]).toEqual([]);
    expect([...parseOperatorUserIds('u'.repeat(300))]).toEqual([]);
  });

  it('matches exactly and case-sensitively', () => {
    setOperators('usr_test_a');
    expect(isOperatorUserId('usr_test_a')).toBe(true);
    expect(isOperatorUserId('USR_TEST_A')).toBe(false);
    expect(isOperatorUserId('usr_test_a_extra')).toBe(false);
    expect(isOperatorUserId('usr_test')).toBe(false);
    expect(isOperatorUserId(undefined)).toBe(false);
  });
});

describe('operator-only actions — empty default denies everyone', () => {
  it('returns 403 for a configured-looking user when the list is empty', async () => {
    expect(getOperatorUserIds().size).toBe(0);

    const trigger = await postSystem(request('/api/system', USER_A.id, {
      body: { action: 'trigger_job', jobName: 'risk_safeguard_checks' }
    }));
    expect(trigger.status).toBe(403);

    const runAll = await postSystem(request('/api/system', USER_A.id, { body: { action: 'run_all' } }));
    expect(runAll.status).toBe(403);

    const scan = await postAgents(request('/api/agents', USER_A.id, { body: { action: 'scan' } }));
    expect(scan.status).toBe(403);
  });

  it('does not run any job when the caller is denied', async () => {
    const before = jobStatus('market_session_monitor');
    const runsBefore = runCount();

    await postSystem(request('/api/system', USER_A.id, {
      body: { action: 'trigger_job', jobName: 'market_session_monitor' }
    }));
    await postAgents(request('/api/agents', USER_A.id, { body: { action: 'scan' } }));

    expect(jobStatus('market_session_monitor')).toBe(before);
    expect(runCount()).toBe(runsBefore);
  });

  it('still requires authentication (401 before 403)', async () => {
    const trigger = await postSystem(request('/api/system', undefined, {
      body: { action: 'run_all' }
    }));
    expect(trigger.status).toBe(401);

    const scan = await postAgents(request('/api/agents', undefined, { body: { action: 'scan' } }));
    expect(scan.status).toBe(401);
  });
});

describe('operator-only actions — ordinary users are refused', () => {
  beforeEach(() => {
    // Only USER_B is an operator; USER_A is an ordinary signed-in user.
    setOperators(USER_B.id);
  });

  it('denies an ordinary authenticated user with 403 on every operator action', async () => {
    const actions = [
      postSystem(request('/api/system', USER_A.id, { body: { action: 'trigger_job', jobName: 'market_session_monitor' } })),
      postSystem(request('/api/system', USER_A.id, { body: { action: 'run_all' } })),
      postAgents(request('/api/agents', USER_A.id, { body: { action: 'scan' } }))
    ];
    for (const response of await Promise.all(actions)) {
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toMatch(/operator/i);
    }
  });

  it('cannot gain the role by putting an operator id in the body, query or headers', async () => {
    const attempts = [
      request('/api/system?userId=' + USER_B.id, USER_A.id, {
        body: { action: 'run_all', userId: USER_B.id, operator: true, role: 'ADMIN' },
        headers: {
          'x-user-id': USER_B.id,
          'x-user': USER_B.id,
          'x-operator': 'true',
          'x-admin': 'true',
          'x-role': 'ADMIN'
        }
      }),
      request('/api/agents', USER_A.id, {
        body: { action: 'scan', userId: USER_B.id },
        headers: { 'x-user-id': USER_B.id, 'x-operator': 'true' }
      })
    ];

    for (const attempt of attempts) {
      const response = attempt.url.includes('/api/system') ? await postSystem(attempt) : await postAgents(attempt);
      expect(response.status).toBe(403);
    }
  });

  it('cannot impersonate an operator by forging an unsigned session', async () => {
    const forged = `v1.${Buffer.from(JSON.stringify({ v: 1, sub: USER_B.id, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.not-a-real-signature`;
    const response = await postSystem(
      new Request(`${BASE}/api/system`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `investpilot_session=${forged}` },
        body: JSON.stringify({ action: 'run_all' })
      })
    );
    expect(response.status).toBe(401);
  });

  it('keeps sensitive reads available to the ordinary user', async () => {
    const system = await getSystem(request('/api/system', USER_A.id));
    expect(system.status).toBe(200);
    const systemBody = await system.json();
    expect(systemBody.viewer.isOperator).toBe(false);

    const agents = await getAgents(request('/api/agents', USER_A.id));
    expect(agents.status).toBe(200);
    expect((await agents.json()).viewer.isOperator).toBe(false);

    const portfolios = await getPortfolios(request('/api/portfolios', USER_A.id));
    expect(portfolios.status).toBe(200);
  });
});

describe('operator-only actions — a configured operator succeeds', () => {
  beforeEach(() => {
    setOperators(` ${USER_B.id} `);
  });

  it('reports the role on the session endpoint for the operator only', async () => {
    const operatorSession = await (await getSession(request('/api/auth/session', USER_B.id))).json();
    expect(operatorSession.isOperator).toBe(true);

    const userSession = await (await getSession(request('/api/auth/session', USER_A.id))).json();
    expect(userSession.isOperator).toBe(false);

    const system = await (await getSystem(request('/api/system', USER_B.id))).json();
    expect(system.viewer.isOperator).toBe(true);
  });

  it('can trigger a named job', async () => {
    const response = await postSystem(
      request('/api/system', USER_B.id, {
        body: { action: 'trigger_job', jobName: 'market_session_monitor' }
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(jobStatus('market_session_monitor')).toBe('SUCCESS');

    const audit = db.queryOne<{ action_type: string }>(
      "SELECT action_type FROM audit_logs WHERE user_id = ? AND action_type = 'OPERATOR_JOB_TRIGGER'",
      [USER_B.id]
    );
    expect(audit?.action_type).toBe('OPERATOR_JOB_TRIGGER');
  });

  it('can run all jobs', async () => {
    const response = await postSystem(
      request('/api/system', USER_B.id, { body: { action: 'run_all' } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
  });

  it('can start a market intelligence scan', async () => {
    const before = runCount();
    const response = await postAgents(
      request('/api/agents', USER_B.id, { body: { action: 'scan' } })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(runCount()).toBeGreaterThan(before);
  });

  it('rejects unknown jobs and unknown actions without running anything', async () => {
    const unknownJob = await postSystem(
      request('/api/system', USER_B.id, { body: { action: 'trigger_job', jobName: 'drop_all_tables' } })
    );
    expect(unknownJob.status).toBe(404);

    const missingJob = await postSystem(
      request('/api/system', USER_B.id, { body: { action: 'trigger_job' } })
    );
    expect(missingJob.status).toBe(400);

    const badAction = await postSystem(
      request('/api/system', USER_B.id, { body: { action: 'rm -rf' } })
    );
    expect(badAction.status).toBe(400);

    const badAgentAction = await postAgents(
      request('/api/agents', USER_B.id, { body: { action: 'shutdown' } })
    );
    expect(badAgentAction.status).toBe(400);
  });
});

describe('shared research endpoints do not leak private data', () => {
  it('scopes theses and audit rows to the caller', async () => {
    db.execute(
      `INSERT OR IGNORE INTO investment_theses
         (id, portfolio_id, asset_id, horizon, core_thesis, catalysts, target_price,
          stop_loss_price, time_horizon_days, invalidation_criteria, status)
       VALUES ('th_test_b', ?, 'ast_itc', 'LONG_TERM', 'Private B thesis', 'Fixture',
               600, 400, 90, 'Fixture invalidation', 'ACTIVE')`,
      [USER_B.portfolioId]
    );
    db.execute(
      `INSERT OR IGNORE INTO audit_logs (id, user_id, action_type, actor, details)
       VALUES ('aud_test_b_private', ?, 'TEST_PRIVATE', 'USER', 'B private audit row')`,
      [USER_B.id]
    );

    const agents = await (await getAgents(request('/api/agents', USER_A.id))).json();
    expect(agents.theses.map((t: any) => t.id)).not.toContain('th_test_b');

    const operatorSystem = await (await getSystem(request('/api/system', USER_A.id))).json();
    expect(operatorSystem.auditLogs.map((a: any) => a.id)).not.toContain('aud_test_b_private');
    expect(operatorSystem.auditLogs.every((a: any) => a.user_id === USER_A.id)).toBe(true);

    // Agent observations and runs carry no user/portfolio columns at all.
    const observationColumns = Object.keys(
      db.queryOne('SELECT * FROM agent_observations') ?? {}
    );
    expect(observationColumns).not.toContain('user_id');
    expect(observationColumns).not.toContain('portfolio_id');
  });
});
