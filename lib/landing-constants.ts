/**
 * Landing Page Constants
 * Central configuration for colors, spacing, and animations
 */

// Color Palette
export const colors = {
  primary: '#596778',      // Slate Blue
  secondary: '#8691A6',    // Slate Gray
  accent: '#10B981',       // Brand Green
  accentBlue: '#3B82F6',   // Brand Blue
  accentPurple: '#8B5CF6', // Brand Purple
  accentOrange: '#F97316', // Warm Orange
  accentYellow: '#FBBF24', // Warm Yellow
  accentCyan: '#06B6D4',   // Cyan

  // Semantic Colors
  error: '#EF4444',
  warning: '#FBBF24',
  success: '#10B981',
  info: '#3B82F6',

  // Grayscale
  white: '#FFFFFF',
  dark: '#2C3E50',
  darkGray: '#4B5563',
  mediumGray: '#4B5563',
  lightGray: '#F3F4F6',
  borderGray: '#E5E7EB',
  pageBackground: '#FAFAFA',
  darkBackground: '#1F2937',
};

// Typography
export const typography = {
  fontFamily: {
    primary: [
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'sans-serif',
    ],
    mono: ['Fira Code', 'Monaco', 'monospace'],
  },

  sizes: {
    h1: { size: '48px', lineHeight: '1.2', weight: 700 },
    h2: { size: '36px', lineHeight: '1.3', weight: 700 },
    h3: { size: '28px', lineHeight: '1.4', weight: 600 },
    h4: { size: '24px', lineHeight: '1.5', weight: 600 },
    bodyLarge: { size: '18px', lineHeight: '1.6', weight: 400 },
    body: { size: '16px', lineHeight: '1.6', weight: 400 },
    bodySmall: { size: '14px', lineHeight: '1.5', weight: 400 },
    label: { size: '12px', lineHeight: '1.4', weight: 500 },
    button: { size: '14px', lineHeight: '1.5', weight: 600 },
  },
};

// Spacing Scale (8px base)
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
  '4xl': '80px',
};

// Animations & Transitions
export const animations = {
  timings: {
    fast: '150ms',
    standard: '200ms',
    slow: '300ms',
    verySlow: '500ms',
  },

  easing: {
    easeOut: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  },

  // Transition classes
  transitions: {
    fast: 'transition-all duration-150',
    standard: 'transition-all duration-200',
    slow: 'transition-all duration-300',
  },
};

// Component Sizes
export const componentSizes = {
  icon: {
    sm: '16px',
    md: '24px',
    lg: '40px',
  },

  button: {
    sm: '32px',
    md: '40px',
    lg: '48px',
  },

  avatar: {
    sm: '32px',
    md: '40px',
    lg: '48px',
  },

  card: {
    minWidth: '300px',
    maxWidth: '400px',
  },
};

// Breakpoints
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
};

// Shadow Depths
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
};

// Z-Index Scale
export const zIndex = {
  base: 0,
  dropdown: 20,
  sticky: 30,
  modal: 40,
  notification: 50,
};

// Content
export const content = {
  company: 'invonotify',
  tagline: 'Modern invoicing for growing businesses',
  description:
    'Create, send, and track invoices in seconds. Get paid faster with our intuitive invoicing platform.',

  navLinks: [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'FAQ', href: '#faq' },
  ],

  social: {
    twitter: 'https://twitter.com/invonotify',
    linkedin: 'https://linkedin.com/company/invonotify',
    github: 'https://github.com/invonotify',
    facebook: 'https://facebook.com/invonotify',
  },

  contact: {
    email: 'hello@invonotify.com',
    supportEmail: 'support@invonotify.com',
  },
};

// Responsive Text Classes
export const responsiveText = {
  h1: 'text-3xl md:text-4xl lg:text-5xl',
  h2: 'text-2xl md:text-3xl lg:text-4xl',
  h3: 'text-xl md:text-2xl lg:text-3xl',
  h4: 'text-lg md:text-xl lg:text-2xl',
  bodyLarge: 'text-base md:text-lg lg:text-xl',
  body: 'text-sm md:text-base lg:text-base',
  bodySmall: 'text-xs md:text-sm lg:text-sm',
};

// Responsive Padding Classes
export const responsivePadding = {
  section: {
    vertical: 'py-12 md:py-16 lg:py-20',
    horizontal: 'px-4 md:px-6 lg:px-8',
  },
  component: {
    sm: 'p-3 md:p-4',
    md: 'p-4 md:p-6 lg:p-8',
    lg: 'p-6 md:p-8 lg:p-12',
  },
};

// Gradient Classes
export const gradients = {
  primary: 'from-[#596778] to-[#8B5CF6]',
  secondary: 'from-[#8B5CF6] to-[#10B981]',
  dark: 'from-[#2C3E50] to-[#596778]',
  subtle: 'from-[#596778]/5 to-[#8B5CF6]/5',
};

// Button Variants
export const buttonVariants = {
  primary: {
    bg: 'bg-[#596778]',
    hover: 'hover:bg-[#4a5568]',
    active: 'active:bg-[#3d4657]',
    text: 'text-white',
    focus: 'focus-visible:ring-[#8B5CF6]',
  },

  secondary: {
    bg: 'bg-[#F3F4F6]',
    border: 'border border-[#8691A6]',
    hover: 'hover:bg-[#E5E7EB]',
    text: 'text-[#596778]',
    focus: 'focus-visible:ring-[#8B5CF6]',
  },

  tertiary: {
    text: 'text-[#596778]',
    hover: 'hover:underline hover:text-[#4a5568]',
    focus: 'focus-visible:ring-[#8B5CF6]',
  },
};

// Feature Card Styles
export const cardStyles = {
  base: 'rounded-lg bg-white border border-[#E5E7EB]',
  hover: 'hover:border-[#8691A6] hover:shadow-lg hover:-translate-y-2',
  padding: 'p-4 md:p-6 lg:p-8',
};

// API Routes (for future use)
export const apiRoutes = {
  auth: '/api/auth',
  users: '/api/users',
  customers: '/api/customers',
  invoices: '/api/invoices',
  payments: '/api/payments',
  settings: '/api/settings',
};

// Feature Flags (for future use)
export const features = {
  enablePaymentProcessing: true,
  enableRecurringInvoices: true,
  enableAutomation: true,
  enableTeams: false,
  enableApiAccess: false,
};
