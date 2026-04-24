"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  AnimatePresence,
  type HTMLMotionProps,
  type SpringOptions,
} from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cx(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type MouseTrackerContextType = {
  position: { x: number; y: number };
  active: boolean;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  pointerRef: React.RefObject<HTMLDivElement | null>;
};

const MouseTrackerContext = React.createContext<MouseTrackerContextType | undefined>(
  undefined
);

export const useMouseTracker = (): MouseTrackerContextType => {
  const context = React.useContext(MouseTrackerContext);
  if (!context) {
    throw new Error("useMouseTracker must be used within MouseTrackerProvider");
  }
  return context;
};

export type MouseTrackerProviderProps = React.ComponentProps<"div"> & {
  children: React.ReactNode;
};

export const MouseTrackerProvider = React.forwardRef<
  HTMLDivElement,
  MouseTrackerProviderProps
>(function MouseTrackerProvider({ children, ...rest }, ref) {
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [active, setActive] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const pointerRef = React.useRef<HTMLDivElement>(null);
  const { style: restStyle, ...divRest } = rest;

  React.useImperativeHandle(ref, () => wrapperRef.current as HTMLDivElement);

  React.useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const container = wrapper.parentElement;
    if (!container) return;

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    const updatePosition = (e: MouseEvent) => {
      const bounds = container.getBoundingClientRect();
      setPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
      setActive(true);
    };

    const clearPosition = () => setActive(false);

    container.addEventListener("mousemove", updatePosition);
    container.addEventListener("mouseleave", clearPosition);

    return () => {
      container.removeEventListener("mousemove", updatePosition);
      container.removeEventListener("mouseleave", clearPosition);
    };
  }, []);

  return (
    <MouseTrackerContext.Provider
      value={{ position, active, wrapperRef, pointerRef }}
    >
      <div
        ref={wrapperRef}
        data-role="tracker-wrapper"
        style={{ ...restStyle, cursor: active ? "none" : restStyle?.cursor }}
        {...divRest}
      >
        {children}
      </div>
    </MouseTrackerContext.Provider>
  );
});

export type PointerProps = HTMLMotionProps<"div"> & {
  children: React.ReactNode;
};

export const Pointer = React.forwardRef<HTMLDivElement, PointerProps>(
  function Pointer({ className, style, children, ...rest }, ref) {
    const { position, active, pointerRef } = useMouseTracker();

    React.useImperativeHandle(ref, () => pointerRef.current as HTMLDivElement);

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    React.useEffect(() => {
      x.set(position.x);
      y.set(position.y);
    }, [position, x, y]);

    return (
      <AnimatePresence>
        {active && (
          <motion.div
            ref={pointerRef}
            data-role="custom-pointer"
            className={cx(
              "pointer-events-none z-9999 absolute transform -translate-x-1/2 -translate-y-1/2",
              className
            )}
            style={{ top: y, left: x, ...style }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            {...rest}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

export type Anchor =
  | "top"
  | "top-left"
  | "top-right"
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "left"
  | "right"
  | "center";

export type PointerFollowerProps = HTMLMotionProps<"div"> & {
  align?: Anchor;
  gap?: number;
  transition?: SpringOptions;
  children: React.ReactNode;
};

export const PointerFollower = React.forwardRef<
  HTMLDivElement,
  PointerFollowerProps
>(function PointerFollower(
  {
    align = "bottom-right",
    gap = 20,
    transition = { stiffness: 500, damping: 50, bounce: 0 },
    children,
    className,
    style,
    ...rest
  },
  ref
) {
  const { position, active, pointerRef } = useMouseTracker();
  const followerRef = React.useRef<HTMLDivElement>(null);
  const [pointerSize, setPointerSize] = React.useState({ width: 20, height: 20 });
  const [followerSize, setFollowerSize] = React.useState({ width: 0, height: 0 });

  React.useImperativeHandle(ref, () => followerRef.current as HTMLDivElement);

  React.useLayoutEffect(() => {
    if (!active) return;

    const updateSizes = () => {
      const pointerBox = pointerRef.current?.getBoundingClientRect();
      const followerBox = followerRef.current?.getBoundingClientRect();

      setPointerSize({
        width: pointerBox?.width ?? 20,
        height: pointerBox?.height ?? 20,
      });
      setFollowerSize({
        width: followerBox?.width ?? 0,
        height: followerBox?.height ?? 0,
      });
    };

    updateSizes();

    const resizeObserver = new ResizeObserver(updateSizes);
    if (pointerRef.current) resizeObserver.observe(pointerRef.current);
    if (followerRef.current) resizeObserver.observe(followerRef.current);

    return () => resizeObserver.disconnect();
  }, [active, pointerRef]);

  const offset = (() => {
    const w = followerSize.width;
    const h = followerSize.height;

    switch (align) {
      case "center":
        return { x: w / 2, y: h / 2 };
      case "top":
        return { x: w / 2, y: h + gap };
      case "top-left":
        return { x: w + gap, y: h + gap };
      case "top-right":
        return { x: -gap, y: h + gap };
      case "bottom":
        return { x: w / 2, y: -gap };
      case "bottom-left":
        return { x: w + gap, y: -gap };
      case "bottom-right":
        return { x: -gap, y: -gap };
      case "left":
        return { x: w + gap, y: h / 2 };
      case "right":
        return { x: -gap, y: h / 2 };
      default:
        return { x: 0, y: 0 };
    }
  })();

  const pw = pointerSize.width;
  const ph = pointerSize.height;

  const x = position.x - offset.x + pw / 2;
  const y = position.y - offset.y + ph / 2;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          ref={followerRef}
          data-role="pointer-follower"
          className={cx(
            "pointer-events-none z-9998 absolute transform -translate-x-1/2 -translate-y-1/2 font-medium",
            className
          )}
          style={{ top: y, left: x, ...style }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={transition}
          {...rest}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
});
