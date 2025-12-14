'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AddStation() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    lat: 19.0760, // Default: Mumbai
    lng: 72.8777,
    fuelTypes: [] as string[],
    phone: '',
    openingHours: '',
    amenities: '',
    subscriptionType: 'free' as 'free' | 'basic' | 'premium',
    isPartner: false,
  });

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      router.push('/admin/login');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.fuelTypes.length === 0) {
      setError('Please select at least one fuel type');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/stations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          fuelTypes: formData.fuelTypes.join(','),
        }),
      });

      const data = await response.json();
      if (data.success) {
        router.push('/admin/stations');
      } else {
        setError(data.error || 'Failed to create station');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleFuelType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      fuelTypes: prev.fuelTypes.includes(type)
        ? prev.fuelTypes.filter(t => t !== type)
        : [...prev.fuelTypes, type]
    }));
  };

  const searchLocation = async (query: string) => {
    if (!query || query.length < 3) return;

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const addressComponents = data.results[0].address_components;
        
        setFormData(prev => ({
          ...prev,
          lat: location.lat,
          lng: location.lng,
          address: data.results[0].formatted_address,
          city: addressComponents.find((c: any) => c.types.includes('locality'))?.long_name || prev.city,
          state: addressComponents.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name || prev.state,
          postalCode: addressComponents.find((c: any) => c.types.includes('postal_code'))?.long_name || prev.postalCode,
        }));
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/stations" className="text-gray-600 hover:text-gray-900">
              ← Back
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Add New Station</h1>
              <p className="text-sm text-gray-600 mt-1">Enter station details and location</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Station Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="HP Petrol Pump"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address * (Search to auto-fill location)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="123 Main Street, Mumbai"
                  />
                  <button
                    type="button"
                    onClick={() => searchLocation(formData.address)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({...formData, city: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Mumbai"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                <input
                  type="text"
                  required
                  value={formData.state}
                  onChange={(e) => setFormData({...formData, state: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Maharashtra"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Postal Code</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({...formData, postalCode: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="400001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
          </div>

          {/* Location Coordinates */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Location Coordinates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Latitude *</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.lat}
                  onChange={(e) => setFormData({...formData, lat: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Longitude *</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.lng}
                  onChange={(e) => setFormData({...formData, lng: parseFloat(e.target.value)})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <div className="bg-gray-100 rounded-lg p-4 h-64 flex items-center justify-center text-gray-500">
                  Map Preview: {formData.lat.toFixed(4)}, {formData.lng.toFixed(4)}
                  <br />
                  <small className="text-xs mt-2">
                    Open{' '}
                    <a 
                      href={`https://www.google.com/maps?q=${formData.lat},${formData.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      Google Maps
                    </a>
                  </small>
                </div>
              </div>
            </div>
          </div>

          {/* Fuel Types */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Fuel Types *</h2>
            <div className="flex flex-wrap gap-3">
              {['Petrol', 'Diesel', 'CNG', 'LPG', 'EV'].map(fuel => (
                <button
                  key={fuel}
                  type="button"
                  onClick={() => toggleFuelType(fuel)}
                  className={`px-4 py-2 rounded-lg border-2 transition ${
                    formData.fuelTypes.includes(fuel)
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {fuel}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Details */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Opening Hours</label>
                <input
                  type="text"
                  value={formData.openingHours}
                  onChange={(e) => setFormData({...formData, openingHours: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="24/7 or 6AM-10PM"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
                <input
                  type="text"
                  value={formData.amenities}
                  onChange={(e) => setFormData({...formData, amenities: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Restroom, ATM, Air Pump (comma-separated)"
                />
              </div>
            </div>
          </div>

          {/* Subscription Plan */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Plan</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { value: 'free', label: 'Free', desc: 'Basic listing', price: 'Free' },
                { value: 'basic', label: 'Basic', desc: 'Enhanced visibility', price: '₹999/mo' },
                { value: 'premium', label: 'Premium', desc: 'Priority + Analytics', price: '₹9,999/yr' },
              ].map(plan => (
                <button
                  key={plan.value}
                  type="button"
                  onClick={() => setFormData({...formData, subscriptionType: plan.value as any})}
                  className={`p-4 rounded-lg border-2 text-left transition ${
                    formData.subscriptionType === plan.value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{plan.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{plan.desc}</div>
                  <div className="text-sm font-medium text-blue-600 mt-2">{plan.price}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            <Link
              href="/admin/stations"
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-center text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Station'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
