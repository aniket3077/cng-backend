import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'bankaraniketk@gmail.com';
  const password = '123456';
  const name = 'Aniket Bankar';

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('✅ User already exists:', email);
    return;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: 'customer',
    },
  });

  console.log('✅ Customer created successfully!');
  console.log('📧 Email:', email);
  console.log('🔑 Password:', password);
  console.log('👤 Name:', name);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
