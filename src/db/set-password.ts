/**
 * Provisions (or rotates) a local login credential.
 *
 * Usage:
 *   INVESTPILOT_ADMIN_EMAIL="you@example.com" \
 *   INVESTPILOT_ADMIN_PASSWORD="a-long-unique-passphrase" \
 *   npm run auth:set-password
 *
 * The account must already exist in the `users` table; this script never
 * creates users, never prints the password, and has no default value.
 */
import db, { getDb } from './index';
import { assertPasswordPolicy, hashPassword } from '../lib/auth/password';

function main() {
  const email = (process.env.INVESTPILOT_ADMIN_EMAIL ?? '').trim();
  const password = process.env.INVESTPILOT_ADMIN_PASSWORD ?? '';

  if (!email) {
    console.error('INVESTPILOT_ADMIN_EMAIL is required.');
    process.exitCode = 1;
    return;
  }
  if (!password) {
    console.error('INVESTPILOT_ADMIN_PASSWORD is required.');
    process.exitCode = 1;
    return;
  }

  try {
    assertPasswordPolicy(password);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  getDb();

  const user = db.queryOne<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE lower(email) = lower(?)',
    [email]
  );
  if (!user) {
    console.error(
      `No user with email ${email} exists. Create the user first (schema/seed) and then re-run this script.`
    );
    process.exitCode = 1;
    return;
  }

  const hash = hashPassword(password);
  // Rotating the password also bumps token_version, which revokes every session
  // issued with the old credential instead of letting it run to expiry.
  db.execute(
    `INSERT INTO user_credentials (user_id, password_hash, password_updated_at, token_version)
     VALUES (?, ?, datetime('now'), 1)
     ON CONFLICT(user_id) DO UPDATE SET
       password_hash = excluded.password_hash,
       password_updated_at = datetime('now'),
       token_version = token_version + 1`,
    [user.id, hash]
  );

  console.log(
    `Password updated for ${user.email} (${user.id}). All previously issued sessions are now revoked.`
  );
}

main();
