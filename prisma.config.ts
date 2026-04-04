import "dotenv/config";
import { defineConfig } from "prisma/config";
import { listLocalDatabases } from "@prisma/adapter-d1";

function getLocalDbUrl(): string {
  try {
    const dbs = listLocalDatabases();
    if (dbs.length > 0) return `file:${dbs[dbs.length - 1]}`;
  } catch {
    // .wrangler state doesn't exist yet (CI or first run)
  }
  return "file:./prisma/dev.db";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getLocalDbUrl(),
  },
});
