import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdmin() {
  const email = 'admin@cngbharat.com';
  const password = 'Admin@123'; // Change this in production!

  try {
    // Check if admin exists
    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      console.log('Admin user already exists - updating password...');
      // Update password if admin exists
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.admin.update({
        where: { email },
        data: { passwordHash },
      });
      console.log('✅ Admin password updated successfully!');
      console.log('Email:', email);
      console.log('Password:', password);
      return;
    }

    // Create admin
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: {
        email,
        passwordHash,
        name: 'Admin User',
        role: 'admin',
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\n⚠️  Please change the password after first login!');
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
