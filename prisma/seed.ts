import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Sample fuel stations in Mumbai with real coordinates
const stations = [
  {
    name: 'Shell Bandra West',
    address: 'Linking Road, Bandra West',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400050',
    lat: 19.0596,
    lng: 72.8295,
    fuelTypes: ['Petrol', 'Diesel'],
    isPartner: true,
    rating: 4.5,
  },
  {
    name: 'Indian Oil Andheri',
    address: 'SV Road, Andheri West',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400058',
    lat: 19.1136,
    lng: 72.8697,
    fuelTypes: ['Petrol', 'Diesel', 'CNG'],
    isPartner: true,
    rating: 4.3,
  },
  {
    name: 'Bharat Petroleum Powai',
    address: 'IIT Main Gate, Powai',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400076',
    lat: 19.1276,
    lng: 72.9074,
    fuelTypes: ['Petrol', 'Diesel'],
    isPartner: false,
    rating: 4.0,
  },
  {
    name: 'HP Petrol Pump Worli',
    address: 'Annie Besant Road, Worli',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400018',
    lat: 19.0176,
    lng: 72.8156,
    fuelTypes: ['Petrol', 'Diesel'],
    isPartner: true,
    rating: 4.2,
  },
  {
    name: 'Essar Petrol Pump Malad',
    address: 'Western Express Highway, Malad',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400064',
    lat: 19.1868,
    lng: 72.8479,
    fuelTypes: ['Petrol', 'Diesel', 'CNG'],
    isPartner: false,
    rating: 3.8,
  },
  {
    name: 'RIL Petrol Pump Borivali',
    address: 'SV Road, Borivali West',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400092',
    lat: 19.2403,
    lng: 72.8565,
    fuelTypes: ['Petrol', 'Diesel'],
    isPartner: true,
    rating: 4.4,
  },
  {
    name: 'HPCL Goregaon',
    address: 'Link Road, Goregaon West',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400104',
    lat: 19.1663,
    lng: 72.8526,
    fuelTypes: ['Petrol', 'Diesel', 'CNG'],
    isPartner: false,
    rating: 4.1,
  },
  {
    name: 'Shell Dadar',
    address: 'Dr. Babasaheb Ambedkar Road, Dadar',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400014',
    lat: 19.0178,
    lng: 72.8478,
    fuelTypes: ['Petrol', 'Diesel'],
    isPartner: true,
    rating: 4.6,
  },
  {
    name: 'Indian Oil Colaba',
    address: 'Shahid Bhagat Singh Road, Colaba',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400005',
    lat: 18.9220,
    lng: 72.8347,
    fuelTypes: ['Petrol', 'Diesel'],
    isPartner: false,
    rating: 4.0,
  },
  {
    name: 'BP Petrol Pump Juhu',
    address: 'Juhu Tara Road, Juhu',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400049',
    lat: 19.0990,
    lng: 72.8265,
    fuelTypes: ['Petrol', 'Diesel', 'CNG'],
    isPartner: true,
    rating: 4.7,
  },
  // EV Charging Stations
  {
    name: 'Tata Power EV Charging - Bandra',
    address: 'Bandra Kurla Complex, Bandra East',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400051',
    lat: 19.0608,
    lng: 72.8680,
    fuelTypes: ['EV'],
    isPartner: true,
    rating: 4.6,
  },
  {
    name: 'Ather Grid Charging Hub - Powai',
    address: 'Powai Plaza, Hiranandani Gardens',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400076',
    lat: 19.1197,
    lng: 72.9065,
    fuelTypes: ['EV'],
    isPartner: true,
    rating: 4.8,
  },
  {
    name: 'Reliance BP EV Station - Worli',
    address: 'Dr. Annie Besant Road, Worli',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400018',
    lat: 19.0144,
    lng: 72.8165,
    fuelTypes: ['Petrol', 'Diesel', 'EV'],
    isPartner: true,
    rating: 4.4,
  },
  {
    name: 'Charge Zone EV Hub - Andheri',
    address: 'New Link Road, Andheri West',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400053',
    lat: 19.1358,
    lng: 72.8267,
    fuelTypes: ['EV'],
    isPartner: false,
    rating: 4.2,
  },
];

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data (for development only)
  console.log('Clearing existing data...');
  await prisma.ticketReply.deleteMany({});
  await prisma.supportTicket.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.stationDocument.deleteMany({});
  // await prisma.fuelOrder.deleteMany({});  // Model removed
  await prisma.station.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.activityLog.deleteMany({});
  // await prisma.vehicle.deleteMany({});  // Model removed
  await prisma.admin.deleteMany({});
  await prisma.stationOwner.deleteMany({});
  // await prisma.user.deleteMany({});  // Model removed

  // Create demo admin
  console.log('Creating demo admin...');
  const adminPasswordHash = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.admin.create({
    data: {
      email: 'admin@fuely.in',
      name: 'Fuely Admin',
      role: 'admin',
      passwordHash: adminPasswordHash,
    },
  });

  // Create demo users
  // console.log('Creating demo users...');
  // const user1 = await prisma.user.create({
  //   data: {
  //     email: 'user1@example.com',
  //     name: 'Aarav Mehta',
  //     passwordHash: crypto.createHash('sha256').update('User@123').digest('hex'),
  //     phone: '9876543210',
  //     role: 'customer',
  //     vehicles: {
  //       create: [{ plate: 'MH12AB1234', regionCode: 'MH' }],
  //     },
  //   },
  // });
  // const user2 = await prisma.user.create({
  //   data: {
  //     email: 'user2@example.com',
  //     name: 'Diya Kapoor',
  //     passwordHash: crypto.createHash('sha256').update('User@123').digest('hex'),
  //     phone: '9876501234',
  //     role: 'customer',
  //     vehicles: {
  //       create: [{ plate: 'DL03CD5678', regionCode: 'DL' }],
  //     },
  //   },
  // });

  // Create demo station owners
  console.log('Creating demo station owners...');
  const ownerPasswordHash = await bcrypt.hash('Owner@123', 10);
  const owner1 = await prisma.stationOwner.create({
    data: {
      email: 'owner1@fuely.in',
      name: 'Rohan Sharma',
      phone: '9811111111',
      passwordHash: ownerPasswordHash,
      companyName: 'Sharma Fuels Pvt Ltd',
    },
  });
  const owner2 = await prisma.stationOwner.create({
    data: {
      email: 'owner2@fuely.in',
      name: 'Neha Singh',
      phone: '9822222222',
      passwordHash: ownerPasswordHash,
      companyName: 'Singh Energy Corp',
    },
  });

  // Insert stations
  console.log('Creating stations...');
  for (const station of stations) {
    const { fuelTypes, rating: _rating, ...stationData } = station as any;
    await prisma.station.create({
      data: {
        ...stationData,
        fuelTypes: fuelTypes.join(','),
        owner: station.isPartner ? { connect: { id: owner1.id } } : undefined,
      },
    });
  }

  console.log(`✅ Created ${stations.length} stations`);

  // Create a subscription for first station
  const firstStation = await prisma.station.findFirst({ orderBy: { createdAt: 'asc' } });
  if (firstStation) {
    console.log('Creating subscription for first station...');
    await prisma.subscription.create({
      data: {
        stationId: firstStation.id,
        planType: 'premium',
        endDate: new Date(Date.now() + 90 * 24 * 3600 * 1000),
        amount: 4999,
        status: 'active',
        features: JSON.stringify(['priority_support', 'highlighted_listing', 'analytics']),
      },
    });
  }

  // Create demo support tickets
  console.log('Creating support tickets...');
  await prisma.supportTicket.create({
    data: {
      ticketNumber: 'FBT-20251214-0001',
      subject: 'Station approval status',
      description: 'When will my station be approved? Documents uploaded last week.',
      category: 'station_issue',
      priority: 'medium',
      status: 'open',
      ownerId: owner2.id,
      stationId: firstStation?.id,
      assignedTo: admin.id,
      replies: {
        create: [
          {
            message: 'Thanks for reaching out. We are reviewing your documents.',
            isInternal: false,
            createdBy: admin.id,
            createdByType: 'admin',
          },
        ],
      },
    },
  });

  await prisma.supportTicket.create({
    data: {
      ticketNumber: 'FBT-20251214-0002',
      subject: 'Billing query about subscription',
      description: 'Please explain the premium plan benefits in detail.',
      category: 'billing',
      priority: 'low',
      status: 'in_progress',
      ownerId: owner1.id,
      assignedTo: admin.id,
    },
  });

  // Create sample orders
  // console.log('Creating demo orders...');
  // if (firstStation) {
  //   await prisma.fuelOrder.create({
  //     data: {
  //       userId: user1.id,
  //       stationId: firstStation.id,
  //       fuelType: 'CNG',
  //       quantity: 10,
  //       address1: 'Bandra West',
  //       city: 'Mumbai',
  //       state: 'Maharashtra',
  //       status: 'confirmed',
  //     },
  //   });
  // }

  // Get count
  const count = await prisma.station.count();
  console.log(`📊 Total stations in database: ${count}`);
  const ownersCount = await prisma.stationOwner.count();
  // const usersCount = await prisma.user.count();  // Model removed
  const ticketsCount = await prisma.supportTicket.count();
  console.log(`👔 Owners: ${ownersCount}, 🎫 Tickets: ${ticketsCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
