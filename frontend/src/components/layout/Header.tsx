'use client';

import Link from 'next/link';
import { ConnectButton } from '@/components/wallet/ConnectButton';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-4 md:px-8">
        <Link
          href="/"
          className="text-lg font-medium tracking-tight hover:opacity-70 transition-opacity"
        >
          less
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/collection"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            collection
          </Link>
          <Link
            href="/mint"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            mint
          </Link>
          <Link
            href="/about"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            about
          </Link>
        </nav>

        <ConnectButton />
      </div>
    </header>
  );
}
