import { PrismaClient } from '@prisma/client';
const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: datasourceUrl,
    },
  },
});

async function main() {
  try {
    if (!datasourceUrl) {
      throw new Error('Missing DIRECT_URL or DATABASE_URL');
    }

    await prisma.$connect();
    console.log('Successfully connected to the database!');
    
    // Perform a quick test query
    const adminCount = await prisma.admin.count();
    console.log(`Connection test passed. Number of admins: ${adminCount}`);
  } catch (error) {
    console.error('Connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Unexpected failure while running the database test:', error);
  process.exitCode = 1;
});
