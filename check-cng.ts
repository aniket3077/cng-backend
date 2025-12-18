import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCNG() {
  try {
    const stations = await prisma.station.findMany({
      where: { ownerId: 'cmj9vdkv80000eosi36p0el80' },
      select: {
        id: true,
        name: true,
        cngAvailable: true,
        cngUpdatedAt: true,
        approvalStatus: true,
        isVerified: true,
      },
    });

    console.log('Station CNG Data:');
    console.log(JSON.stringify(stations, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCNG();
