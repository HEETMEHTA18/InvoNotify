import React from 'react';

/**
 * Animation configuration for InvoiceFlow landing page
 * All animations follow the design specification timing functions
 */

export const animations = {
  // Timing functions
  timings: {
    fast: '150ms',
    standard: '200ms',
    slow: '300ms',
    verySlow: '500ms',
  },

  // Easing functions
  easing: {
    easeOut: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  },

  // Common animation keyframes
  keyframes: {
    fadeIn: `@keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }`,

    slideUp: `@keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(20px);
      }
      to { 
        opacity: 1;
        transform: translateY(0);
      }
    }`,

    slideDown: `@keyframes slideDown {
      from { 
        opacity: 0;
        transform: translateY(-20px);
      }
      to { 
        opacity: 1;
        transform: translateY(0);
      }
    }`,

    slideInLeft: `@keyframes slideInLeft {
      from { 
        opacity: 0;
        transform: translateX(-30px);
      }
      to { 
        opacity: 1;
        transform: translateX(0);
      }
    }`,

    slideInRight: `@keyframes slideInRight {
      from { 
        opacity: 0;
        transform: translateX(30px);
      }
      to { 
        opacity: 1;
        transform: translateX(0);
      }
    }`,

    scaleIn: `@keyframes scaleIn {
      from { 
        opacity: 0;
        transform: scale(0.95);
      }
      to { 
        opacity: 1;
        transform: scale(1);
      }
    }`,

    pulse: `@keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }`,

    shimmer: `@keyframes shimmer {
      0% {
        background-position: -1000px 0;
      }
      100% {
        background-position: 1000px 0;
      }
    }`,

    float: `@keyframes float {
      0%, 100% {
        transform: translateY(0px);
      }
      50% {
        transform: translateY(-10px);
      }
    }`,
  },
};

/**
 * Hook to respect user's motion preferences
 * Returns true if user prefers reduced motion
 */
export function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReduced;
}

/**
 * Tailwind CSS class combinations for common animations
 */
export const animationClasses = {
  fadeIn: 'animate-in fade-in duration-300',
  slideUp: 'animate-in slide-in-from-bottom-5 duration-300',
  slideDown: 'animate-in slide-in-from-top-5 duration-300',
  slideInLeft: 'animate-in slide-in-from-left-5 duration-300',
  slideInRight: 'animate-in slide-in-from-right-5 duration-300',
  scaleIn: 'animate-in zoom-in-50 duration-300',
  pulse: 'animate-pulse',
};

/**
 * Intersection Observer hook for scroll animations
 */
export function useInView(
  ref: React.RefObject<Element | null>,
  options = {}
) {
  const [isInView, setIsInView] = React.useState(false);

  React.useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        // Stop observing once element is in view
        observer.unobserve(entry.target);
      }
    }, {
      threshold: 0.1,
      ...options,
    });

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, options]);

  return isInView;
}
