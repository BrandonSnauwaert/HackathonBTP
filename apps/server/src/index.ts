import "dotenv/config";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { openDatabase } from "./db/database.js";

const db = openDatabase(config.DATABASE_PATH);
const app = await buildApp({ config, db });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Doc de l'API : http://localhost:${config.PORT}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
