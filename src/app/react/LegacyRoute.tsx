import { useLayoutEffect, useRef } from 'react';
import { VStack } from '@astryxdesign/core/VStack';

// Move the original container: delegated handlers and controllers keep their owner.
export function LegacyRoute({ outlet }: { outlet: HTMLElement }) {
  const host = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    host.current?.append(outlet);
    const removeDuplicateTabs = () => {
      if (outlet.classList.contains('legacy-route'))
        outlet.querySelectorAll('.top-tabs').forEach((tabs) => tabs.remove());
    };
    removeDuplicateTabs();
    const observer = new MutationObserver(removeDuplicateTabs);
    observer.observe(outlet, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [outlet]);
  return <VStack ref={host} gap={0} width="100%" />;
}
