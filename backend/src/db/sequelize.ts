import { Sequelize } from 'sequelize';
import { databaseName, dbEnv } from '../config/db-env';

/**
 * The single Sequelize instance used by the API and by the test suite.
 *
 * Schema is owned exclusively by the migrations in ./migrations — sequelize.sync()
 * is never called anywhere in this codebase.
 */
export const sequelize = new Sequelize({
  dialect: 'mysql',
  host: dbEnv.DB_HOST,
  port: dbEnv.DB_PORT,
  username: dbEnv.DB_USER,
  password: dbEnv.DB_PASSWORD,
  database: databaseName,
  logging: dbEnv.DB_LOGGING === 'true' ? console.log : false,
  dialectOptions: {
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
  },
  define: {
    underscored: true,
    freezeTableName: true,
  },
  pool: {
    max: 20,
    min: 0,
    idle: 10_000,
    acquire: 30_000,
  },
  retry: {
    // InnoDB can pick either transaction as the deadlock victim when two
    // campaign-funding requests race; retrying the loser is safe because the
    // whole spend is one atomic transaction.
    match: [/Deadlock/i, /ER_LOCK_DEADLOCK/],
    max: 3,
  },
});
