import { execFileSync } from 'node:child_process';

/**
 * Brings the test database up to the current schema, once per run.
 *
 * The suite runs against a real MySQL rather than an in-memory substitute
 * because most of what it proves lives in the database: SELECT ... FOR UPDATE,
 * unique indexes, composite foreign keys and UNSIGNED underflow. A fake would
 * only test the assumptions.
 */
export async function setup(): Promise<void> {
  const env = { ...process.env, NODE_ENV: 'test' };
  const run = (script: string): void => {
    execFileSync('npm', ['run', script], { env, stdio: 'inherit' });
  };

  run('migrate');
  // Reference data only: modules, currencies and plans. Everything else is
  // truncated between tests.
  run('seed');
}
