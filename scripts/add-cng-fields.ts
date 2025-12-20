import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addCngFields() {
  try {
    // Add CNG fields to Station table
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Station" 
      ADD COLUMN IF NOT EXISTS "cngAvailable" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "cngQuantityKg" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cngUpdatedAt" TIMESTAMP(3);
    `);

    console.log('✅ Successfully added CNG fields to Station table');
  } catch (error) {
    console.error('Error adding CNG fields:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addCngFields();
