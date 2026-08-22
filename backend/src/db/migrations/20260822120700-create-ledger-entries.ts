import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * The ledger. Append-only, and the source of truth for every balance.
 *
 * amount is signed: a purchase writes a positive row, funding a campaign writes a
 * negative one. That makes the acceptance criterion literally checkable —
 *
 *   SELECT SUM(amount) FROM ledger_entries WHERE wallet_id = ? AND currency_id = ?
 *
 * must equal wallet_balances.balance for that pair, at all times.
 *
 * idempotency_key is the single choke point every credit movement passes through:
 *
 *   purchase:<stripe_payment_intent_id>   granting credits for a payment
 *   campaign_funding:<campaign_id>        spending credits on a campaign
 *
 * The unique index on it is what makes exactly-once a database guarantee rather
 * than an application convention. It holds even when the same payment arrives
 * under two different Stripe event ids — for example checkout.session.completed
 * followed by checkout.session.async_payment_succeeded — which a dedupe table
 * keyed on the event id alone would let through.
 *
 * There is no updated_at: a ledger row is never modified after it is written.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'ledger_entries',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      wallet_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      currency_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'currencies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      entry_type: {
        type: DataTypes.ENUM('PURCHASE', 'CAMPAIGN_FUNDING'),
        allowNull: false,
      },
      amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: 'Signed whole credits: positive grants, negative spends.',
      },
      balance_after: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: 'Balance in this currency immediately after this entry was applied.',
      },
      reference_type: {
        type: DataTypes.ENUM('CREDIT_PURCHASE', 'CAMPAIGN'),
        allowNull: false,
      },
      reference_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        comment: 'Polymorphic: no FK, because it points at two different tables.',
      },
      idempotency_key: {
        type: DataTypes.STRING(191),
        allowNull: false,
        comment: 'Unique. The database-level exactly-once guarantee for credit movements.',
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
      },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' },
  );

  await queryInterface.addConstraint('ledger_entries', {
    name: 'uq_ledger_entries_idempotency_key',
    type: 'unique',
    fields: ['idempotency_key'],
  });

  // A purchase can only ever add credits and campaign funding can only ever
  // remove them, so a mis-signed entry cannot be written at all.
  await queryInterface.addConstraint('ledger_entries', {
    name: 'ck_ledger_entries_amount_sign',
    type: 'check',
    fields: ['amount'],
    where: literal(
      "(entry_type = 'PURCHASE' AND amount > 0) OR (entry_type = 'CAMPAIGN_FUNDING' AND amount < 0)",
    ),
  });

  // Serves both the per-currency ledger history endpoint and the SUM(amount)
  // invariant check.
  await queryInterface.addIndex('ledger_entries', {
    name: 'ix_ledger_entries_wallet_currency_id',
    fields: ['wallet_id', 'currency_id', 'id'],
  });

  await queryInterface.addIndex('ledger_entries', {
    name: 'ix_ledger_entries_reference',
    fields: ['reference_type', 'reference_id'],
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('ledger_entries');
}
