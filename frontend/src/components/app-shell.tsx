import { useState } from 'react';
import { LogOut, Megaphone, Menu, Wallet, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
] as const;

/**
 * Header, navigation and page frame.
 *
 * Navigation is inline from the small-tablet breakpoint up and collapses to a
 * disclosure panel below it, which is the only layout branch in the app — every
 * page below is fluid, so tablet and laptop differ by column count rather than
 * by a separate layout.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="bg-background/85 sticky top-0 z-30 border-b backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <BrandMark />

          <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground hidden max-w-[16ch] truncate text-sm lg:inline">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="hidden sm:inline-flex"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-nav"
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              {isMenuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </Button>
          </div>
        </div>

        {isMenuOpen ? (
          <div id="mobile-nav" className="border-t sm:hidden">
            <nav className="flex flex-col gap-1 p-3" aria-label="Main">
              {NAV_ITEMS.map((item) => (
                <NavItem key={item.to} {...item} onNavigate={() => setIsMenuOpen(false)} full />
              ))}
              <Separator className="my-1" />
              <p className="text-muted-foreground truncate px-3 py-1 text-xs">{user?.email}</p>
              <Button variant="ghost" className="justify-start" onClick={logout}>
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Button>
            </nav>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet key={location.pathname} />
      </main>

      <footer className="text-muted-foreground border-t px-4 py-4 text-center text-xs">
        Credits are internal balances. Real money only enters through Stripe.
      </footer>
    </div>
  );
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg font-semibold">
        C
      </span>
      <span className="font-heading text-base font-semibold tracking-tight">CultureX</span>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  onNavigate,
  full = false,
}: {
  to: string;
  label: string;
  icon: typeof Wallet;
  onNavigate?: () => void;
  full?: boolean;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          full ? 'w-full' : '',
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </NavLink>
  );
}
