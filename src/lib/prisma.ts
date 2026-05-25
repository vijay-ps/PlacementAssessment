import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma";

// Global declaration for hot-reloading in Next.js development mode
const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

function getDirectConnectionString(): string {
  const envUrl = process.env.DATABASE_URL;
  if (!envUrl) {
    throw new Error("DATABASE_URL is not defined in environment");
  }

  if (envUrl.startsWith("prisma+postgres://")) {
    try {
      const url = new URL(envUrl);
      const apiKey = url.searchParams.get("api_key");
      if (apiKey) {
        // Base64 decode the apiKey
        const decoded = Buffer.from(apiKey, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded);
        if (parsed.databaseUrl) {
          return parsed.databaseUrl;
        }
      }
    } catch (e) {
      console.error("Failed to parse prisma+postgres DATABASE_URL:", e);
    }
  }

  return envUrl;
}

const connectionString = getDirectConnectionString();

const pool = new Pool({
  connectionString,
  max: 15, // Concurrency connection limit
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // Increased to 15s to tolerate remote AWS/Neon cold starts and network latency
});

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
export default prisma;
