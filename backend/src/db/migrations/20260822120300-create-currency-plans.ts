import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * Pre-priced bundles, e.g. 1,000 Campaign Credits for Rs 2,700.
 *
 * A plan carries its own price rather than deriving one from
 * currencies.price_per_credit_paise, because bundles are deliberately cheaper
 * than the per-credit rate.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'currency_plans',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      currency_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'currencies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: 'Unique within its currency, e.g. "CAMPAIGN_1000"',
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      credits: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      price_paise: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

  await queryInterface.addConstraint('currency_plans', {
    name: 'uq_currency_plans_currency_code',
    type: 'unique',
    fields: ['currency_id', 'code'],
  });

  await queryInterface.addConstraint('currency_plans', {
    name: 'ck_currency_plans_amounts_positive',
    type: 'check',
    fields: ['credits', 'price_paise'],
    where: literal('credits > 0 AND price_paise > 0'),
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('currency_plans');
}
