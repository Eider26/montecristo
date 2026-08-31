import './globals.css';

export const metadata = {
  title: 'FastFood POS',
  description: 'Sistema de ventas para comida rápida'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
