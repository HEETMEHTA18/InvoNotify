'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/landing/Header';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import HowItWorks from '@/components/landing/HowItWorks';
import FAQ from '@/components/landing/FAQ';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  const router = useRouter();

  const handleGetStarted = () => {
    router.push('/register');
  };

  const handleDemo = () => {
    router.push('/register');
  };

  return (
    <div className='flex flex-col min-h-screen bg-white'>
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className='flex-1 pt-16 md:pt-20'>
        {/* Hero Section */}
        <Hero onGetStarted={handleGetStarted} onDemo={handleDemo} />

        {/* Features Section */}
        <section id='features'>
          <Features />
        </section>

        {/* How It Works Section */}
        <section id='how-it-works'>
          <HowItWorks />
        </section>

        {/* FAQ Section */}
        <section id='faq'>
          <FAQ />
        </section>

      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
