import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * Per-currency balance for a wallet.
 *
 * This table is a cached projection: ledger_entries is the source of truth, and
 * the acceptance criterion SUM(ledger.amount) = balance is checked directly
 * against these two tables.
 *
 * balance is BIGINT UNSIGNED on purpose. Combined with STRICT_ALL_TABLES (set in
 * docker-compose.yml) an UPDATE that would take the balance below zero raises
 * ER_DATA_OUT_OF_RANGE and aborts the transaction, rather than writing a negative
 * row. That is the last of three independent guards against over-spending; the
 * other two — a SELECT ... FOR UPDATE row lock and a conditional
 * "WHERE balance >= :amount" update — live in the funding service.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'wallet_balances',
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
        onDelete: 'CASCADE',
      },
      currency_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'currencies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      balance: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: 'Whole credits. Never negative — enforced by UNSIGNED + strict mode.',
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

  // Also the lookup index for "lock this user's balance in this currency".
  await queryInterface.addConstraint('wallet_balances', {
    name: 'uq_wallet_balances_wallet_currency',
    type: 'unique',
    fields: ['wallet_id', 'currency_id'],
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('wallet_balances');
}
