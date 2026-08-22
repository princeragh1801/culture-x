import { createApp } from './app';
import { env } from './config/env';
import { databaseName } from './config/db-env';
import { sequelize } from './db/models';

async function start(): Promise<void> {
  // Fail fast and loudly if the database is unreachable, rather than serving
  // requests that will each fail on their own.
  await sequelize.authenticate();
  console.log(`Connected to MySQL database "${databaseName}".`);

  createApp().listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });
}

start().catch((error: unknown) => {
  console.error('Failed to start the server:', error);
  process.exitCode = 1;
});
