import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

/*
  The WebSocket driver rather than the HTTP one. The HTTP driver is faster for
  single statements but has no interactive transactions, and invariant 2 in
  specs/domain.md needs one: the field update and its correction row commit
  together or not at all.

  The socket constructor is set explicitly rather than left to the global
  WebSocket that Node 22 provides. It is what Neon documents for Node, and it
  keeps the driver's behaviour the same across node versions and runtimes
  instead of depending on which global happens to be present.

  Anything importing this module must run on the Node runtime.
*/
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Run `vercel env pull .env.local` to fetch it.",
  );
}

const globalForDb = globalThis as unknown as { pool?: Pool };

// Next reloads modules on every edit in development. Without this the pool is
// rebuilt each time and Neon runs out of connections within a few minutes.
const pool = globalForDb.pool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle({ client: pool, schema });

export { schema };
