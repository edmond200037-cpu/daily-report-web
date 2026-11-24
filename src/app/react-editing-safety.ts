import { useEffect, type RefObject } from 'react';

const isInput = (target: EventTarget | null): target is HTMLElement => target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]');

/** Reserve the measured footer and include it in native nearest-scroll calculations. */
export function useFooterSafety(content: RefObject<HTMLDivElement | null>, footer: RefObject<HTMLDivElement | null>, enabled: boolean): void {
  useEffect(() => {
    const body = content.current, bar = footer.current;
    if (!enabled || !body || !bar) return;
    const root = document.documentElement;
    const previous = { padding: body.style.paddingBlockEnd, scroll: body.style.scrollPaddingBlockEnd, page: root.style.scrollPaddingBlockEnd };
    let firstFrame = 0, secondFrame = 0;
    const align = () => {
      cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => {
        const target = document.activeElement;
        if (isInput(target) && body.contains(target)) target.scrollIntoView({ block: 'nearest' });
      }); });
    };
    const measure = () => {
      const height = Math.ceil(bar.getBoundingClientRect().height);
      const gap = getComputedStyle(bar).getPropertyValue('--spacing-2').trim() || '0rem';
      body.style.paddingBlockEnd = `${height}px`;
      body.style.scrollPaddingBlockEnd = `calc(${height}px + ${gap})`;
      root.style.scrollPaddingBlockEnd = `calc(${height}px + ${gap})`;
      align();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    document.addEventListener('focusin', align);
    window.visualViewport?.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect(); cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame);
      document.removeEventListener('focusin', align); window.visualViewport?.removeEventListener('resize', measure);
      body.style.paddingBlockEnd = previous.padding; body.style.scrollPaddingBlockEnd = previous.scroll; root.style.scrollPaddingBlockEnd = previous.page;
    };
  }, [content, footer, enabled]);
}
