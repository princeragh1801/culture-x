import { QueryTypes, type QueryInterface } from 'sequelize';

/**
 * The platform's three modules, their credit currencies and their bundles.
 *
 * This is configuration, not code: prices, plans and the currency-to-module
 * binding are all rows. Adding a fourth currency is a seed change plus a module
 * that knows how to spend it — no change to the wallet, ledger or funding logic.
 *
 * All money is integer paise. Rs 3 per credit is 300.
 *
 * The literal codes below are duplicated rather than imported from application
 * constants on purpose: a seeder records what was inserted at a point in time and
 * must not change meaning when the application's constants are refactored.
 */
interface PlanSeed {
  code: string;
  name: string;
  credits: number;
  pricePaise: number;
}

interface CurrencySeed {
  code: string;
  name: string;
  moduleCode: string;
  moduleName: string;
  pricePerCreditPaise: number;
  plans: PlanSeed[];
}

const CURRENCIES: CurrencySeed[] = [
  {
    code: 'CAMPAIGN_CREDITS',
    name: 'Campaign Credits',
    moduleCode: 'campaigns',
    moduleName: 'Campaigns',
    pricePerCreditPaise: 300, // Rs 3
    plans: [
      { code: 'CAMPAIGN_100', name: '100 Campaign Credits', credits: 100, pricePaise: 30_000 }, // Rs 300
      { code: 'CAMPAIGN_1000', name: '1,000 Campaign Credits', credits: 1_000, pricePaise: 270_000 }, // Rs 2,700
    ],
  },
  {
    code: 'REPORT_CREDITS',
    name: 'Report Credits',
    moduleCode: 'reports',
    moduleName: 'Reports',
    pricePerCreditPaise: 1_000, // Rs 10
    plans: [
      { code: 'REPORT_10', name: '10 Report Credits', credits: 10, pricePaise: 10_000 }, // Rs 100
      { code: 'REPORT_100', name: '100 Report Credits', credits: 100, pricePaise: 90_000 }, // Rs 900
    ],
  },
  {
    code: 'DISCOVERY_CREDITS',
    name: 'Discovery Credits',
    moduleCode: 'discovery',
    moduleName: 'Discovery',
    pricePerCreditPaise: 500, // Rs 5
    plans: [
      { code: 'DISCOVERY_100', name: '100 Discovery Credits', credits: 100, pricePaise: 50_000 }, // Rs 500
      { code: 'DISCOVERY_1000', name: '1,000 Discovery Credits', credits: 1_000, pricePaise: 450_000 }, // Rs 4,500
    ],
  },
];

/**
 * INSERT IGNORE, so re-running the seeder against a populated database is a
 * no-op instead of a duplicate-key error. The MySQL query generator honours this
 * option; Sequelize's bulkInsert types simply do not describe it.
 */
const IGNORE_DUPLICATES = { ignoreDuplicates: true } as unknown as Parameters<
  QueryInterface['bulkInsert']
>[2];

/** Returns a code -> id map for the given table, for rows matching the codes. */
async function idsByCode(
  queryInterface: QueryInterface,
  table: string,
  codes: string[],
): Promise<Map<string, number>> {
  const rows = await queryInterface.sequelize.query<{ id: number; code: string }>(
    `SELECT id, code FROM ${table} WHERE code IN (:codes)`,
    { type: QueryTypes.SELECT, replacements: { codes } },
  );
  return new Map(rows.map((row) => [row.code, Number(row.id)]));
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert(
    'modules',
    CURRENCIES.map((currency) => ({ code: currency.moduleCode, name: currency.moduleName })),
    IGNORE_DUPLICATES,
  );

  const moduleIds = await idsByCode(
    queryInterface,
    'modules',
    CURRENCIES.map((currency) => currency.moduleCode),
  );

  await queryInterface.bulkInsert(
    'currencies',
    CURRENCIES.map((currency) => ({
      code: currency.code,
      name: currency.name,
      module_id: moduleIds.get(currency.moduleCode),
      price_per_credit_paise: currency.pricePerCreditPaise,
      is_active: true,
    })),
    IGNORE_DUPLICATES,
  );

  const currencyIds = await idsByCode(
    queryInterface,
    'currencies',
    CURRENCIES.map((currency) => currency.code),
  );

  await queryInterface.bulkInsert(
    'currency_plans',
    CURRENCIES.flatMap((currency) =>
      currency.plans.map((plan, index) => ({
        currency_id: currencyIds.get(currency.code),
        code: plan.code,
        name: plan.name,
        credits: plan.credits,
        price_paise: plan.pricePaise,
        is_active: true,
        sort_order: index + 1,
      })),
    ),
    IGNORE_DUPLICATES,
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const planCodes = CURRENCIES.flatMap((currency) => currency.plans.map((plan) => plan.code));
  const currencyCodes = CURRENCIES.map((currency) => currency.code);
  const moduleCodes = CURRENCIES.map((currency) => currency.moduleCode);

  // Child-first, so the foreign keys stay satisfied.
  await queryInterface.bulkDelete('currency_plans', { code: planCodes });
  await queryInterface.bulkDelete('currencies', { code: currencyCodes });
  await queryInterface.bulkDelete('modules', { code: moduleCodes });
}
