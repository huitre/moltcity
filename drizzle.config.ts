import type { Config } from 'drizzle-kit';

export default {
  schema: './dist/db/schema/*.js',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH || './moltcity.db',
  },
} satisfies Config;
