export default () => ({
  database: {
    url: process.env.DATABASE_URL,
  },
  n4: {
    host: process.env.N4_DB_HOST,
    port: parseInt(process.env.N4_DB_PORT || '1433', 10),
    user: process.env.N4_DB_USER,
    password: process.env.N4_DB_PASSWORD,
    database: process.env.N4_DB_NAME,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiration: parseInt(process.env.JWT_EXPIRATION || '3600', 10),
    refreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    refreshExpiration: parseInt(process.env.JWT_REFRESH_EXPIRATION || '604800', 10),
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@navis.com',
    password: process.env.ADMIN_PASSWORD || 'admin123456',
  },
  tprReports: {
    currentMonthTtlSeconds: parseInt(
      process.env.TPR_CURRENT_MONTH_TTL_SECONDS || '600',
      10,
    ),
    closedMonthTtlSeconds: parseInt(
      process.env.TPR_CLOSED_MONTH_TTL_SECONDS || '604800',
      10,
    ),
    regenerationLockTtlSeconds: parseInt(
      process.env.TPR_REGENERATION_LOCK_TTL_SECONDS || '120',
      10,
    ),
    detailMaxLimit: parseInt(process.env.TPR_DETAIL_MAX_LIMIT || '200', 10),
    exportBatchSize: parseInt(process.env.TPR_EXPORT_BATCH_SIZE || '200', 10),
    timezone: process.env.TPR_TIMEZONE || 'America/Lima',
    truckGateGkey: parseInt(process.env.TPR_TRUCK_GATE_GKEY || '53', 10),
  },
});
