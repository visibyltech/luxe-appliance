import React, { useState } from 'react';
import { Menu, Search, ShoppingCart, User as UserIcon, X } from 'lucide-react';
import { User } from 'firebase/auth';

export type AppView = 'home' | 'shop' | 'product' | 'checkout' | 'account' | 'admin';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  cartCount: number;
  onOpenCart: () => void;
  user: User | null;
  isAdmin: boolean;
  onOpenAuth: () => void;
  unreadNotifications: number;
}

export const OFFICIAL_LOGO_URL =
  '/assets/aistudio/file_000000002aa881f4b6906859778c034b_a84858c4.png';

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onNavigate,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  cartCount,
  onOpenCart,
  user,
  isAdmin,
  onOpenAuth,
  unreadNotifications,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const navLinkClass = (view: AppView) =>
    `text-sm font-medium whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 ${
      activeView === view
        ? 'text-blue-700 border-blue-700'
        : 'text-slate-700 border-transparent hover:text-slate-950 hover:border-slate-300'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-6">
        {/* Zone 1: Brand Logo */}
        <button
          type="button"
          onClick={() => {
            onNavigate('home');
            setMobileMenuOpen(false);
          }}
          className="flex items-center gap-2 shrink-0 min-w-0 focus-visible:outline-2 focus-visible:outline-blue-600 rounded-lg"
        >
          <img
            src={OFFICIAL_LOGO_URL}
            alt="Luxe Appliances"
            className="h-9 sm:h-10 w-auto object-contain rounded-md bg-slate-950 p-0.5 shrink-0"
          />
          <span className="font-display text-sm sm:text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap truncate">
            Luxe Appliances
          </span>
        </button>

        {/* Zone 2: Clean Single-Line Navigation */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          <button type="button" onClick={() => onNavigate('home')} className={navLinkClass('home')}>
            Home
          </button>
          <button type="button" onClick={() => onNavigate('shop')} className={navLinkClass('shop')}>
            Shop All
          </button>
          <button
            type="button"
            onClick={() => onNavigate('account')}
            className={navLinkClass('account')}
          >
            {user ? `Account${unreadNotifications > 0 ? ` (${unreadNotifications})` : ''}` : 'Pay Small Small'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={navLinkClass('admin')}
            >
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Primary Search, Account & Cart Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
            }}
            className="hidden lg:flex items-center bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 w-64 focus-within:border-blue-600 focus-within:bg-white transition-colors"
          >
            <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search TVs, laptops, ACs..."
              className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </form>

          <button
            type="button"
            aria-label="Toggle product search"
            onClick={() => setSearchOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => (user ? onNavigate('account') : onOpenAuth())}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <UserIcon className="w-4 h-4 text-slate-600" />
            <span className="max-w-[110px] truncate">
              {user ? user.displayName || 'My Account' : 'Sign In'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={`Open shopping cart with ${cartCount} items`}
            className="relative inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Cart</span>
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md bg-blue-900 text-[11px] font-mono font-bold tabular-nums">
              {cartCount}
            </span>
          </button>

          <button
            type="button"
            aria-label="Open mobile menu"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expandable Search Bar on Tablet/Mobile */}
      {searchOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
              setSearchOpen(false);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search TVs, fridges, laptops, ACs..."
              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg"
            >
              Search
            </button>
          </form>
        </div>
      )}

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
          <button
            type="button"
            onClick={() => {
              onNavigate('home');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('shop');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
          >
            Shop All Products
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('account');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-800 rounded-lg hover:bg-slate-50"
          >
            {user ? 'My Account & Savings Plans' : 'Pay Small Small / My Account'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                onNavigate('admin');
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left px-3 py-2.5 text-sm font-semibold text-blue-700 rounded-lg hover:bg-blue-50"
            >
              Admin Dashboard
            </button>
          )}
          {!user && (
            <button
              type="button"
              onClick={() => {
                onOpenAuth();
                setMobileMenuOpen(false);
              }}
              className="block w-full text-center px-3 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              Sign In / Create Account
            </button>
          )}
        </div>
      )}
    </header>
  );
};
