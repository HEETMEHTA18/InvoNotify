'use client';

import React, { useRef } from 'react';
import {
  FileText,
  Globe,
  CreditCard,
  Lock,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInView } from '@/lib/animations';

interface Feature {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

export default function Features() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref);

  const features: Feature[] = [
    {
      id: 'invoicing',
      icon: <FileText className='w-8 h-8 md:w-10 md:h-10' />,
      title: 'Professional Invoices',
      description:
        'Create beautiful, branded invoices in seconds with customizable templates that impress clients.',
      color: '#3B82F6',
    },
    {
      id: 'multicurrency',
      icon: <Globe className='w-8 h-8 md:w-10 md:h-10' />,
      title: 'Multi-Currency Support',
      description:
        'Accept payments in 150+ currencies with real-time exchange rates and automatic conversion.',
      color: '#8B5CF6',
    },
    {
      id: 'payments',
      icon: <CreditCard className='w-8 h-8 md:w-10 md:h-10' />,
      title: 'Payment Tracking',
      description:
        'Track payment status in real-time, set automatic reminders, and get paid faster.',
      color: '#10B981',
    },
    {
      id: 'security',
      icon: <Lock className='w-8 h-8 md:w-10 md:h-10' />,
      title: 'Bank-Level Security',
      description:
        'Your data is protected with 256-bit encryption and regular security audits.',
      color: '#F97316',
    },
    {
      id: 'automation',
      icon: <Clock className='w-8 h-8 md:w-10 md:h-10' />,
      title: 'Smart Automation',
      description:
        'Automate recurring invoices, payment reminders, and follow-ups to save time.',
      color: '#FBBF24',
    },
    {
      id: 'analytics',
      icon: <TrendingUp className='w-8 h-8 md:w-10 md:h-10' />,
      title: 'Detailed Analytics',
      description:
        'Get insights into your revenue, outstanding payments, and business metrics.',
      color: '#06B6D4',
    },
  ];

  return (
    <section ref={ref} className='py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8 bg-[#FAFAFA]'>
      <div className='max-w-7xl mx-auto'>
        {/* Section Header */}
        <div className='text-center space-y-4 md:space-y-6 mb-12 md:mb-16 lg:mb-20'>
          <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold text-[#2C3E50]'>
            Everything You Need
          </h2>
          <p className='text-lg md:text-xl text-[#4B5563] max-w-2xl mx-auto'>
            Powerful features designed to streamline your invoicing and help you
            get paid faster
          </p>
        </div>

        {/* Features Grid */}
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8'>
          {features.map((feature, index) => (
            <div
              key={feature.id}
              className={cn(
                'bg-white rounded-xl p-6 md:p-8 border border-[#E5E7EB] hover:border-[#8691A6] transition-all duration-300 hover:shadow-xl hover:-translate-y-2 group',
                isInView
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8',
              )}
              style={{
                transitionDelay: isInView ? `${index * 100}ms` : '0ms',
              }}
            >
              {/* Icon Container */}
              <div
                className='w-12 h-12 md:w-14 md:h-14 rounded-lg flex items-center justify-center mb-4 md:mb-6 transition-all duration-300 group-hover:scale-110'
                style={{
                  backgroundColor: `${feature.color}15`,
                  color: feature.color,
                }}
              >
                {feature.icon}
              </div>

              {/* Content */}
              <h3 className='text-xl md:text-lg font-bold text-[#2C3E50] mb-2 md:mb-3'>
                {feature.title}
              </h3>
              <p className='text-[#4B5563] text-sm md:text-base leading-relaxed'>
                {feature.description}
              </p>

              {/* Decorative bottom line */}
              <div
                className='absolute bottom-0 left-0 h-1 w-0 group-hover:w-full transition-all duration-300 rounded-b-lg'
                style={{ backgroundColor: feature.color }}
              />
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className='text-center mt-12 md:mt-16 lg:mt-20'>
          <p className='text-[#4B5563] text-base md:text-lg mb-4'>
            Want to see all features?
          </p>
          <a
            href='/register'
            className='inline-flex items-center gap-2 text-[#596778] font-semibold hover:text-[#8B5CF6] transition-colors'
          >
            Explore Full Feature List
            <span className='text-xl'>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
