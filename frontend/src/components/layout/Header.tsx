'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { IS_PRE_LAUNCH, IS_TOKEN_LIVE } from '@/lib/contracts';

// Token-only state: token is live but NFT isn't deployed yet
const IS_TOKEN_ONLY = IS_TOKEN_LIVE && IS_PRE_LAUNCH;

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="transition-transform duration-200"
    >
      {open ? (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </>
      ) : (
        <>
          <line x1="4" y1="8" x2="20" y2="8" />
          <line x1="4" y1="16" x2="20" y2="16" />
        </>
      )}
    </svg>
  );
}

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const navLinks = (
    <>
      <Link
        href="/mint"
        className="text-sm text-muted hover:text-foreground transition-colors"
        onClick={() => setMobileMenuOpen(false)}
      >
        MINT
      </Link>
      {!IS_PRE_LAUNCH && (
        <Link
          href="/collection"
          className="text-sm text-muted hover:text-foreground transition-colors"
          onClick={() => setMobileMenuOpen(false)}
        >
          collection
        </Link>
      )}
      <Link
        href="/about"
        className="text-sm text-muted hover:text-foreground transition-colors"
        onClick={() => setMobileMenuOpen(false)}
      >
        about
      </Link>
      {!IS_PRE_LAUNCH && (
        <Link
          href="/collectors"
          className="text-sm text-muted hover:text-foreground transition-colors"
          onClick={() => setMobileMenuOpen(false)}
        >
          collectors
        </Link>
      )}
    </>
  );

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4 md:px-8">
          <div className="flex flex-col">
            <Link
              href="/"
              className="text-lg font-medium tracking-tight hover:opacity-70 transition-opacity"
            >
              LESS
            </Link>
            <a
              href="https://ripe.wtf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-muted/70 hover:text-muted transition-colors -mt-0.5"
            >
              by ripe
            </a>
          </div>

          {/* Desktop nav */}
          {!IS_TOKEN_ONLY && (
            <nav className="hidden md:flex items-center gap-8">
              {navLinks}
            </nav>
          )}

          <div className="flex items-center gap-4">
            <ConnectButton />

            {/* Mobile menu button */}
            {!IS_TOKEN_ONLY && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-1 text-muted hover:text-foreground transition-colors"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                <MenuIcon open={mobileMenuOpen} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {!IS_TOKEN_ONLY && (
        <div
          className={`
            fixed inset-0 z-40 bg-background/95 backdrop-blur-sm
            md:hidden
            transition-opacity duration-200
            ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
        >
          <nav className="flex flex-col items-center justify-center h-full gap-8 text-lg">
            <Link
              href="/mint"
              className="text-muted hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              MINT
            </Link>
            {!IS_PRE_LAUNCH && (
              <Link
                href="/collection"
                className="text-muted hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                collection
              </Link>
            )}
            <Link
              href="/about"
              className="text-muted hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              about
            </Link>
            {!IS_PRE_LAUNCH && (
              <Link
                href="/collectors"
                className="text-muted hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                collectors
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
