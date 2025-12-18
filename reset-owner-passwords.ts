import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetOwnerPasswords() {
  const password = 'Owner@123';
  
  console.log('\n🔄 Resetting owner passwords...\n');
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Update all owners
  const owners = await prisma.stationOwner.findMany();
  
  for (const owner of owners) {
    await prisma.stationOwner.update({
      where: { id: owner.id },
      data: { passwordHash },
    });
    
    // Test if password works
    const isValid = await bcrypt.compare(password, passwordHash);
    console.log(`✅ ${owner.email} - Password: ${password} - Works: ${isValid ? 'YES' : 'NO'}`);
  }
  
  console.log('\n✅ All owner passwords reset successfully!\n');
  
  await prisma.$disconnect();
}

resetOwnerPasswords().catch(console.error);
