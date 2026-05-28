'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useInView } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface Stat {
  number: number | string;
  unit?: string;
  label: string;
  prefix?: string;
  suffix?: string;
}

const STATS: Stat[] = [
  { number: 10, unit: 'K+', label: 'Active Users' },
  { number: 500, unit: 'K+', label: 'Invoices Created' },
  { number: 50, unit: 'M+', label: 'Total Revenue Tracked', suffix: '$' },
  { number: 99.9, unit: '%', label: 'Uptime Guaranteed' },
];

export default function Statistics() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref);
  const [displayStats, setDisplayStats] = useState<number[]>([0, 0, 0, 0]);

  // Counter animation
  useEffect(() => {
    if (!isInView) return;

    const intervals = STATS.map((stat, index) => {
      const finalNumber = typeof stat.number === 'string' ? 0 : stat.number;
      let current = 0;

      const increment = Math.ceil(finalNumber / 60);
      const timer = setInterval(() => {
        current += increment;
        if (current >= finalNumber) {
          current = finalNumber;
          clearInterval(timer);
        }
        setDisplayStats((prev) => {
          const newStats = [...prev];
          newStats[index] = current;
          return newStats;
        });
      }, 30);

      return timer;
    });

    return () => intervals.forEach(clearInterval);
  }, [isInView]);

  return (
    <section ref={ref} className='py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8 bg-linear-to-br from-[#596778] to-[#2C3E50] text-white overflow-hidden relative'>
      {/* Background elements */}
      <div className='absolute top-0 right-0 -z-10 w-96 h-96 bg-[#8B5CF6]/20 rounded-full blur-3xl' />
      <div className='absolute bottom-0 left-0 -z-10 w-96 h-96 bg-[#10B981]/20 rounded-full blur-3xl' />

      <div className='max-w-7xl mx-auto'>
        {/* Section Header */}
        <div className='text-center space-y-4 md:space-y-6 mb-12 md:mb-16 lg:mb-20'>
          <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold'>
            Trusted by Growing Businesses
          </h2>
          <p className='text-lg md:text-xl text-white/80 max-w-2xl mx-auto'>
            InvoiceFlow is powering invoicing for thousands of businesses worldwide
          </p>
        </div>

        {/* Statistics Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-6 lg:gap-8'>
          {STATS.map((stat, index) => (
            <div
              key={index}
              className={cn(
                'text-center py-8 md:py-12 px-6 md:px-8 rounded-xl bg-white/10 backdrop-blur border border-white/20 hover:border-white/40 transition-all duration-300 hover:bg-white/15',
                isInView
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              )}
              style={{
                transitionDelay: isInView ? `${index * 100}ms` : '0ms',
              }}
            >
              {/* Number */}
              <div className='mb-4'>
                <div className='text-4xl md:text-5xl lg:text-6xl font-bold text-transparent bg-clip-text bg-linear-to-r from-white via-[#E0E7FF] to-white'>
                  {stat.prefix}
                  {displayStats[index]}
                  {stat.unit}
                </div>
              </div>

              {/* Label */}
              <p className='text-base md:text-lg text-white/90'>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Bottom Social Proof */}
        <div className='mt-16 md:mt-20 lg:mt-24 pt-12 md:pt-16 border-t border-white/20 text-center'>
          <p className='text-white/80 text-sm md:text-base mb-6'>
            Trusted by teams at
          </p>
          <div className='flex flex-wrap justify-center items-center gap-6 md:gap-8 lg:gap-12'>
            {['Stripe', 'Vercel', 'AWS', 'GitHub', 'Figma'].map((company) => (
              <div
                key={company}
                className='text-white/60 font-semibold text-sm md:text-base hover:text-white/90 transition-colors'
              >
                {company}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
