import type { Metadata } from 'next';

import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui/toast';

import './globals.css';

export const metadata: Metadata = {
  title: 'Attendance — Manager portal',
  description:
    'Manage employees, see who is in, review flagged check-ins and export attendance.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
