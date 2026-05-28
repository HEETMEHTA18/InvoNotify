'use client';

import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useInView } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface FinalCTAProps {
  onGetStarted?: () => void;
}

export default function FinalCTA({ onGetStarted }: FinalCTAProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref);

  const benefits = [
    'Free forever for small businesses',
    'No credit card required',
    'Full access to all basic features',
  ];

  return (
    <section
      ref={ref}
      className='relative py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8 overflow-hidden'
    >
      {/* Background gradient */}
      <div className='absolute inset-0 bg-linear-to-r from-[#596778] via-[#8B5CF6] to-[#8691A6] -z-10' />

      {/* Decorative elements */}
      <div className='absolute top-0 right-0 -z-10 w-96 h-96 bg-white/10 rounded-full blur-3xl' />
      <div className='absolute bottom-0 left-0 -z-10 w-96 h-96 bg-white/10 rounded-full blur-3xl' />

      <div className='max-w-4xl mx-auto text-center text-white'>
        <div
          className={cn(
            'space-y-4 md:space-y-6 mb-8 md:mb-12 transition-all duration-700',
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          )}
        >
          <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold leading-tight'>
            Ready to Streamline Invoicing with invonotify?
          </h2>
          <p className='text-base md:text-lg lg:text-xl text-white/90 max-w-2xl mx-auto'>
            Create, send, and track invoices from one clean dashboard with reminders and payment updates built in.
          </p>
        </div>

        <div
          className={cn(
            'flex flex-wrap items-center justify-center gap-4 md:gap-6 mb-8 md:mb-10 transition-all duration-700 delay-150',
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          )}
        >
          {benefits.map((benefit) => (
            <div key={benefit} className='inline-flex items-center gap-2 text-sm md:text-base text-white/95'>
              <CheckCircle2 className='h-4 w-4 md:h-5 md:w-5 text-emerald-200' />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        <div
          className={cn(
            'transition-all duration-700 delay-300',
            isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          )}
        >
          <Button
            onClick={onGetStarted}
            size='lg'
            className='bg-white text-[#2C3E50] hover:bg-gray-100 font-semibold px-8 py-6'
          >
            Start with invonotify
            <ArrowRight className='ml-2 h-5 w-5' />
          </Button>
        </div>
      </div>
    </section>
  );
}
