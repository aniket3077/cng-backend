import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createOwner() {
  try {
    const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
    const password = process.env.OWNER_PASSWORD;

    if (!email || !password) {
      console.error('Error: Set OWNER_EMAIL and OWNER_PASSWORD before running this script.');
      process.exit(1);
    }

    if (password.length < 12) {
      console.error('Error: OWNER_PASSWORD must be at least 12 characters.');
      process.exit(1);
    }

    const existingOwner = await prisma.stationOwner.findUnique({
      where: { email },
    });

    if (existingOwner) {
      console.log('Owner already exists with this email.');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const owner = await prisma.stationOwner.create({
      data: {
        email,
        passwordHash,
        name: process.env.OWNER_NAME || 'Station Owner',
        phone: process.env.OWNER_PHONE || '',
        companyName: process.env.OWNER_COMPANY_NAME || null,
        gstNumber: process.env.OWNER_GST_NUMBER || null,
        panNumber: process.env.OWNER_PAN_NUMBER || null,
        address: process.env.OWNER_ADDRESS || null,
        city: process.env.OWNER_CITY || null,
        state: process.env.OWNER_STATE || null,
        postalCode: process.env.OWNER_POSTAL_CODE || null,
        status: 'active',
        emailVerified: true,
        phoneVerified: Boolean(process.env.OWNER_PHONE),
        kycStatus: 'approved',
        profileComplete: true,
        onboardingStep: 5,
      },
    });

    console.log('Station owner created successfully.');
    console.log(`Email: ${email}`);
    console.log(`Owner ID: ${owner.id}`);
    console.log('Password was read from env var and is not logged for security.');
  } catch (error) {
    console.error('Error creating owner:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createOwner();
