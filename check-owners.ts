import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function checkCredentials() {
  const owners = await prisma.stationOwner.findMany();
  console.log('\n📋 Station Owners in Database:\n');
  owners.forEach((owner, index) => {
    console.log(`${index + 1}. Email: ${owner.email}`);
    console.log(`   Name: ${owner.name}`);
    console.log(`   Status: ${owner.status}`);
    console.log(`   Company: ${owner.companyName}`);
    console.log('');
  });

  const admins = await prisma.admin.findMany();
  console.log('\n🔐 Admin Accounts in Database:\n');
  for (const admin of admins) {
    console.log(`Email: ${admin.email}`);
    console.log(`Name: ${admin.name}`);
    console.log(`Role: ${admin.role}`);
    
    // Test password
    const testPassword = 'Admin@123';
    const isValid = await bcrypt.compare(testPassword, admin.passwordHash);
    console.log(`Password "Admin@123" works: ${isValid ? '✅ YES' : '❌ NO'}`);
    console.log('');
  }

  await prisma.$disconnect();
}

checkCredentials();
