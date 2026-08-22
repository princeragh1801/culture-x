/**
 * Asserts the wallet invariants directly against the database.
 *
 * Run it at any point — after a test run, after replaying webhooks, after a
 * concurrency experiment — and it answers the acceptance criteria with data
 * rather than with argument:
 *
 *   1. For every wallet and currency, the balance equals the sum of that
 *      currency's ledger entries.
 *   2. No balance is negative.
 *   3. No campaign is funded more than once, or funded in a currency belonging
 *      to another module.
 *
 * Usage: npm run check:invariants
 */
import { QueryTypes } from 'sequelize';
import { databaseName, dbEnv } from '../config/db-env';
import { sequelize } from '../db/models';

interface BalanceDrift {
  wallet_id: number;
  currency_code: string;
  balance: number;
  ledger_sum: number;
}

interface CampaignViolation {
  id: number;
  name: string;
  reason: string;
}

async function main(): Promise<void> {
  const failures: string[] = [];

  // 1. balance === SUM(ledger.amount), per wallet and currency.
  const drift = await sequelize.query<BalanceDrift>(
    `SELECT wb.wallet_id,
            c.code AS currency_code,
            CAST(wb.balance AS SIGNED)            AS balance,
            CAST(COALESCE(SUM(le.amount), 0) AS SIGNED) AS ledger_sum
       FROM wallet_balances wb
       JOIN currencies c ON c.id = wb.currency_id
       LEFT JOIN ledger_entries le
              ON le.wallet_id = wb.wallet_id
             AND le.currency_id = wb.currency_id
      GROUP BY wb.wallet_id, wb.currency_id, c.code, wb.balance
     HAVING balance <> ledger_sum`,
    { type: QueryTypes.SELECT },
  );

  for (const row of drift) {
    failures.push(
      `wallet ${row.wallet_id} / ${row.currency_code}: balance ${row.balance} but ledger sums to ${row.ledger_sum}`,
    );
  }

  // 2. No negative balance. UNSIGNED makes this unreachable; checked anyway,
  //    because an invariant you never verify is an assumption.
  const negatives = await sequelize.query<{ count: number }>(
    'SELECT COUNT(*) AS count FROM wallet_balances WHERE balance < 0',
    { type: QueryTypes.SELECT, plain: true },
  );
  if (negatives && Number(negatives.count) > 0) {
    failures.push(`${negatives.count} wallet_balances rows are negative`);
  }

  // 3. Campaign funding is single, and stays inside the campaigns module.
  const campaignViolations = await sequelize.query<CampaignViolation>(
    `SELECT ca.id, ca.name,
            CASE
              WHEN ca.status = 'FUNDED' AND cur.module_id <> ca.module_id
                THEN 'funded with a currency from another module'
              WHEN ca.status = 'FUNDED' AND le.id IS NULL
                THEN 'funded without a ledger entry'
              WHEN ca.status = 'FUNDED' AND CAST(le.amount AS SIGNED) <> -CAST(ca.funded_credits AS SIGNED)
                THEN 'funded amount does not match its ledger entry'
              ELSE 'ok'
            END AS reason
       FROM campaigns ca
       LEFT JOIN currencies cur ON cur.id = ca.currency_id
       LEFT JOIN ledger_entries le ON le.id = ca.ledger_entry_id
      HAVING reason <> 'ok'`,
    { type: QueryTypes.SELECT },
  );

  for (const row of campaignViolations) {
    failures.push(`campaign ${row.id} (${row.name}): ${row.reason}`);
  }

  const totals = await sequelize.query<{ wallets: number; entries: number; campaigns: number }>(
    `SELECT (SELECT COUNT(*) FROM wallet_balances) AS wallets,
            (SELECT COUNT(*) FROM ledger_entries)  AS entries,
            (SELECT COUNT(*) FROM campaigns)       AS campaigns`,
    { type: QueryTypes.SELECT, plain: true },
  );

  console.log(`Database: ${databaseName} (NODE_ENV=${dbEnv.NODE_ENV})`);
  console.log(
    `Checked ${totals?.wallets ?? 0} balance rows, ${totals?.entries ?? 0} ledger entries, ` +
      `${totals?.campaigns ?? 0} campaigns.`,
  );

  if (failures.length > 0) {
    console.error(`\nINVARIANT VIOLATIONS (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('All invariants hold.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
