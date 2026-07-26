import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next loads .env.local itself. The drizzle-kit CLI does not, so it is loaded here.
loadEnv({ path: ".env.local" });

// Migrations run one at a time over a direct connection. The pooled URL is for
// the app, which opens many short lived connections instead.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Run `vercel env pull .env.local` to fetch it.",
  );
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
