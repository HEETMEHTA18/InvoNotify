'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Features', href: '/register' },
    { label: 'How It Works', href: '/register' },
    { label: 'FAQ', href: '/register' },
  ];

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-40 transition-all duration-200',
        isScrolled
          ? 'bg-white/80 backdrop-blur-md border-b border-[#E5E7EB] shadow-sm'
          : 'bg-white'
      )}
    >
      <div className='max-w-7xl mx-auto px-4 md:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between'>
        {/* Logo */}
        <Link href='/register' className='flex items-center gap-2'>
          <div className='flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg border border-[#D1D5DB] bg-white shadow-sm overflow-hidden'>
            <Image
              src='/icon.png'
              alt='invonotify logo'
              width={24}
              height={24}
              className='h-6 w-6 object-contain md:h-7 md:w-7'
              priority
            />
          </div>
          <span className='hidden sm:inline font-bold text-lg md:text-xl text-[#2C3E50]'>
            invonotify
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className='hidden md:flex items-center gap-8 lg:gap-12'>
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className='text-[#4B5563] hover:text-[#596778] font-medium transition-colors text-sm lg:text-base'
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right Section */}
        <div className='flex items-center gap-3 md:gap-4'>
          <Button asChild variant='ghost' size='sm' className='hidden sm:flex text-[#596778] hover:text-[#8B5CF6] text-sm md:text-base'>
            <Link href='/register'>Sign In</Link>
          </Button>
          <Button asChild size='sm' className='hidden sm:flex text-xs md:text-sm'>
            <Link href='/register'>Get Started</Link>
          </Button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className='md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#596778] transition-colors'
            aria-label='Toggle menu'
          >
            {isOpen ? (
              <X className='w-5 h-5' />
            ) : (
              <Menu className='w-5 h-5' />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className='md:hidden bg-white border-t border-[#E5E7EB]'>
          <nav className='px-4 py-3 space-y-2'>
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className='block px-4 py-3 rounded-lg text-[#4B5563] hover:bg-[#F3F4F6] transition-colors font-medium text-sm'
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className='flex gap-2 pt-3 border-t border-[#E5E7EB] mt-3'>
              <Button asChild variant='secondary' size='sm' className='w-full'>
                <Link href='/register'>Sign In</Link>
              </Button>
              <Button asChild size='sm' className='w-full'>
                <Link href='/register'>Get Started</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
