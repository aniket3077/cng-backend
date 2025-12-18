import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSubscriber() {
  try {
    const owner = await prisma.stationOwner.findUnique({
      where: { email: 'bankaraniketk@gmail.com' },
      include: {
        stations: true,
      },
    });
    
    console.log('Subscriber:', JSON.stringify(owner, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSubscriber();
