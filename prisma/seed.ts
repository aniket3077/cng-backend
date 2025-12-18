import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.ticketReply.deleteMany({});
  await prisma.supportTicket.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.stationDocument.deleteMany({});
  await prisma.fuelOrder.deleteMany({});
  await prisma.station.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.admin.deleteMany({});
  await prisma.stationOwner.deleteMany({});
  await prisma.user.deleteMany({});

  // Create admin
  console.log('Creating admin...');
  await prisma.admin.create({
    data: {
      email: 'admin@cngbharat.com',
      name: 'CNG Bharat Admin',
      role: 'admin',
      passwordHash: await bcrypt.hash('Admin@123', 10),
    },
  });

  console.log('\n✅ Database seeded successfully!');
  console.log('\n📝 Login Credentials:');
  console.log('Admin: admin@cngbharat.com / Admin@123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
