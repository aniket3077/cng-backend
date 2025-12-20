import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addMissingColumns() {
  try {
    // Add subscriptionType and subscriptionEndsAt columns
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "StationOwner" 
      ADD COLUMN IF NOT EXISTS "subscriptionType" TEXT,
      ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMP(3);
    `);

    console.log('✅ Successfully added missing columns to StationOwner table');
  } catch (error) {
    console.error('Error adding columns:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addMissingColumns();
