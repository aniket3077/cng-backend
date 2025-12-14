# Fuel Bharat CRM - Quick Test Guide

Write-Host "=== Fuel Bharat CRM System Test ===" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

Write-Host "Test 1: Register Station Owner" -ForegroundColor Yellow
Write-Host "POST $baseUrl/api/auth/subscriber/signup"
Write-Host @"
{
  "name": "Rajesh Kumar",
  "email": "rajesh@abcfuels.com",
  "phone": "+919876543210",
  "password": "secure123",
  "companyName": "ABC Fuels Pvt Ltd",
  "gstNumber": "29ABCDE1234F1Z5"
}
"@ -ForegroundColor White
Write-Host ""

Write-Host "Test 2: Login Station Owner" -ForegroundColor Yellow
Write-Host "POST $baseUrl/api/auth/subscriber/login"
Write-Host @"
{
  "email": "rajesh@abcfuels.com",
  "password": "secure123"
}
"@ -ForegroundColor White
Write-Host "Response will include JWT token - save it as YOUR_TOKEN" -ForegroundColor Green
Write-Host ""

Write-Host "Test 3: Get Profile" -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/subscriber/profile"
Write-Host "Headers: Authorization: Bearer YOUR_TOKEN" -ForegroundColor White
Write-Host ""

Write-Host "Test 4: Register a Station" -ForegroundColor Yellow
Write-Host "POST $baseUrl/api/subscriber/stations"
Write-Host "Headers: Authorization: Bearer YOUR_TOKEN"
Write-Host @"
{
  "name": "ABC Fuel Station - Andheri",
  "address": "123, Link Road, Andheri West",
  "city": "Mumbai",
  "state": "Maharashtra",
  "postalCode": "400053",
  "lat": 19.1136,
  "lng": 72.8697,
  "fuelTypes": "Petrol,Diesel,CNG",
  "phone": "+912226231234",
  "openingHours": "6:00 AM - 11:00 PM",
  "amenities": "Restroom,ATM,Air Pump,Car Wash"
}
"@ -ForegroundColor White
Write-Host ""

Write-Host "Test 5: Create Support Ticket" -ForegroundColor Yellow
Write-Host "POST $baseUrl/api/subscriber/support"
Write-Host "Headers: Authorization: Bearer YOUR_TOKEN"
Write-Host @"
{
  "subject": "Station Approval Taking Too Long",
  "description": "I submitted my station 2 days ago but haven't received any update. Please review.",
  "category": "general",
  "priority": "medium"
}
"@ -ForegroundColor White
Write-Host ""

Write-Host "Test 6: Admin - View All Station Owners" -ForegroundColor Yellow
Write-Host "GET $baseUrl/api/admin/owners?page=1&limit=20"
Write-Host "Headers: Authorization: Bearer ADMIN_TOKEN" -ForegroundColor White
Write-Host ""

Write-Host "Test 7: Admin - Approve Station Owner" -ForegroundColor Yellow
Write-Host "PUT $baseUrl/api/admin/owners?id=OWNER_ID"
Write-Host "Headers: Authorization: Bearer ADMIN_TOKEN"
Write-Host @"
{
  "status": "active",
  "kycStatus": "verified",
  "emailVerified": true
}
"@ -ForegroundColor White
Write-Host ""

Write-Host "Test 8: Admin - Approve Station" -ForegroundColor Yellow
Write-Host "PUT $baseUrl/api/admin/stations"
Write-Host "Headers: Authorization: Bearer ADMIN_TOKEN"
Write-Host @"
{
  "id": "STATION_ID",
  "approvalStatus": "approved",
  "isVerified": true
}
"@ -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Backend Server: npm run dev" -ForegroundColor Green
Write-Host "✅ Admin Login: admin@fuelbharat.com / Admin@123" -ForegroundColor Green
Write-Host ""
Write-Host "For detailed API documentation, see: CRM_README.md" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
