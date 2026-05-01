import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createOwner() {
  try {
    const email = 'owner@cngbharat.com';
    const password = 'Owner@123';

    // Check if owner already exists
    const existingOwner = await prisma.stationOwner.findUnique({
      where: { email },
    });

    if (existingOwner) {
      console.log('❌ Owner already exists with this email');
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create owner
    const owner = await prisma.stationOwner.create({
      data: {
        email,
        passwordHash,
        name: 'Test Station Owner',
        phone: '+919876543210',
        companyName: 'Test CNG Station',
        gstNumber: '29ABCDE1234F1Z5',
        panNumber: 'ABCDE1234F',
        address: '123 Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        status: 'active',
        emailVerified: true,
        phoneVerified: true,
        kycStatus: 'approved',
        profileComplete: true,
        onboardingStep: 5,
      },
    });

    console.log('✅ Station owner created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Owner ID: ${owner.id}`);
    console.log('\n⚠️  Please change the password after first login!');
  } catch (error) {
    console.error('❌ Error creating owner:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createOwner();
