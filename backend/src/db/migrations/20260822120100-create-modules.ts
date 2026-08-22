import { DataTypes, literal, type QueryInterface } from 'sequelize';

/**
 * Platform modules (campaigns, reports, discovery).
 *
 * Modules are data, not an enum in code, so a fourth module can be added by
 * inserting a row rather than by editing business logic.
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'modules',
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
        comment: 'Stable machine identifier, e.g. "campaigns"',
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
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
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('modules');
}
