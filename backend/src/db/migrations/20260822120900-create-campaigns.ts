import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * Campaigns, and the place the currency-to-module binding is enforced.
 *
 * A campaign belongs to the campaigns module, and module_id is stored on the row
 * rather than assumed in code. The composite foreign key
 *
 *   (currency_id, module_id) REFERENCES currencies (id, module_id)
 *
 * therefore means a campaign can only reference a currency whose own module_id
 * matches — that is, only Campaign Credits. Funding one with Report or Discovery
 * Credits is rejected by the service with a 422 long before this fires, but the
 * constraint means no code path, present or future, can write a cross-module
 * spend even by mistake.
 *
 * MySQL evaluates a composite foreign key with MATCH SIMPLE semantics: when any
 * referencing column is NULL the check is skipped. currency_id is NULL while the
 * campaign is a DRAFT, so unfunded campaigns are unaffected.
 *
 * ck_campaigns_funding_consistent then makes a half-funded row impossible: either
 * everything about the funding is set, or none of it is. Together with the unique
 * ledger_entry_id and the conditional "WHERE status = 'DRAFT'" update in the
 * funding service, a campaign can be funded at most once.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'campaigns',
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
      module_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'modules', key: 'id' },
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT',
        comment: 'Always the campaigns module; half of the composite FK below.',
      },
      name: {
        type: DataTypes.STRING(191),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('DRAFT', 'FUNDED'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      currency_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        comment: 'Set only when funded. Constrained to this module by fk_campaigns_currency_module.',
      },
      funded_credits: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      funded_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      ledger_entry_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'ledger_entries', key: 'id' },
        onUpdate: 'RESTRICT',
        onDelete: 'RESTRICT',
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

  // Sequelize's MySQL query generator emits composite REFERENCES correctly, but
  // its published types only describe the single-column form, hence the cast.
  const compositeForeignKey = {
    name: 'fk_campaigns_currency_module',
    type: 'foreign key',
    fields: ['currency_id', 'module_id'],
    references: { table: 'currencies', fields: ['id', 'module_id'] },
    onUpdate: 'RESTRICT',
    onDelete: 'RESTRICT',
  } as unknown as Parameters<QueryInterface['addConstraint']>[1];

  await queryInterface.addConstraint('campaigns', compositeForeignKey);

  // One campaign, one spend.
  await queryInterface.addConstraint('campaigns', {
    name: 'uq_campaigns_ledger_entry_id',
    type: 'unique',
    fields: ['ledger_entry_id'],
  });

  await queryInterface.addConstraint('campaigns', {
    name: 'ck_campaigns_funding_consistent',
    type: 'check',
    fields: ['status'],
    where: literal(
      "(status = 'DRAFT' AND currency_id IS NULL AND funded_credits IS NULL AND funded_at IS NULL AND ledger_entry_id IS NULL)" +
        " OR (status = 'FUNDED' AND currency_id IS NOT NULL AND funded_credits > 0 AND funded_at IS NOT NULL AND ledger_entry_id IS NOT NULL)",
    ),
  });

  await queryInterface.addIndex('campaigns', {
    name: 'ix_campaigns_user_created',
    fields: ['user_id', 'created_at'],
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('campaigns');
}
