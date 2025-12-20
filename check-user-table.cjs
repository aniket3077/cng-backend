const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Check tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('Tables in database:');
    console.log(tables.map(t => t.table_name));
    
    // Check User columns
    const userColumns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'User'
    `;
    console.log('\nUser table columns:');
    console.log(userColumns);
    
    // Test creating a user
    console.log('\nTesting user creation...');
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'test123',
        name: 'Test User',
        phone: '1234567890'
      }
    });
    console.log('User created:', user);
    
    // Delete test user
    await prisma.user.delete({ where: { id: user.id } });
    console.log('Test user deleted.');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
