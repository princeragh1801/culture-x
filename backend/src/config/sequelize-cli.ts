import type { Options } from 'sequelize';
import { dbEnv } from './db-env';

/**
 * Config consumed by sequelize-cli (see ../../.sequelizerc).
 *
 * The runtime Sequelize instance in src/db/sequelize.ts is built from the same
 * values, so migrations and the API can never drift onto different databases.
 */
const shared: Options = {
  dialect: 'mysql',
  host: dbEnv.DB_HOST,
  port: dbEnv.DB_PORT,
  username: dbEnv.DB_USER,
  password: dbEnv.DB_PASSWORD,
  logging: dbEnv.DB_LOGGING === 'true' ? console.log : false,
  dialectOptions: {
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
  },
  define: {
    underscored: true,
    freezeTableName: true,
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
  },
};

const config = {
  development: { ...shared, database: dbEnv.DB_NAME },
  test: { ...shared, database: dbEnv.DB_NAME_TEST },
  production: { ...shared, database: dbEnv.DB_NAME },
};

// Plain CommonJS export: sequelize-cli loads this file with a dynamic import()
// and reads the module's default binding, which for a CJS module is module.exports.
module.exports = config;
