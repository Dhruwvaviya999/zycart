import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query"], // small options object to avoid the "non-empty options" error
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
