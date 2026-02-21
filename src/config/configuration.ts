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
});
