'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionItem {
  id: string;
  title: string;
  content: string | React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  className?: string;
}

export default function Accordion({
  items,
  allowMultiple = false,
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    const newOpenItems = new Set(openItems);

    if (newOpenItems.has(id)) {
      newOpenItems.delete(id);
    } else {
      if (!allowMultiple) {
        newOpenItems.clear();
      }
      newOpenItems.add(id);
    }

    setOpenItems(newOpenItems);
  };

  return (
    <div className={cn('space-y-3 md:space-y-4', className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className='border border-[#E5E7EB] rounded-lg overflow-hidden hover:border-[#8691A6] transition-colors'
        >
          <button
            onClick={() => toggleItem(item.id)}
            className='w-full px-5 md:px-6 py-4 md:py-5 flex items-center justify-between bg-white hover:bg-[#F9FAFB] transition-colors text-left'
            aria-expanded={openItems.has(item.id)}
            aria-controls={`accordion-content-${item.id}`}
          >
            <span className='font-semibold text-[#2C3E50] text-base md:text-lg'>
              {item.title}
            </span>
            <ChevronDown
              className={cn(
                'w-5 h-5 md:w-6 md:h-6 shrink-0 text-[#596778] transition-transform duration-200',
                openItems.has(item.id) && 'transform rotate-180'
              )}
              aria-hidden='true'
            />
          </button>

          {openItems.has(item.id) && (
            <div
              id={`accordion-content-${item.id}`}
              className='px-5 md:px-6 py-4 md:py-5 bg-[#F9FAFB] border-t border-[#E5E7EB] text-[#4B5563] text-sm md:text-base leading-relaxed'
            >
              {typeof item.content === 'string' ? (
                <p>{item.content}</p>
              ) : (
                item.content
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
