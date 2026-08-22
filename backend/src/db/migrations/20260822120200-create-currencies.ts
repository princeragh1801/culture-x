import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * Credit currencies, one per module.
 *
 * Two constraints here carry design weight:
 *
 *   uq_currencies_module_id  — a module has exactly one currency, so "which
 *                              currency may this module spend?" has a single answer.
 *   uq_currencies_id_module  — looks redundant next to the primary key, but it is
 *                              the parent index for the composite foreign key on
 *                              campaigns(currency_id, module_id). That composite FK
 *                              is what makes cross-module spending impossible at the
 *                              database level rather than only in application code.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'currencies',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'Stable machine identifier, e.g. "CAMPAIGN_CREDITS"',
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      module_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'modules', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      price_per_credit_paise: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'Integer paise. Rs 3/credit is stored as 300.',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

  await queryInterface.addConstraint('currencies', {
    name: 'uq_currencies_module_id',
    type: 'unique',
    fields: ['module_id'],
  });

  await queryInterface.addConstraint('currencies', {
    name: 'uq_currencies_id_module',
    type: 'unique',
    fields: ['id', 'module_id'],
  });

  await queryInterface.addConstraint('currencies', {
    name: 'ck_currencies_price_positive',
    type: 'check',
    fields: ['price_per_credit_paise'],
    where: literal('price_per_credit_paise > 0'),
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('currencies');
}
