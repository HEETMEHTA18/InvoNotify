'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { useInView } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface Step {
  number: number;
  title: string;
  description: string;
}

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref);
  const [activeStep, setActiveStep] = useState(0);
  const accentPrimary = '#596778';
  const accentSecondary = '#7B6EE8';

  const steps: Step[] = [
    {
      number: 1,
      title: 'Create Your Invoice',
      description:
        'Add your clients, items, rates, and taxes. Our smart templates make it quick and easy to create professional invoices.',
    },
    {
      number: 2,
      title: 'Send & Track',
      description:
        'Send invoices instantly via email. Get notified when clients view or download your invoices in real-time.',
    },
    {
      number: 3,
      title: 'Get Paid',
      description:
        'Accept payments online with multiple payment methods. Automatic payment updates and instant reconciliation.',
    },
  ];

  useEffect(() => {
    if (!isInView) return;

    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 3600);

    return () => clearInterval(timer);
  }, [isInView, steps.length]);

  const progressWidth = `${((activeStep + 1) / steps.length) * 100}%`;

  return (
    <section
      ref={ref}
      className='py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8'
    >
      <div className='max-w-7xl mx-auto'>
        {/* Section Header */}
        <div className='text-center space-y-4 md:space-y-6 mb-12 md:mb-16 lg:mb-20'>
          <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold text-[#2C3E50]'>
            How It Works
          </h2>
          <p className='text-lg md:text-xl text-[#4B5563] max-w-2xl mx-auto'>
            Get started in three simple steps
          </p>
        </div>

        {/* Steps */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 lg:gap-8 relative'>
          {/* Connector Lines (Desktop Only) */}
          <div
            className={cn(
              'hidden md:block absolute top-20 left-0 right-0 h-1 rounded-full bg-slate-200/70 transition-all duration-1000',
              isInView ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
            )}
            style={{ transformOrigin: 'left center' }}
          />

          <div
            className={cn(
              'hidden md:block absolute top-20 left-0 h-1 rounded-full bg-linear-to-r transition-all duration-900 ease-out',
              isInView ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              width: progressWidth,
              backgroundImage: `linear-gradient(to right, ${accentPrimary}, ${accentSecondary})`,
            }}
          />

          {/* Steps */}
          {steps.map((step, index) => (
            <div
              key={step.number}
              className={cn(
                'relative rounded-2xl p-4 md:p-5 border transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                isInView
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8',
                activeStep === index
                  ? 'bg-white shadow-lg border-[#DDE4EC] -translate-y-1'
                  : 'bg-white/70 border-[#E5E7EB] shadow-sm'
              )}
              style={{
                transitionDelay: isInView ? `${index * 150}ms` : '0ms',
              }}
            >
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset transition-opacity duration-500',
                  activeStep === index ? 'opacity-100' : 'opacity-0'
                )}
                style={{ borderColor: `${accentSecondary}30` }}
              />

              {/* Number Container */}
              <div className='relative z-10 inline-block mb-6 md:mb-8'>
                <div
                  className={cn(
                    'w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center font-bold text-2xl md:text-3xl transition-all duration-500',
                    'text-white',
                    activeStep === index ? 'scale-105 shadow-lg' : 'scale-100'
                  )}
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${accentPrimary}, ${accentSecondary})`,
                    boxShadow: activeStep === index ? '0 10px 24px rgba(89, 103, 120, 0.22)' : 'none',
                  }}
                >
                  {step.number}
                </div>
              </div>

              {/* Content */}
              <div className='group'>
                <h3 className='text-xl md:text-2xl font-bold text-[#2C3E50] mb-3 md:mb-4'>
                  {step.title}
                </h3>
                <p className='text-[#4B5563] text-base md:text-lg leading-relaxed'>
                  {step.description}
                </p>

                {index === 1 && (
                  <div
                    className={cn(
                      'mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-500',
                      activeStep >= 1
                        ? 'ring-1'
                        : 'bg-slate-100 text-slate-500'
                    )}
                    style={
                      activeStep >= 1
                        ? {
                            backgroundColor: '#EEF2FF',
                            color: accentPrimary,
                            borderColor: '#C7D2FE',
                          }
                        : undefined
                    }
                  >
                    <Mail className='h-3.5 w-3.5' />
                    Email sent to client
                  </div>
                )}

                {/* Visual indicator line mobile */}
                <div
                  className={cn(
                    'hidden sm:block h-1 w-12 mt-6 md:mt-8 rounded-full transition-all duration-300 group-hover:w-20',
                    activeStep === index ? 'w-20' : 'w-12'
                  )}
                  style={{ backgroundColor: activeStep === index ? accentSecondary : accentPrimary }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className='mt-10 md:mt-12 rounded-2xl border border-[#E5E7EB] bg-white p-4 md:p-5 shadow-sm'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-sm md:text-base font-semibold text-[#2C3E50]'>
              Live Workflow Preview
            </p>
            <span className='text-xs md:text-sm text-[#6B7280]'>Auto-playing demo</span>
          </div>

          <div className='mt-3 h-1.5 w-full rounded-full bg-slate-200/70 overflow-hidden'>
            <div
              className='h-full rounded-full transition-all duration-900 ease-out'
              style={{
                width: progressWidth,
                backgroundImage: `linear-gradient(to right, ${accentPrimary}, ${accentSecondary})`,
              }}
            />
          </div>

          <div className='mt-4 grid grid-cols-1 md:grid-cols-3 gap-3'>
            <div
              className={cn(
                'rounded-xl border px-4 py-3 transition-all duration-500',
                activeStep >= 0 ? 'border-[#CBD5E1] bg-slate-50 shadow-sm' : 'border-[#E5E7EB] bg-white'
              )}
            >
              <div className='flex items-center gap-2 text-sm font-medium text-[#334155]'>
                <Send className='h-4 w-4' />
                Invoice Created
              </div>
              <p className='mt-1 text-xs text-[#64748B]'>Invoice generated with client items</p>
            </div>

            <div
              className={cn(
                'rounded-xl border px-4 py-3 transition-all duration-500',
                activeStep >= 1 ? 'border-[#D6D3FB] bg-[#F5F3FF] shadow-sm' : 'border-[#E5E7EB] bg-white'
              )}
            >
              <div className='flex items-center gap-2 text-sm font-medium text-[#334155]'>
                <Mail className='h-4 w-4' />
                Email Sent
              </div>
              <p className='mt-1 text-xs text-[#64748B]'>Delivered to client inbox with tracking</p>
            </div>

            <div
              className={cn(
                'rounded-xl border px-4 py-3 transition-all duration-500',
                activeStep >= 2 ? 'border-[#D6D3FB] bg-[#EEF2FF] shadow-sm' : 'border-[#E5E7EB] bg-white'
              )}
            >
              <div className='flex items-center gap-2 text-sm font-medium text-[#334155]'>
                <CheckCircle2 className='h-4 w-4' />
                Client Opened & Paid
              </div>
              <p className='mt-1 text-xs text-[#64748B]'>Payment confirmation synced automatically</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
