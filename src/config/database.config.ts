// src/config/database.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined in .env file');
  }

  const isSupabase = databaseUrl.includes('supabase');

  return {
    type: 'postgres' as const,
    url: databaseUrl,
    synchronize: process.env.NODE_ENV !== 'production',
    logging: false,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,

    // Connection retry settings
    retryAttempts: 10,
    retryDelay: 5000,
    connectTimeoutMS: 30000,

    // Connection pool settings for Supabase
    extra: {
      // Pool configuration
      max: 10, // Maximum connections in pool
      min: 2,  // Minimum connections in pool

      // Timeouts
      connectionTimeoutMillis: 30000, // 30 seconds to establish connection
      idleTimeoutMillis: 60000, // Close idle connections after 60 seconds

      // Keep connections alive
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,

      // Statement timeout (prevent long-running queries)
      statement_timeout: 60000, // 60 seconds

      // Supabase specific - handle connection drops gracefully
      allowExitOnIdle: false,
    },
  };
});
