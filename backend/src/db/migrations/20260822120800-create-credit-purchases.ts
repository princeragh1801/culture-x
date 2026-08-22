import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * A single attempt to buy credits with real money.
 *
 * The row is written as PENDING before the Stripe Checkout Session is created,
 * so a webhook can always find its purchase — even one that arrives before we
 * have persisted the session id, because the session carries the purchase id in
 * its metadata.
 *
 * credits, unit_price_paise and amount_paise are snapshots taken at creation
 * time. Prices are configurable data, so without the snapshot a later price
 * change would retroactively alter what a past payment was worth. The snapshot
 * also lets the webhook assert session.amount_total = amount_paise before
 * granting anything.
 *
 * stripe_payment_intent_id is unique: one payment can back at most one purchase.
 * ledger_entry_id is unique: one purchase can produce at most one grant.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'credit_purchases',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      wallet_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'wallets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      currency_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'currencies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      plan_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'currency_plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'Null for a per-credit quantity purchase.',
      },
      credits: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      unit_price_paise: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'Price per credit at the moment of purchase.',
      },
      amount_paise: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'Total charged. Compared against session.amount_total in the webhook.',
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'PAID', 'FAILED', 'EXPIRED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      stripe_checkout_session_id: {
        type: DataTypes.STRING(191),
        allowNull: true,
      },
      stripe_payment_intent_id: {
        type: DataTypes.STRING(191),
        allowNull: true,
      },
      ledger_entry_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'ledger_entries', key: 'id' },
        // RESTRICT rather than CASCADE on update: a ledger id never changes, and
        // MySQL refuses to put a column in both a CHECK and a cascading FK.
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT',
      },
      request_idempotency_key: {
        type: DataTypes.STRING(191),
        allowNull: true,
        comment: 'Optional client Idempotency-Key, so a retried POST reuses this purchase.',
      },
      paid_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    },
    { charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' },
  );

  await queryInterface.addConstraint('credit_purchases', {
    name: 'uq_credit_purchases_session_id',
    type: 'unique',
    fields: ['stripe_checkout_session_id'],
  });

  await queryInterface.addConstraint('credit_purchases', {
    name: 'uq_credit_purchases_payment_intent_id',
    type: 'unique',
    fields: ['stripe_payment_intent_id'],
  });

  await queryInterface.addConstraint('credit_purchases', {
    name: 'uq_credit_purchases_ledger_entry_id',
    type: 'unique',
    fields: ['ledger_entry_id'],
  });

  // MySQL allows repeated NULLs in a unique index, so purchases made without a
  // client key are unaffected by this constraint.
  await queryInterface.addConstraint('credit_purchases', {
    name: 'uq_credit_purchases_user_request_key',
    type: 'unique',
    fields: ['user_id', 'request_idempotency_key'],
  });

  await queryInterface.addConstraint('credit_purchases', {
    name: 'ck_credit_purchases_amounts_positive',
    type: 'check',
    fields: ['credits', 'amount_paise'],
    where: literal('credits > 0 AND amount_paise > 0 AND unit_price_paise > 0'),
  });

  // A PAID purchase must be able to point at the payment and the grant it produced.
  await queryInterface.addConstraint('credit_purchases', {
    name: 'ck_credit_purchases_paid_is_complete',
    type: 'check',
    fields: ['status'],
    where: literal(
      "status <> 'PAID' OR (stripe_payment_intent_id IS NOT NULL AND ledger_entry_id IS NOT NULL AND paid_at IS NOT NULL)",
    ),
  });

  await queryInterface.addIndex('credit_purchases', {
    name: 'ix_credit_purchases_user_created',
    fields: ['user_id', 'created_at'],
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('credit_purchases');
}
