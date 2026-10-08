import './globals.css';

export const metadata = {
  title: 'Family Safety Network',
  description: 'Private, consent-based family travel safety monitoring and mutual protection.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-gray-100 antialiased selection:bg-emerald-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
