'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

/**
 * Sidebar on desktop, slide-over on mobile.
 *
 * Managers check this on a phone between covers far more often than at a desk,
 * so the mobile layout is the one that has to work first.
 */
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/attendance', label: 'Attendance', icon: CalendarClock },
  { href: '/reviews', label: 'Reviews', icon: ClipboardCheck },
  { href: '/settings', label: 'Settings', icon: Settings, ownerOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { restaurant, user, isOwner, signOut, claims } = useAuth();
  const [open, setOpen] = React.useState(false);

  // Close the slide-over whenever the route changes.
  React.useEffect(() => setOpen(false), [pathname]);

  const items = NAV.filter((item) => !item.ownerOnly || isOwner);

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const identity = (
    <div className="border-t pt-3">
      <p className="truncate px-3 text-sm font-medium">
        {user?.displayName || user?.email}
      </p>
      <p className="truncate px-3 text-xs capitalize text-muted-foreground">
        {claims.role ?? ''}
      </p>
      <Button
        variant="ghost"
        className="mt-2 w-full justify-start text-muted-foreground"
        onClick={() => signOut()}
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-60 shrink-0 flex-col border-r bg-card p-4 lg:flex">
        <div className="mb-6 px-3">
          <p className="truncate text-base font-semibold">
            {restaurant?.name ?? 'Attendance'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {restaurant?.timezone ?? ''}
          </p>
        </div>
        {nav}
        <div className="mt-auto">{identity}</div>
      </aside>

      {/* Mobile slide-over */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r bg-card p-4">
            <div className="mb-6 flex items-start justify-between">
              <div className="min-w-0 px-3">
                <p className="truncate text-base font-semibold">
                  {restaurant?.name ?? 'Attendance'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {restaurant?.timezone ?? ''}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close menu</span>
              </Button>
            </div>
            {nav}
            <div className="mt-auto">{identity}</div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
          <p className="truncate font-semibold">{restaurant?.name ?? 'Attendance'}</p>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Standard page heading with an optional action on the right. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
