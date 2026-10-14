import { defineConfig } from "drizzle-kit";

import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  // Path to your schema file (or directory containing schema files)
  schema: "./src/lib/db/schema.ts",

  // Directory where migration files will be generated
  out: "./drizzle",

  // Your database dialect: 'postgresql' | 'mysql' | 'sqlite' | 'turso' | 'singlestore'
  dialect: "postgresql",

  // Database credentials used by drizzle-kit commands (e.g., push, studio)
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
