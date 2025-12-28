import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="px-6 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link
              href="/token"
              className="text-muted hover:text-foreground transition-colors"
            >
              $LESS
            </Link>
            <Link
              href="/collection"
              className="text-muted hover:text-foreground transition-colors"
            >
              collection
            </Link>
            <Link
              href="/mint"
              className="text-muted hover:text-foreground transition-colors"
            >
              mint
            </Link>
            <Link
              href="/collectors"
              className="text-muted hover:text-foreground transition-colors"
            >
              collectors
            </Link>
            <Link
              href="/bounties"
              className="text-muted hover:text-foreground transition-colors"
            >
              bounties
            </Link>
            <Link
              href="/about"
              className="text-muted hover:text-foreground transition-colors"
            >
              about
            </Link>
            <a
              href="https://x.com/lessstrategy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-foreground transition-colors"
            >
              X
            </a>
            <a
              href="https://opensea.io/collection/say-less"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-foreground transition-colors"
            >
              opensea
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
