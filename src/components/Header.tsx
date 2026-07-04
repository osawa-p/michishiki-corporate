"use client";

import Link from "next/link";
import { useState } from "react";

const navLinks = [
  { href: "/service", label: "サービス" },
  { href: "/about", label: "会社概要" },
  { href: "/news", label: "お知らせ" },
  { href: "/recruit", label: "採用情報" },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-18">
          {/* Logo */}
          <Link href="/" className="group leading-tight">
            <span className="block font-serif text-lg font-semibold tracking-wide text-ink group-hover:text-bronze-deep transition-colors">
              株式会社ミチビキ
            </span>
            <span className="block text-[10px] tracking-[0.35em] text-ink-faint uppercase">
              Michibiki Inc.
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-soft hover:text-bronze-deep transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/contact"
              className="ml-2 px-6 py-2.5 bg-ink text-paper text-sm font-medium hover:bg-bronze-deep transition-colors"
            >
              無料相談
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-ink"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="メニュー"
            aria-expanded={isOpen}
          >
            <div className={`w-6 h-px bg-current transition-transform ${isOpen ? "translate-y-[5px] rotate-45" : ""}`} />
            <div className={`w-6 h-px bg-current my-[9px] ${isOpen ? "opacity-0" : ""}`} />
            <div className={`w-6 h-px bg-current transition-transform ${isOpen ? "-translate-y-[5px] -rotate-45" : ""}`} />
          </button>
        </div>

        {/* Mobile Nav */}
        {isOpen && (
          <nav className="md:hidden py-4 border-t border-line">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block py-3 text-sm font-medium text-ink-soft hover:text-bronze-deep border-b border-line/60"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/contact"
              className="block mt-4 mb-2 px-6 py-3 bg-ink text-paper text-sm font-medium text-center"
              onClick={() => setIsOpen(false)}
            >
              無料相談
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
