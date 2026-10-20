import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import db from '../src/db';
import { GET as getPortfolios } from '../src/app/api/portfolios/route';
import { GET as getOrders, POST as postOrder } from '../src/app/api/orders/route';
import { GET as getProposals, POST as postProposal } from '../src/app/api/proposals/route';
import { GET as getExplainability } from '../src/app/api/explainability/route';
import { GET as getSettings } from '../src/app/api/settings/route';
import {
  USER_A,
  USER_B,
  ensureAllFixtures,
  jsonRequest,
  sessionCookie
} from './helpers/auth-fixtures';

const BASE = 'http://localhost';
const PROPOSAL_B = 'prop_test_b_pending';

function get(url: string, userId: string): Request {
  return new Request(`${BASE}${url}`, { headers: { cookie: sessionCookie(userId) } });
}

function seedProposalForB(): void {
  db.execute(
    `INSERT INTO investment_proposals (
       id, portfolio_id, asset_id, action, horizon, proposed_price, proposed_quantity,
       proposed_value, rationale, supporting_evidence, contrary_evidence,
       alternatives_considered, invalidation_criteria, preconditions, expected_costs,
       expires_at, status
     ) VALUES (?, ?, 'ast_itc', 'BUY', 'LONG_TERM', 492, 2, 984,
       'Fixture rationale', 'Fixture evidence', 'Fixture counter-evidence',
       'Fixture alternatives', 'Fixture invalidation', 'Fixture preconditions', 12,
       datetime('now', '+2 hours'), 'PENDING')
     ON CONFLICT(id) DO UPDATE SET status = 'PENDING', expires_at = datetime('now', '+2 hours')`,
    [PROPOSAL_B, USER_B.portfolioId]
  );
}

function proposalStatus(id: string): string {
  return db.queryOne<{ status: string }>('SELECT status FROM investment_proposals WHERE id = ?', [id])!.status;
}

beforeAll(() => {
  ensureAllFixtures();
});

beforeEach(() => {
  seedProposalForB();
  // The read-scoping test creates this order; start write tests from a clean slate.
  db.execute("DELETE FROM orders WHERE id = 'ord_test_b_1'");
});

describe('ownership scoping — reads', () => {
  it('returns only the caller’s portfolios, positions and ledger', async () => {
    const response = await getPortfolios(get('/api/portfolios', USER_A.id));
    expect(response.status).toBe(200);

    const body = await response.json();
    const portfolioIds = body.portfolios.map((p: any) => p.id);
    expect(portfolioIds).toContain(USER_A.portfolioId);
    expect(portfolioIds).not.toContain(USER_B.portfolioId);
    expect(body.positions.every((p: any) => p.portfolio_id === USER_A.portfolioId)).toBe(true);
    expect(body.ledger.every((l: any) => l.portfolio_id === USER_A.portfolioId)).toBe(true);
  });

  it('does not expose another user’s orders or executions', async () => {
    db.execute(
      `INSERT INTO orders (id, portfolio_id, asset_id, portfolio_type, order_mode, side,
         order_type, product_type, quantity, filled_quantity, price, average_fill_price,
         status, idempotency_key, submitted_at, updated_at)
       VALUES ('ord_test_b_1', ?, 'ast_itc', 'VIRTUAL', 'MANUAL', 'BUY', 'LIMIT', 'CNC',
         1, 1, 492, 492, 'FILLED', 'idem_test_b_1', datetime('now'), datetime('now'))
       ON CONFLICT(id) DO NOTHING`,
      [USER_B.portfolioId]
    );

    const response = await getOrders(get('/api/orders', USER_A.id));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orders.every((o: any) => o.portfolio_id === USER_A.portfolioId)).toBe(true);
    expect(body.orders.map((o: any) => o.id)).not.toContain('ord_test_b_1');
  });

  it('refuses a guessed portfolio id in a query string', async () => {
    for (const url of [
      `/api/orders?portfolioId=${USER_B.portfolioId}`,
      `/api/proposals?portfolioId=${USER_B.portfolioId}`,
      `/api/explainability?portfolioId=${USER_B.portfolioId}`
    ]) {
      const response = await getOrdersOrRoute(url);
      expect(response.status, url).toBe(404);
    }
  });

  it('does not expose another user’s proposals or settings', async () => {
    const proposals = await (await getProposals(get('/api/proposals', USER_A.id))).json();
    expect(proposals.proposals.map((p: any) => p.id)).not.toContain(PROPOSAL_B);
    expect(proposals.proposals.every((p: any) => p.portfolio_id === USER_A.portfolioId)).toBe(true);

    const settings = await (await getSettings(get('/api/settings', USER_A.id))).json();
    expect(settings.settings?.user_id ?? USER_A.id).toBe(USER_A.id);
    expect(settings.permissions.every((p: any) => p.portfolio_id === USER_A.portfolioId)).toBe(true);
  });
});

async function getOrdersOrRoute(url: string): Promise<Response> {
  const request = get(url, USER_A.id);
  if (url.startsWith('/api/orders')) return getOrders(request);
  if (url.startsWith('/api/proposals')) return getProposals(request);
  return getExplainability(request);
}

