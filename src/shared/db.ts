import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Only repositories and shared services may import
 * this module (SDS Doc 02 Ch3: only the persistence layer touches the DB).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/** Client type accepted by services that can join an outer transaction. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
