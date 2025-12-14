export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  createdAt: Date;
}

export interface Station {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  fuelTypes: string[];
  isPartner: boolean;
  rating: number;
}

export interface FuelOrder {
  id: string;
  userId: string;
  stationId: string | null;
  fuelType: string;
  quantity: number;
  address1: string;
  city: string;
  state: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  scheduledAt: Date | null;
  status: string;
  createdAt: Date;
  station?: Station;
}

export interface StationSuggestion {
  station: Station;
  distance: number;
  score: number;
  reason: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
