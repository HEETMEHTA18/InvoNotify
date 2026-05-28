'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  CheckCircle2,
  Mail,
  MousePointer2,
  PhoneCall,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInView } from '@/lib/animations';
import { AnimatePresence, motion } from 'motion/react';

interface HeroProps {
  onGetStarted?: () => void;
  onDemo?: () => void;
}

export default function Hero({ onGetStarted, onDemo }: HeroProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const isContentInView = useInView(contentRef);
  const isImageInView = useInView(imageRef);
  const [flowStep, setFlowStep] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFlowStep((prev) => (prev + 1) % 5);
    }, 1200);

    return () => window.clearInterval(interval);
  }, []);

  const cursorTargets = useMemo(
    () => [
      { left: '84%', top: '53%' }, // Mark as paid button
      { left: '83%', top: '66%' }, // Invoice created row
      { left: '83%', top: '78%' }, // Invoice sent row
      { left: '83%', top: '86%' }, // Email sent row
      { left: '83%', top: '94%' }, // SMS/call row
    ],
    []
  );

  const flowRows = [
    {
      title: 'Invoice sent',
      detail: 'Shared with the customer instantly',
      status: 'Sent',
      icon: ArrowRight,
    },
    {
      title: 'Email sent',
      detail: 'Payment link and receipt delivered',
      status: 'Queued',
      icon: Mail,
    },
    {
      title: 'SMS / call alert',
      detail: 'Reminder triggered automatically',
      status: 'Queued',
      icon: PhoneCall,
    },
  ];

  const features = [
    'Free invoicing for life',
    'Multi-currency support',
    'Real-time payment tracking',
  ];

  return (
    <section className='relative overflow-hidden pt-20 md:pt-32 pb-16 md:pb-24 lg:pb-32 px-4 md:px-6 lg:px-8'>
      {/* Background elements */}
      <div className='absolute top-0 right-0 -z-10 w-96 h-96 bg-[#8B5CF6]/10 rounded-full blur-3xl' />
      <div className='absolute bottom-0 left-0 -z-10 w-96 h-96 bg-[#10B981]/10 rounded-full blur-3xl' />

      <div className='max-w-7xl mx-auto'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center'>
          {/* Left Content */}
          <div
            ref={contentRef}
            className={cn(
              'space-y-6 md:space-y-8 transition-all duration-700',
              isContentInView
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-10'
            )}
          >
            {/* Badge */}
            <div className='inline-flex items-center gap-2 bg-[#F3F4F6] rounded-full px-4 py-2 w-fit'>
              <div className='w-2 h-2 bg-[#10B981] rounded-full animate-pulse' />
              <span className='text-sm font-medium text-[#2C3E50]'>
                Join 10,000+ Businesses
              </span>
            </div>

            {/* Headline */}
            <div className='space-y-4'>
              <h1 className='text-4xl md:text-5xl lg:text-6xl font-bold text-[#2C3E50] leading-tight'>
                Invoicing Made{' '}
                <span className='bg-linear-to-r from-[#596778] to-[#8B5CF6] bg-clip-text text-transparent'>
                  Simple & Fast
                </span>
              </h1>

              <p className='text-lg md:text-xl text-[#4B5563] leading-relaxed'>
                Create, send, and track invoices in seconds. Get paid faster with
                invonotify&apos;s modern invoicing platform designed for businesses of
                all sizes.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className='flex flex-col sm:flex-row gap-3 md:gap-4 pt-4'>
              <Button
                onClick={onGetStarted}
                size='lg'
                variant='default'
                className='group'
              >
                Get Started Free
                <ArrowRight className='w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform' />
              </Button>
              <Button
                onClick={onDemo}
                size='lg'
                variant='secondary'
                className='hidden sm:flex'
              >
                See Demo
              </Button>
            </div>

            {/* Feature List */}
            <div className='space-y-3 pt-6 md:pt-8'>
              {features.map((feature) => (
                <div
                  key={feature}
                  className='flex items-center gap-3 text-[#2C3E50]'
                >
                  <CheckCircle2 className='w-5 h-5 text-[#10B981] shrink-0' />
                  <span className='text-sm md:text-base'>{feature}</span>
                </div>
              ))}
            </div>

          </div>

          {/* Right Image/Illustration */}
          <div
            ref={imageRef}
            className={cn(
              'relative h-96 md:h-125 transition-all duration-700 delay-200',
              isImageInView
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 translate-x-10'
            )}
          >
            {/* Gradient Card */}
            <div className='absolute inset-0 bg-linear-to-br from-[#596778]/10 to-[#8B5CF6]/10 rounded-2xl border border-[#E5E7EB] overflow-hidden'>
              {/* Animated background */}
              <div className='absolute inset-0 bg-grid-pattern opacity-5' />

              {/* Content */}
              <div className='relative h-full flex items-center justify-center p-6 md:p-8'>
                {/* Mock Invoice Card */}
                <div className='relative w-full max-w-[24rem] rounded-3xl border border-[#E5E7EB] bg-white p-5 md:p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] overflow-hidden'>
                  <div className='absolute inset-x-0 top-0 h-1 bg-linear-to-r from-[#10B981] via-[#596778] to-[#8B5CF6]' />

                  {/* Cursor guided workflow */}
                  <motion.div
                    className='pointer-events-none absolute z-20'
                    animate={cursorTargets[flowStep]}
                    transition={{ duration: 0.35, ease: 'easeInOut' }}
                  >
                    <MousePointer2 className='h-5 w-5 -rotate-12 fill-white text-[#1F2937] drop-shadow-lg' />
                    <motion.span
                      key={flowStep}
                      className='absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-[#10B981]/75'
                      initial={{ opacity: 0.8, scale: 0.6 }}
                      animate={{ opacity: 0, scale: 1.8 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                    />
                  </motion.div>

                  <div className='space-y-4'>
                    <div className='flex items-start justify-between gap-4'>
                      <div>
                        <p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[#10B981]'>
                          Invoice Draft
                        </p>
                        <h3 className='mt-1 text-xl font-bold tracking-tight text-[#2C3E50] md:text-[1.35rem]'>
                          Ready for approval
                        </h3>
                        <p className='mt-1 text-sm text-[#8691A6]'>Due on selected date</p>
                      </div>
                      <div className='rounded-full bg-[#10B981]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#10B981]'>
                        Live
                      </div>
                    </div>

                    <div className='rounded-2xl border border-[#E5E7EB] bg-[#FAFBFC] p-4 space-y-3'>
                      <div className='flex items-center justify-between rounded-xl bg-white px-3 py-2.5 shadow-sm animate-hero-row'>
                        <div>
                          <p className='text-sm font-medium text-[#2C3E50]'>Web Development</p>
                          <p className='text-xs text-[#8691A6]'>Design, build, and deploy</p>
                        </div>
                        <span className='text-sm font-semibold text-[#2C3E50]'>₹18,000</span>
                      </div>

                      <div className='flex items-center justify-between rounded-xl bg-white px-3 py-2.5 shadow-sm animate-hero-row [animation-delay:320ms]'>
                        <div>
                          <p className='text-sm font-medium text-[#2C3E50]'>Design Services</p>
                          <p className='text-xs text-[#8691A6]'>Brand and UI support</p>
                        </div>
                        <span className='text-sm font-semibold text-[#2C3E50]'>₹7,500</span>
                      </div>
                    </div>

                    <div className='flex items-end justify-between rounded-2xl bg-[#F9FAFB] px-4 py-3'>
                      <div>
                        <span className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8691A6]'>
                          Total due
                        </span>
                        <p className='mt-1 text-2xl font-bold text-[#111827]'>₹25,500</p>
                      </div>
                      <span className='pb-1 text-sm font-semibold text-[#596778] animate-hero-total'>
                        Updated instantly
                      </span>
                    </div>

                    <button className='w-full rounded-xl bg-[#10B981] py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.28)] transition-colors hover:bg-[#0ea472]'>
                      Mark as Paid
                    </button>

                    <motion.div
                      className='rounded-2xl border border-[#DDE7F0] bg-[#F8FBFF] p-3 shadow-sm'
                      initial={{ opacity: 0.7, y: 8 }}
                      animate={{
                        opacity: flowStep >= 0 ? 1 : 0,
                        y: flowStep >= 0 ? 0 : 8,
                      }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    >
                      <div className='flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm'>
                        <div className='flex h-8 w-8 items-center justify-center rounded-full bg-[#10B981]/10 ring-4 ring-[#F8FBFF]'>
                          <CheckCircle2 className='h-4 w-4 text-[#10B981]' />
                        </div>
                        <div className='min-w-0 flex-1'>
                          <p className='text-sm font-medium text-[#2C3E50]'>Bill created</p>
                          <p className='text-xs text-[#8691A6]'>Draft generated and ready to send</p>
                        </div>
                        <span className='text-xs font-semibold text-[#10B981]'>Created</span>
                      </div>
                    </motion.div>

                    <AnimatePresence mode='wait'>
                      {flowStep >= 1 && (
                        <motion.div
                          key='flow-panel'
                          className='rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4'
                          initial={{ opacity: 0, y: 16, filter: 'blur(3px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                        >
                      <div className='flex items-center justify-between'>
                        <p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8691A6]'>
                          System flow
                        </p>
                        <span className='text-[10px] font-semibold uppercase tracking-wide text-[#10B981]'>
                          Auto synced
                        </span>
                      </div>

                      <div className='mt-4 space-y-2'>
                        {flowRows.map((row, index) => {
                          const Icon = row.icon;
                          const isActive = flowStep >= index + 2;

                          return (
                            <motion.div
                              key={row.title}
                              className='flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm'
                              initial={{ opacity: 0.55, x: 8 }}
                              animate={{
                                opacity: isActive ? 1 : 0.6,
                                x: isActive ? 0 : 8,
                                boxShadow: isActive
                                  ? '0 8px 24px rgba(16, 185, 129, 0.14)'
                                  : '0 1px 2px rgba(15, 23, 42, 0.08)',
                              }}
                              transition={{ duration: 0.28, ease: 'easeOut' }}
                            >
                              <div
                                className={cn(
                                  'flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-[#F8FAFC]',
                                  isActive ? 'bg-[#10B981]/12' : 'bg-[#596778]/10'
                                )}
                              >
                                <Icon
                                  className={cn(
                                    'h-4 w-4',
                                    isActive ? 'text-[#10B981]' : 'text-[#596778]'
                                  )}
                                />
                              </div>
                              <div className='min-w-0 flex-1'>
                                <p className='text-sm font-medium text-[#2C3E50]'>{row.title}</p>
                                <p className='text-xs text-[#8691A6]'>{row.detail}</p>
                              </div>
                              <span
                                className={cn(
                                  'text-xs font-semibold',
                                  isActive ? 'text-[#10B981]' : 'text-[#596778]'
                                )}
                              >
                                {row.status}
                              </span>
                            </motion.div>
                          );
                        })}
                      </div>

                      <div className='mt-3 h-7 overflow-hidden rounded-full border border-[#E5E7EB] bg-white'>
                        <div className='flex h-full w-full items-center justify-between px-3 text-[11px] font-medium text-[#2C3E50]'>
                          <span>Invoice #INV-2841</span>
                          <span className='text-[#10B981]'>{flowStep >= 4 ? 'Delivered' : 'Sending'}</span>
                        </div>
                        <div
                          className={cn(
                            'pointer-events-none relative -mt-7 h-full w-28 rounded-full bg-[#111827] text-center text-[10px] font-semibold leading-7 text-white shadow-lg',
                            flowStep >= 2 ? 'animate-hero-flow-card' : 'opacity-0'
                          )}
                        >
                          Sending...
                        </div>
                      </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Floating Elements */}
                <div className='absolute top-8 -right-4 w-24 h-24 bg-[#10B981]/20 rounded-lg blur-xl animate-pulse' />
                <div className='absolute bottom-8 -left-4 w-32 h-32 bg-[#8B5CF6]/20 rounded-lg blur-xl animate-pulse' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
