import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function approveStation() {
  try {
    const station = await prisma.station.update({
      where: { id: 'cmja4kjpw00012cdztnn0x0rg' },
      data: {
        approvalStatus: 'approved',
        isVerified: true,
      },
    });
    
    console.log('✅ Station approved:', JSON.stringify(station, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

approveStation();
