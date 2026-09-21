if (process.env.VERCEL) {
  if (!process.env.APP_ENV || !process.env.DATABASE_URL)
    throw new Error("Vercel deployment is missing APP_ENV or DATABASE_URL");
  process.env.MIGRATE_ENV = process.env.APP_ENV;
  await import("./migrate.ts");
} else {
  console.log("Skipping hosted database migration outside Vercel");
}
