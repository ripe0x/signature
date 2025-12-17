'use client';

import Link from 'next/link';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { IS_PRE_LAUNCH } from '@/lib/contracts';

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-4 md:px-8">
        <div className="flex items-baseline gap-2">
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
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            by ripe
          </a>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {!IS_PRE_LAUNCH && (
            <Link
              href="/collection"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              collection
            </Link>
          )}
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
