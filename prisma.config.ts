import "dotenv/config";
import { defineConfig } from "prisma/config";
import { listLocalDatabases } from "@prisma/adapter-d1";

function getLocalDbUrl(): string {
  const dbs = listLocalDatabases();
  if (dbs.length > 0) return `file:${dbs[dbs.length - 1]}`;
  // Fallback to legacy dev.db during first run before wrangler has started
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
