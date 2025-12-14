import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PetroLink API',
  description: 'Fuel ordering platform API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
