import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAdminPassword() {
  const email = 'admin@cngbharat.com';
  const newPassword = 'Admin@123';
  
  console.log('\n🔄 Resetting admin password...\n');
  
  // Hash the password
  const passwordHash = await bcrypt.hash(newPassword, 10);
  
  // Update admin
  const admin = await prisma.admin.update({
    where: { email },
    data: { passwordHash },
  });
  
  console.log('✅ Admin password reset successfully!');
  console.log(`Email: ${admin.email}`);
  console.log(`Password: ${newPassword}`);
  console.log('');
  
  await prisma.$disconnect();
}

resetAdminPassword().catch(console.error);
