'use client';

import React, { useRef } from 'react';
import Accordion from './Accordion';
import { useInView } from '@/lib/animations';
import { cn } from '@/lib/utils';

export default function FAQ() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref);

  const faqItems = [
    {
      id: 'free',
      title: 'Is Invonotify really free?',
      content:
        'Yes! Invonotify offers a generous free plan that includes unlimited invoices, basic templates, and email delivery. Our Pro plan includes advanced features like payment processing, priority support, and custom branding.',
    },
    {
      id: 'payment',
      title: 'What payment methods do you support?',
      content:
        'We support all major payment methods including credit cards, bank transfers, PayPal, Stripe, and digital wallets. You can accept payments directly through your invoices in 150+ currencies.',
    },
    {
      id: 'security',
      title: 'How secure is my data?',
      content:
        'Your data is protected with 256-bit encryption and stored on secure AWS servers. We comply with GDPR, SOC 2 Type II, and all major security standards. All communication is encrypted and we perform regular security audits.',
    },
    {
      id: 'export',
      title: 'Can I export my data?',
      content:
        'Yes! You can export your invoices, clients, and financial data in CSV, PDF, or Excel formats at any time. You own your data and can migrate away whenever you want.',
    },
    {
      id: 'integration',
      title: 'Does Invonotify integrate with other tools?',
      content:
        'Yes, Invonotify integrates with Slack, PipeDrive, Zapier, QuickBooks, Xero, Wave, and many other popular business tools. Check our integrations page for the full list and setup guides.',
    },
    {
      id: 'recurring',
      title: 'Can I create recurring invoices?',
      content:
        'Absolutely! You can set up recurring invoices that automatically generate on a daily, weekly, monthly, or custom schedule. Perfect for subscription-based businesses or retainer clients.',
    },
    {
      id: 'support',
      title: 'What kind of support do you offer?',
      content:
        'All users get access to our knowledge base and community forum. Pro and Enterprise users get priority email and chat support. Enterprise users also get a dedicated account manager.',
    },
    {
      id: 'trial',
      title: 'Do you offer a trial period?',
      content:
        'You don\'t need a trial - our free plan includes most features! You can use invonotify for free. The Pro plan offers a free trial with full access to all features.',
    },
  ];

  return (
    <section ref={ref} className='py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8'>
      <div className='max-w-4xl mx-auto'>
        {/* Section Header */}
        <div
          className={cn(
            'text-center space-y-4 md:space-y-6 mb-12 md:mb-16 lg:mb-20 transition-all duration-700',
            isInView
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-8'
          )}
        >
          <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold text-[#2C3E50]'>
            Frequently Asked Questions
          </h2>
          <p className='text-lg md:text-xl text-[#4B5563] max-w-2xl mx-auto'>
            Find answers to common questions about invonotify. Can&apos;t find what you&apos;re
            looking for? Contact our support team.
          </p>
        </div>

        {/* Accordion */}
        <div
          className={cn(
            'transition-all duration-700 delay-200',
            isInView
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-8'
          )}
        >
          <Accordion items={faqItems} allowMultiple={false} />
        </div>

        {/* Bottom CTA */}
        <div
          className={cn(
            'mt-12 md:mt-16 lg:mt-20 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] p-6 md:p-8 text-center transition-all duration-700 delay-400',
            isInView
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-8'
          )}
        >
          <h3 className='text-xl md:text-2xl font-bold text-[#2C3E50] mb-2'>
            Still have questions?
          </h3>
          <p className='text-[#4B5563] text-base md:text-lg mb-6'>
            Can&apos;t find the answer you&apos;re looking for? Our team is here to help.
          </p>
          <div className='flex flex-col sm:flex-row gap-3 justify-center'>
            <a
              href='/register'
              className='inline-flex items-center justify-center gap-2 bg-[#596778] text-white px-6 md:px-8 py-3 md:py-4 rounded-lg font-semibold hover:bg-[#4a5568] transition-colors'
            >
              Email Support
            </a>
            <a
              href='/register'
              className='inline-flex items-center justify-center gap-2 border border-[#8691A6] text-[#596778] px-6 md:px-8 py-3 md:py-4 rounded-lg font-semibold hover:bg-[#F3F4F6] transition-colors'
            >
              Live Chat
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
