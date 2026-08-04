import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveConnectionString } from "./connection-string";

declare global {
  var __acaduSql: ReturnType<typeof postgres> | undefined;
}

function connectionString(): string {
  return resolveConnectionString(process.env);
}

/**
 * One pool per process. Lambda reuses the container between invocations, so the
 * client is cached on globalThis to avoid a connection storm; RDS Proxy handles
 * the rest in production.
 */
const client =
  globalThis.__acaduSql ??
  postgres(connectionString(), {
    max: process.env.NODE_ENV === "production" ? 5 : 2,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalThis.__acaduSql = client;

export const db = drizzle(client, { schema });
export { schema };
export type Db = typeof db;
