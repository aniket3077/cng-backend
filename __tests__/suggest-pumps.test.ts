import { POST } from '../app/api/suggest-pumps/route';
import { NextRequest } from 'next/server';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    station: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';

describe('POST /api/suggest-pumps', () => {
  const mockStations = [
    {
      id: '1',
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
      id: '2',
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
      id: '3',
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
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return suggestions sorted by score', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue(mockStations);

    const request = new NextRequest('http://localhost:3000/api/suggest-pumps', {
      method: 'POST',
      body: JSON.stringify({
        lat: 19.0760, // Near Bandra
        lng: 72.8777,
        radiusKm: 20,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.suggestions).toBeDefined();
    expect(Array.isArray(data.suggestions)).toBe(true);

    // Verify sorting (higher scores first)
    for (let i = 0; i < data.suggestions.length - 1; i++) {
      expect(data.suggestions[i].score).toBeGreaterThanOrEqual(
        data.suggestions[i + 1].score
      );
    }
  });

  it('should detect region from Indian plate', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue(mockStations);

    const request = new NextRequest('http://localhost:3000/api/suggest-pumps', {
      method: 'POST',
      body: JSON.stringify({
        plate: 'MH12AB1234', // Maharashtra plate
        lat: 19.0760,
        lng: 72.8777,
        radiusKm: 20,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.regionDetected).toBe('Maharashtra');
  });

  it('should filter by fuel type when specified', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue(mockStations);

    const request = new NextRequest('http://localhost:3000/api/suggest-pumps', {
      method: 'POST',
      body: JSON.stringify({
        lat: 19.0760,
        lng: 72.8777,
        fuelType: 'CNG',
        radiusKm: 20,
      }),
    });

    const response = await POST(request);

    // Verify prisma was called with fuelTypes filter
    expect(prisma.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fuelTypes: { has: 'CNG' },
        }),
      })
    );
  });

  it('should return error for invalid input', async () => {
    const request = new NextRequest('http://localhost:3000/api/suggest-pumps', {
      method: 'POST',
      body: JSON.stringify({
        // Missing required lat/lng
        radiusKm: 20,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should prioritize partner stations', async () => {
    const mixedStations = [
      { ...mockStations[0], isPartner: true, rating: 4.0 },
      { ...mockStations[1], isPartner: false, rating: 4.8 },
    ];

    (prisma.station.findMany as jest.Mock).mockResolvedValue(mixedStations);

    const request = new NextRequest('http://localhost:3000/api/suggest-pumps', {
      method: 'POST',
      body: JSON.stringify({
        lat: 19.0596, // Exact location of first station
        lng: 72.8295,
        radiusKm: 20,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    // Partner station should score higher despite lower rating
    const partnerStation = data.suggestions.find((s: any) => s.station.isPartner);
    const nonPartnerStation = data.suggestions.find((s: any) => !s.station.isPartner);

    expect(partnerStation).toBeDefined();
    expect(nonPartnerStation).toBeDefined();
  });

  it('should include distance in suggestions', async () => {
    (prisma.station.findMany as jest.Mock).mockResolvedValue([mockStations[0]]);

    const request = new NextRequest('http://localhost:3000/api/suggest-pumps', {
      method: 'POST',
      body: JSON.stringify({
        lat: 19.0760,
        lng: 72.8777,
        radiusKm: 20,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.suggestions[0]).toHaveProperty('distance');
    expect(typeof data.suggestions[0].distance).toBe('number');
    expect(data.suggestions[0].distance).toBeGreaterThan(0);
  });
});
