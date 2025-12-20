import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dropUnusedTables() {
  try {
    console.log('🗑️  Dropping unused tables from database...\n');

    const tablesToDrop = ['User', 'Vehicle', 'FuelOrder', 'Lead', 'Analytics'];

    for (const table of tablesToDrop) {
      console.log(`  Dropping ${table}...`);
      try {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
        console.log(`  ✅ ${table} dropped`);
      } catch (error: any) {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    }

    console.log('\n✅ Unused tables removed successfully!');
    console.log('\n📊 Remaining tables:');
    console.log('   - Admin');
    console.log('   - StationOwner');
    console.log('   - Station');
    console.log('   - Subscription');
    console.log('   - StationDocument');
    console.log('   - SupportTicket');
    console.log('   - TicketReply');
    console.log('   - Notification');
    console.log('   - ActivityLog\n');

  } catch (error) {
    console.error('❌ Error dropping tables:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

dropUnusedTables();
