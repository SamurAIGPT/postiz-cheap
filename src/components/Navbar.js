"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { IoClose, IoMenu } from "react-icons/io5";
import { FiMoon, FiSun, FiDollarSign, FiPlus } from "react-icons/fi";
import { SiVercel } from "react-icons/si";
import config from "@/lib/config";

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const appName = config?.appName || "AI SaaS";
  const logoLetter = appName.trim().charAt(0).toUpperCase();

  // Eagerly prefetch workspace/gallery routes for fast tabs
  useEffect(() => {
    // Prefetch common routes
  }, []);

  const appMatch = pathname ? pathname.match(/^\/app\/([^\/]+)/) : null;
  const currentAppId = appMatch ? appMatch[1] : null;

  const navLinks = [
    { name: "Calendar", path: "/" },
    { name: "Channels", path: "/integrations" },
    { name: "Agent", path: "/agents" },
    { name: "Gallery", path: "/gallery" },
    { name: "Pricing", path: "/pricing" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-divider/50 shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        
        {/* Logo and Brand Title (Visible at all times) */}
        <Link href="/" className="flex items-center gap-2.5 transition-transform hover:scale-[1.02] active:scale-95">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 text-white font-extrabold text-lg shadow-md shadow-indigo-500/30">
            {logoLetter}
          </div>
          <span className="text-lg font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-100 to-indigo-300 text-nowrap">
            {appName}
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.path;
            return (
              <Link
                key={link.name}
                href={link.path}
                className={`text-[13px] font-semibold transition-all relative py-1 ${
                  isActive ? "text-indigo-400 font-bold" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {link.name}
                {isActive && (
                  <div className="absolute -bottom-[20px] left-0 right-0 h-0.5 bg-indigo-500 rounded-full shadow-sm shadow-indigo-500/50" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Actions Section */}
        <div className="hidden md:flex items-center gap-4">
          
          {/* Vercel Deploy Button */}
          <a
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSamurAIGPT%2Fcommon-saas-template"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-full border border-divider px-4 py-1.5 text-xs font-bold text-secondary-text hover:text-primary-text hover:bg-bg-card transition-colors shadow-sm"
          >
            <SiVercel className="text-xs text-white" />
            <span>Deploy</span>
          </a>

          {status === "authenticated" && (
            <div className="flex items-center gap-3">
              <div className="flex items-center h-9 border border-divider rounded bg-bg-page/30 overflow-hidden pr-2">
                <span className="font-bold text-[13px] px-3 flex items-center text-primary-text gap-1">
                  <FiDollarSign className="text-emerald-500 text-xs" />
                  {session.user.credits !== undefined ? session.user.credits : 0}
                </span>
                <Link
                  href="/pricing"
                  aria-label="Manage credits"
                  className="flex items-center justify-center w-5 h-5 rounded hover:bg-bg-card text-secondary-text transition-colors"
                >
                  <FiPlus size={14} />
                </Link>
              </div>
              <span className="text-xs font-semibold text-secondary-text">Private workspace</span>
            </div>
          )}
        </div>

        {/* Mobile Navbar Hamburger Menu Controls */}
        <div className="flex md:hidden items-center gap-2">
          {status === "authenticated" && (
            <div className="flex items-center h-8 border border-divider rounded bg-bg-page/30 px-2.5 text-xs font-bold text-primary-text gap-0.5">
              <FiDollarSign className="text-emerald-500 text-[10px]" />
              {session.user.credits !== undefined ? session.user.credits : 0}
            </div>
          )}
          
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="hover:bg-bg-card p-2 rounded cursor-pointer transition-colors text-primary-text border border-divider/50"
            aria-label="Toggle Menu"
          >
            {isOpen ? <IoClose size={20} /> : <IoMenu size={20} />}
          </button>
        </div>
      </div>

      {/* Absolutely Positioned Mobile Menu Dropdown (Backdrop blur + matches layout) */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[200] glass-dropdown border-b border-divider shadow-2xl py-4 px-6 md:hidden animate-fade-in">
          <nav className="flex flex-col gap-3">
            <span className="text-[10px] uppercase font-bold text-secondary-text tracking-widest mb-1">Navigation</span>
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center py-2.5 rounded text-sm font-semibold transition-all ${
                  pathname === link.path ? "bg-primary/10 text-primary px-3 border border-primary/20" : "text-primary-text hover:bg-bg-card"
                }`}
              >
                {link.name}
              </Link>
            ))}

            <div className="h-px bg-divider/50 my-2" />

            {/* Vercel Deploy in Mobile menu */}
            <a
              href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSamurAIGPT%2Fcommon-saas-template"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-divider py-3 text-xs font-bold text-secondary-text hover:text-primary-text hover:bg-bg-card transition-all"
            >
              <SiVercel className="text-xs text-white" />
              <span>Clone & Deploy Template</span>
            </a>

          </nav>
        </div>
      )}
    </header>
  );
}
