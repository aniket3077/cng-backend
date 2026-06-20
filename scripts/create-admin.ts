import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Create or reset the admin account.
 *
 * SECURITY: Credentials are read from environment variables.
 * Never hard-code passwords in source.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@cngbharat.com ADMIN_PASSWORD='YourStrongPass1!' npx tsx scripts/create-admin.ts
 */

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      '❌ Error: Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables before running this script.\n' +
      '   Example: ADMIN_EMAIL=admin@cngbharat.com ADMIN_PASSWORD=\'YourStrongPass1!\' npx tsx scripts/create-admin.ts',
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('❌ Error: ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  try {
    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    const passwordHash = await bcrypt.hash(password, 12);

    if (existingAdmin) {
      await prisma.admin.update({
        where: { email },
        data: { passwordHash },
      });
      console.log('✅ Admin password updated successfully!');
    } else {
      await prisma.admin.create({
        data: {
          email,
          passwordHash,
          name: 'Admin User',
          role: 'admin',
        },
      });
      console.log('✅ Admin user created successfully!');
    }

    console.log('Email:', email);
    console.log('⚠️  Password was read from env var and is not logged for security.');
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
