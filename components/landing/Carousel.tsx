'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CarouselProps {
  children: React.ReactNode[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showDots?: boolean;
  showArrows?: boolean;
  onSlideChange?: (index: number) => void;
}

export default function Carousel({
  children,
  autoPlay = true,
  autoPlayInterval = 5000,
  showDots = true,
  showArrows = true,
  onSlideChange,
}: CarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(autoPlay);

  const totalSlides = React.Children.count(children);

  const goToSlide = useCallback((index: number) => {
    const newIndex = ((index % totalSlides) + totalSlides) % totalSlides;
    setCurrentSlide(newIndex);
    onSlideChange?.(newIndex);
  }, [onSlideChange, totalSlides]);

  const nextSlide = useCallback(() => goToSlide(currentSlide + 1), [currentSlide, goToSlide]);
  const prevSlide = useCallback(() => goToSlide(currentSlide - 1), [currentSlide, goToSlide]);

  useEffect(() => {
    if (!isAutoPlay) return;

    const interval = setInterval(() => {
      goToSlide(currentSlide + 1);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [currentSlide, isAutoPlay, autoPlayInterval, goToSlide]);

  return (
    <div
      className='w-full'
      onMouseEnter={() => setIsAutoPlay(false)}
      onMouseLeave={() => setIsAutoPlay(autoPlay)}
    >
      {/* Slides Container */}
      <div className='relative overflow-hidden rounded-lg'>
        <div className='relative h-full'>
          {React.Children.map(children, (child, index) => (
            <div
              key={index}
              className={cn(
                'absolute inset-0 transition-all duration-500 ease-out',
                index === currentSlide
                  ? 'opacity-100 translate-x-0'
                  : index < currentSlide
                    ? 'opacity-0 translate-x-full'
                    : 'opacity-0 -translate-x-full'
              )}
            >
              {child}
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        {showArrows && totalSlides > 1 && (
          <>
            <button
              onClick={prevSlide}
              className='absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white text-[#596778] rounded-full p-2 md:p-3 transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]'
              aria-label='Previous slide'
            >
              <ChevronLeft className='w-5 h-5 md:w-6 md:h-6' />
            </button>
            <button
              onClick={nextSlide}
              className='absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white text-[#596778] rounded-full p-2 md:p-3 transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]'
              aria-label='Next slide'
            >
              <ChevronRight className='w-5 h-5 md:w-6 md:h-6' />
            </button>
          </>
        )}
      </div>

      {/* Dot Indicators */}
      {showDots && totalSlides > 1 && (
        <div className='flex justify-center gap-2 mt-6 md:mt-8'>
          {Array.from({ length: totalSlides }).map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={cn(
                'w-2 h-2 md:w-3 md:h-3 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B5CF6]',
                index === currentSlide ? 'bg-[#596778] w-8 md:w-10' : 'bg-[#E5E7EB] hover:bg-[#8691A6]'
              )}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === currentSlide}
            />
          ))}
        </div>
      )}
    </div>
  );
}
