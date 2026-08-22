import type { Transaction } from 'sequelize';
import { Currency, CurrencyPlan, PlatformModule } from '../../db/models';
import { AppError } from '../../lib/errors';
import type { ModuleCode } from '../../lib/constants';

/**
 * Currencies, their module binding and their plans.
 *
 * Spending code never names a currency. It asks for the currency bound to its
 * own module, which is why adding the Reports or Discovery spend path later
 * touches no wallet or ledger logic.
 */
export async function listCurrencies(): Promise<Currency[]> {
  return Currency.findAll({
    where: { isActive: true },
    include: [
      { model: PlatformModule, as: 'module' },
      { model: CurrencyPlan, as: 'plans', where: { isActive: true }, required: false },
    ],
    order: [
      ['id', 'ASC'],
      [{ model: CurrencyPlan, as: 'plans' }, 'sortOrder', 'ASC'],
    ],
  });
}

export async function getCurrencyById(
  currencyId: number,
  transaction?: Transaction,
): Promise<Currency> {
  const currency = await Currency.findByPk(currencyId, {
    include: [{ model: PlatformModule, as: 'module' }],
    transaction,
  });

  if (!currency) {
    throw AppError.notFound('Currency');
  }

  if (!currency.isActive) {
    throw new AppError('CURRENCY_INACTIVE', 422, `${currency.name} is no longer available.`);
  }

  return currency;
}

/** The one currency bound to a module, via uq_currencies_module_id. */
export async function getCurrencyForModule(
  moduleCode: ModuleCode,
  transaction?: Transaction,
): Promise<Currency> {
  const currency = await Currency.findOne({
    include: [{ model: PlatformModule, as: 'module', where: { code: moduleCode } }],
    transaction,
  });

  if (!currency) {
    throw AppError.notFound(`Currency for the "${moduleCode}" module`);
  }

  return currency;
}

/**
 * Rejects spending a currency inside a module it is not bound to.
 *
 * This is the check that produces the clean 422. The composite foreign key on
 * campaigns is the backstop underneath it: if this check were ever skipped, the
 * write would still fail. Two layers, because the rule has to keep holding once
 * Reports and Discovery grow spend paths of their own.
 */
export async function assertCurrencySpendableInModule(
  currencyId: number,
  moduleCode: ModuleCode,
  transaction?: Transaction,
): Promise<Currency> {
  const currency = await getCurrencyById(currencyId, transaction);

  if (currency.module?.code !== moduleCode) {
    throw new AppError(
      'CURRENCY_NOT_ALLOWED_FOR_MODULE',
      422,
      `${currency.name} cannot be spent in the "${moduleCode}" module.`,
    );
  }

  return currency;
}

export function serialiseCurrency(currency: Currency): Record<string, unknown> {
  return {
    id: currency.id,
    code: currency.code,
    name: currency.name,
    module: currency.module ? { id: currency.module.id, code: currency.module.code, name: currency.module.name } : null,
    pricePerCreditPaise: currency.pricePerCreditPaise,
    plans: (currency.plans ?? []).map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      credits: plan.credits,
      pricePaise: plan.pricePaise,
    })),
  };
}
