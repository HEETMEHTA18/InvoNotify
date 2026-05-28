'use client';

import React, { useRef } from 'react';
import { Star } from 'lucide-react';
import Carousel from './Carousel';
import { useInView } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface Testimonial {
  id: string;
  name: string;
  title: string;
  company: string;
  content: string;
  rating: number;
  avatar: string;
}

export default function Testimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref);

  const testimonials: Testimonial[] = [
    {
      id: '1',
      name: 'Sarah Johnson',
      title: 'Founder & CEO',
      company: 'Tech Startup Co',
      content:
        "InvoiceFlow has been a game-changer for our business. We've cut our invoicing time by 80% and get paid significantly faster. The interface is intuitive and the customer support is outstanding.",
      rating: 5,
      avatar: 'SJ',
    },
    {
      id: '2',
      name: 'Michael Chen',
      title: 'Freelance Designer',
      company: 'Self-employed',
      content:
        "As a freelancer, I needed something simple yet powerful. InvoiceFlow delivers exactly that. Multi-currency support and automatic reminders have made my life so much easier.",
      rating: 5,
      avatar: 'MC',
    },
    {
      id: '3',
      name: 'Emma Wilson',
      title: 'Operations Manager',
      company: 'Digital Agency',
      content:
        'The analytics dashboard gives us real-time insights into our cash flow. We can now track outstanding payments at a glance. Highly recommended for agencies.',
      rating: 5,
      avatar: 'EW',
    },
    {
      id: '4',
      name: 'David Rodriguez',
      title: 'Business Owner',
      company: 'Consulting Firm',
      content:
        "We've been using InvoiceFlow for 6 months now. The ROI is incredible. We invoice more clients, get paid faster, and have more time to focus on growing our business.",
      rating: 5,
      avatar: 'DR',
    },
  ];

  const TestimonialCard = ({ testimonial }: { testimonial: Testimonial }) => (
    <div className='bg-white rounded-xl p-6 md:p-8 border border-[#E5E7EB] h-full flex flex-col'>
      {/* Stars */}
      <div className='flex gap-1 mb-4'>
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star
            key={i}
            className='w-4 h-4 md:w-5 md:h-5 fill-[#FBBF24] text-[#FBBF24]'
          />
        ))}
      </div>

      {/* Quote */}
      <p className='text-[#4B5563] text-base md:text-lg leading-relaxed mb-6 md:mb-8 grow'>
        &ldquo;{testimonial.content}&rdquo;
      </p>

      {/* Author */}
      <div className='flex items-center gap-3 md:gap-4 pt-4 md:pt-6 border-t border-[#E5E7EB]'>
        <div className='w-10 h-10 md:w-12 md:h-12 rounded-full bg-linear-to-br from-[#596778] to-[#8B5CF6] flex items-center justify-center text-white font-bold text-sm md:text-base'>
          {testimonial.avatar}
        </div>
        <div>
          <h4 className='font-semibold text-[#2C3E50] text-sm md:text-base'>
            {testimonial.name}
          </h4>
          <p className='text-xs md:text-sm text-[#8691A6]'>
            {testimonial.title} at {testimonial.company}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <section
      id='testimonials'
      ref={ref}
      className='py-16 md:py-24 lg:py-32 px-4 md:px-6 lg:px-8 bg-[#FAFAFA]'
    >
      <div className='max-w-7xl mx-auto'>
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
            Loved by Our Users
          </h2>
          <p className='text-lg md:text-xl text-[#4B5563] max-w-2xl mx-auto'>
            See what customers are saying about InvoiceFlow
          </p>
        </div>

        {/* Testimonials Carousel */}
        <div
          className={cn(
            'transition-all duration-700 delay-200',
            isInView
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-8'
          )}
        >
          <Carousel
            autoPlay={true}
            autoPlayInterval={5000}
            showDots={true}
            showArrows={true}
          >
            {testimonials.map((testimonial) => (
              <div key={testimonial.id} className='px-4 md:px-0'>
                <TestimonialCard testimonial={testimonial} />
              </div>
            ))}
          </Carousel>
        </div>

        {/* Social Proof Stats */}
        <div className='mt-12 md:mt-16 lg:mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center'>
          {[
            { number: '4.9', label: 'Average Rating', unit: '/5' },
            { number: '2.5K+', label: 'Reviews' },
            { number: '98%', label: 'Satisfaction Rate' },
            { number: '24/7', label: 'Support' },
          ].map((stat, index) => (
            <div
              key={index}
              className={cn(
                'transition-all duration-700',
                isInView
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-8'
              )}
              style={{
                transitionDelay: isInView ? `${400 + index * 100}ms` : '0ms',
              }}
            >
              <div className='text-2xl md:text-3xl font-bold text-[#596778] mb-1 md:mb-2'>
                {stat.number}
                {stat.unit && <span className='text-lg md:text-xl'>{stat.unit}</span>}
              </div>
              <p className='text-sm md:text-base text-[#4B5563]'>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
