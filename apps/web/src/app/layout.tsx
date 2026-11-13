import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { StorefrontShell } from '@/components/storefront-shell';

export const metadata: Metadata = {
  title: 'AURA | Thiết bị Flagship, Âm thanh Studio & Flash Deals Giới hạn',
  description:
    'Sàn thương mại điện tử công nghệ cao cấp: máy tính flagship, âm thanh studio, màn hình OLED và sự kiện Flash Sale độc quyền.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased selection:bg-rose-600 selection:text-white">
        <Providers>
          <StorefrontShell>{children}</StorefrontShell>
        </Providers>
      </body>
    </html>
  );
}
