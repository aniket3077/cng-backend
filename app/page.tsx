'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

interface Station {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  fuelTypes: string;
  isPartner: boolean;
  rating: number;
}

interface StationSuggestion {
  station: Station;
  distance: number;
  score: number;
  reason: string;
}

export default function Home() {
  const [startLocation, setStartLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [stations, setStations] = useState<StationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);

  // Initialize Google Maps
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      setError('Google Maps API key not configured');
      return;
    }

    // Load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    window.initMap = () => {
      if (mapRef.current && !mapInstance.current) {
        const google = window.google;
        
        // Default center (India)
        const defaultCenter = { lat: 20.5937, lng: 78.9629 };
        
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center: defaultCenter,
          zoom: 5,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
        });
        
        setMapLoaded(true);
        
        // Try to get user's location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const pos = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              };
              mapInstance.current.setCenter(pos);
              mapInstance.current.setZoom(12);
            },
            () => console.log('Location access denied')
          );
        }
      }
    };
    
    script.onload = () => window.initMap();
    document.head.appendChild(script);

    return () => {
      if (mapInstance.current) {
        mapInstance.current = null;
      }
    };
  }, []);

  // Clear existing markers
  const clearMarkers = () => {
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
  };

  // Add station markers to map
  const addStationMarkers = useCallback((stationList: StationSuggestion[]) => {
    if (!mapInstance.current || !mapLoaded || !window.google) return;
    
    const google = window.google;
    clearMarkers();
    
    const bounds = new google.maps.LatLngBounds();
    
    stationList.forEach((item, index) => {
      const { station } = item;
      
      const position = { lat: station.lat, lng: station.lng };
      
      const marker = new google.maps.Marker({
        position,
        map: mapInstance.current,
        title: station.name,
        label: {
          text: `${index + 1}`,
          color: 'white',
          fontWeight: 'bold',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 15,
          fillColor: station.isPartner ? '#10B981' : '#3B82F6',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
      });
      
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="min-width: 200px; padding: 8px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${station.name}</h3>
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${station.address}, ${station.city}</p>
            <p style="margin: 0 0 4px 0; font-size: 12px;">
              <strong>Distance:</strong> ${item.distance.toFixed(1)} km
            </p>
            <p style="margin: 0 0 4px 0; font-size: 12px;">
              <strong>Rating:</strong> ⭐ ${station.rating.toFixed(1)}
            </p>
            <p style="margin: 0; font-size: 12px;">
              <strong>Fuel:</strong> ${station.fuelTypes}
            </p>
            ${station.isPartner ? '<span style="background: #10B981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; margin-top: 4px; display: inline-block;">Partner</span>' : ''}
          </div>
        `,
      });
      
      marker.addListener('click', () => {
        infoWindow.open(mapInstance.current, marker);
      });
      
      markersRef.current.push(marker);
      bounds.extend(position);
    });
    
    // Fit map to show all markers
    if (stationList.length > 0) {
      mapInstance.current.fitBounds(bounds);
    }
  }, [mapLoaded]);

  // Geocode address to coordinates using Google Geocoding API
  const geocodeAddress = async (address: string): Promise<{lat: number, lng: number} | null> => {
    if (!window.google) return null;
    
    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results: any, status: any) => {
        if (status === 'OK' && results && results[0]) {
          const location = results[0].geometry.location;
          resolve({ lat: location.lat(), lng: location.lng() });
        } else {
          console.error('Geocoding failed:', status);
          resolve(null);
        }
      });
    });
  };

  // Find CNG stations along route
  const findRoute = async () => {
    if (!startLocation.trim() || !destination.trim()) {
      setError('Please enter both starting location and destination');
      return;
    }

    setLoading(true);
    setError('');
    setStations([]);

    try {
      // Geocode start location
      const startCoords = await geocodeAddress(startLocation);
      if (!startCoords) {
        setError('Could not find starting location');
        setLoading(false);
        return;
      }

      // Geocode destination
      const endCoords = await geocodeAddress(destination);
      if (!endCoords) {
        setError('Could not find destination');
        setLoading(false);
        return;
      }

      // Draw route line on map using Google Maps Directions
      if (mapInstance.current && mapLoaded && window.google) {
        const google = window.google;
        
        // Remove existing route if any
        if (directionsRendererRef.current) {
          directionsRendererRef.current.setMap(null);
        }
        
        // Use Directions Service for real routing
        const directionsService = new google.maps.DirectionsService();
        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#3B82F6',
            strokeWeight: 4,
            strokeOpacity: 0.8,
          },
        });
        
        directionsService.route(
          {
            origin: { lat: startCoords.lat, lng: startCoords.lng },
            destination: { lat: endCoords.lat, lng: endCoords.lng },
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result: any, status: any) => {
            if (status === 'OK') {
              directionsRendererRef.current.setDirections(result);
            } else {
              // Fallback to straight line if directions fail
              new google.maps.Polyline({
                path: [
                  { lat: startCoords.lat, lng: startCoords.lng },
                  { lat: endCoords.lat, lng: endCoords.lng },
                ],
                strokeColor: '#3B82F6',
                strokeOpacity: 0.7,
                strokeWeight: 4,
                map: mapInstance.current,
              });
            }
          }
        );

        // Add start marker (green car)
        const startMarker = new google.maps.Marker({
          position: { lat: startCoords.lat, lng: startCoords.lng },
          map: mapInstance.current,
          title: 'Start: ' + startLocation,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: '#22C55E',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 3,
          },
          label: {
            text: '🚗',
            color: 'white',
          },
        });
        
        // Add end marker (red pin)
        const endMarker = new google.maps.Marker({
          position: { lat: endCoords.lat, lng: endCoords.lng },
          map: mapInstance.current,
          title: 'Destination: ' + destination,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: '#EF4444',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 3,
          },
          label: {
            text: '📍',
            color: 'white',
          },
        });

        markersRef.current.push(startMarker, endMarker);
      }

      // Find CNG pumps near the route midpoint and along the way
      const midLat = (startCoords.lat + endCoords.lat) / 2;
      const midLng = (startCoords.lng + endCoords.lng) / 2;

      const response = await fetch('/api/suggest-pumps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: midLat,
          lng: midLng,
          fuelType: 'CNG',
          radiusKm: 50, // Search within 50km
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stations');
      }

      const data = await response.json();
      setStations(data.suggestions || []);
      addStationMarkers(data.suggestions || []);
      
    } catch (err: any) {
      setError(err.message || 'An error occurred while finding route');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? '320px' : '0px',
        minWidth: sidebarOpen ? '320px' : '0px',
        background: '#1F2937',
        color: 'white',
        transition: 'all 0.3s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: '20px' }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>🚗 Navigation</h2>
          <nav>
            <a href="#" style={{ display: 'block', padding: '12px', color: '#9CA3AF', textDecoration: 'none', borderRadius: '8px', marginBottom: '4px' }}>Dashboard</a>
            <a href="#" style={{ display: 'block', padding: '12px', color: 'white', background: '#374151', textDecoration: 'none', borderRadius: '8px', marginBottom: '4px' }}>Route Planner</a>
            <a href="#" style={{ display: 'block', padding: '12px', color: '#9CA3AF', textDecoration: 'none', borderRadius: '8px', marginBottom: '4px' }}>My Orders</a>
            <a href="#" style={{ display: 'block', padding: '12px', color: '#9CA3AF', textDecoration: 'none', borderRadius: '8px' }}>Settings</a>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F3F4F6' }}>
        {/* Header */}
        <header style={{
          background: 'white',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          borderBottom: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ☰
          </button>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Dashboard</h1>
        </header>

        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Panel - Route Form & Results */}
          <div style={{
            width: '400px',
            background: 'white',
            borderRight: '1px solid #E5E7EB',
            overflow: 'auto',
            padding: '24px',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1F2937', margin: '0 0 8px 0' }}>
                CNG Route Finder
              </h1>
              <p style={{ color: '#6B7280', margin: 0, fontSize: '14px' }}>
                Find CNG pumps along your travel route with real-time availability
              </p>
            </div>

            {/* Route Form */}
            <div style={{
              background: '#F9FAFB',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🛣️ Plan Your Route
              </h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                  Starting Location
                </label>
                <input
                  type="text"
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                  placeholder="Enter starting location"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                  Destination
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Enter destination"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                onClick={findRoute}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading ? '#9CA3AF' : '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {loading ? (
                  <>⏳ Finding Stations...</>
                ) : (
                  <>🔍 Find Route</>
                )}
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div style={{
                background: '#FEE2E2',
                color: '#DC2626',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
              }}>
                {error}
              </div>
            )}

            {/* Station Results */}
            {stations.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#374151' }}>
                  ⛽ {stations.length} CNG Stations Found
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {stations.map((item, index) => (
                    <div
                      key={item.station.id}
                      style={{
                        background: '#F9FAFB',
                        borderRadius: '10px',
                        padding: '16px',
                        border: item.station.isPartner ? '2px solid #10B981' : '1px solid #E5E7EB',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          background: item.station.isPartner ? '#10B981' : '#3B82F6',
                          color: 'white',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          flexShrink: 0,
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>
                              {item.station.name}
                            </h4>
                            {item.station.isPartner && (
                              <span style={{
                                background: '#D1FAE5',
                                color: '#065F46',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                              }}>
                                Partner
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#6B7280' }}>
                            {item.station.address}, {item.station.city}
                          </p>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                            <span>📏 {item.distance.toFixed(1)} km</span>
                            <span>⭐ {item.station.rating.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Map Area */}
          <div style={{ flex: 1, position: 'relative' }}>
            <div
              ref={mapRef}
              style={{
                width: '100%',
                height: '100%',
                background: '#E5E7EB',
              }}
            />
            {!mapLoaded && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'white',
                padding: '20px 40px',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                ⏳ Loading map...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
