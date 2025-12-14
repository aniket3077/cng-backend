import { PrismaClient } from '@prisma/client';

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
  console.log('Clearing existing stations...');
  await prisma.station.deleteMany({});

  // Insert stations
  console.log('Creating stations...');
  for (const station of stations) {
    await prisma.station.create({
      data: {
        ...station,
        fuelTypes: station.fuelTypes.join(','), // Convert array to comma-separated string
      },
    });
  }

  console.log(`✅ Created ${stations.length} stations`);
  
  // Get count
  const count = await prisma.station.count();
  console.log(`📊 Total stations in database: ${count}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
