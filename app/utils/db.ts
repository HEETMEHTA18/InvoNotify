import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Warm up the connection on first import
// This prevents the first real query from being slow
prisma.$connect().catch((e) => {
  console.warn('Prisma connection warmup failed (will retry on first query):', e.message)
})
