import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="px-6 md:px-8 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* <div className="text-sm text-muted">LESS</div> */}

          <nav className="flex items-center gap-6 text-sm">
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
          </nav>
        </div>
      </div>
    </footer>
  );
}