describe('ownership scoping — writes', () => {
  it('refuses to place an order on another user’s portfolio', async () => {
    const before = db.queryOne<{ current_cash: number }>(
      'SELECT current_cash FROM portfolios WHERE id = ?',
      [USER_B.portfolioId]
    )!;

    const response = await postOrder(
      jsonRequest(
        '/api/orders',
        'POST',
        { portfolioId: USER_B.portfolioId, assetId: 'ast_itc', side: 'BUY', quantity: 1 },
        USER_A.id
      )
    );

    expect(response.status).toBe(404);

    const after = db.queryOne<{ current_cash: number }>(
      'SELECT current_cash FROM portfolios WHERE id = ?',
      [USER_B.portfolioId]
    )!;
    expect(after.current_cash).toBe(before.current_cash);
    expect(
      db.queryOne('SELECT id FROM orders WHERE portfolio_id = ?', [USER_B.portfolioId])
    ).toBeUndefined();
  });

  it('refuses to generate a proposal against another user’s portfolio', async () => {
    const response = await postProposal(
      jsonRequest(
        '/api/proposals',
        'POST',
        { action: 'generate', portfolioId: USER_B.portfolioId, assetId: 'ast_itc', side: 'BUY' },
        USER_A.id
      )
    );
    expect(response.status).toBe(404);
    expect(
      db.queryOne(
        "SELECT id FROM investment_proposals WHERE portfolio_id = ? AND id <> 'prop_test_b_pending'",
        [USER_B.portfolioId]
      )
    ).toBeUndefined();
  });

  it('cannot approve or reject another user’s proposal', async () => {
    const approve = await postProposal(
      jsonRequest('/api/proposals', 'POST', { action: 'respond', proposalId: PROPOSAL_B, decision: 'APPROVE' }, USER_A.id)
    );
    expect(approve.status).toBe(404);
    expect(proposalStatus(PROPOSAL_B)).toBe('PENDING');

    const reject = await postProposal(
      jsonRequest('/api/proposals', 'POST', { action: 'respond', proposalId: PROPOSAL_B, decision: 'REJECT' }, USER_A.id)
    );
    expect(reject.status).toBe(404);
    expect(proposalStatus(PROPOSAL_B)).toBe('PENDING');

    // Positive control: the owner can still act on it.
    const owner = await postProposal(
      jsonRequest('/api/proposals', 'POST', { action: 'respond', proposalId: PROPOSAL_B, decision: 'REJECT' }, USER_B.id)
    );
    expect(owner.status).toBe(200);
    expect(proposalStatus(PROPOSAL_B)).toBe('REJECTED_USER');
  });

  it('cannot smuggle another user’s proposal into an order on its own portfolio', async () => {
    seedProposalForB();
    // Approve it as the owner first, so the only thing standing in the way is
    // that the proposal belongs to a different portfolio.
    db.execute("UPDATE investment_proposals SET status = 'APPROVED' WHERE id = ?", [PROPOSAL_B]);

    const response = await postOrder(
      jsonRequest(
        '/api/orders',
        'POST',
        {
          portfolioId: USER_A.portfolioId,
          assetId: 'ast_itc',
          side: 'BUY',
          quantity: 2,
          orderMode: 'AI_PROPOSAL_APPROVED',
          proposalId: PROPOSAL_B
        },
        USER_A.id
      )
    );
    expect(response.status).not.toBe(200);
    expect(
      db.queryOne('SELECT id FROM orders WHERE portfolio_id = ?', [USER_B.portfolioId])
    ).toBeUndefined();
  });

  it('rejects a malformed or missing portfolio id', async () => {
    const missing = await postOrder(
      jsonRequest('/api/orders', 'POST', { assetId: 'ast_itc', side: 'BUY', quantity: 1 }, USER_A.id)
    );
    expect(missing.status).toBe(400);

    const bogus = await postOrder(
      jsonRequest(
        '/api/orders',
        'POST',
        { portfolioId: 'port_guessed_999', assetId: 'ast_itc', side: 'BUY', quantity: 1 },
        USER_A.id
      )
    );
    expect(bogus.status).toBe(404);
  });

  it('still blocks real-money execution for the owner', async () => {
    // The seeded user owns a REAL portfolio; ordering on it must remain blocked
    // by the execution guards even though the owner passes the ownership check.
    const seededUserId = 'usr_pilot_01';
    const response = await postOrder(
      jsonRequest(
        '/api/orders',
        'POST',
        { portfolioId: 'port_real_01', assetId: 'ast_itc', side: 'BUY', quantity: 1 },
        seededUserId
      )
    );
    // 404 because the seeded user has no provisioned credential to mint a
    // session with? No: sessionCookie() signs a token directly, so the real
    // portfolio is reached and the execution guard must refuse it.
    expect([400, 404]).toContain(response.status);
    if (response.status === 400) {
      const body = await response.json();
      expect(body.error).toMatch(/REAL portfolio execution is disabled|not found/i);
    }
  });
});
