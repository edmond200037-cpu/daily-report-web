import { Dialog } from '@astryxdesign/core/Dialog';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { notifyReact, useAppVersion } from './react-store';

type Request = { kind: 'confirm' | 'notice'; description: string; resolve: (confirmed: boolean) => void };
const requests: Request[] = [];

/** UI decisions stay outside report state, persistence and mutations. */
export function confirmAction(description: string): Promise<boolean> {
  return new Promise((resolve) => {
    requests.push({ kind: 'confirm', description, resolve });
    notifyReact();
  });
}

/** Informational validation uses the same non-blocking UI queue as confirmations. */
export function notifyAction(description: string): Promise<void> {
  return new Promise((resolve) => {
    requests.push({ kind: 'notice', description, resolve: () => resolve() });
    notifyReact();
  });
}

export function ConfirmationDialog() {
  useAppVersion();
  const current = requests[0];
  if (!current) return null;
  const settle = (confirmed: boolean) => {
    if (requests[0] !== current) return;
    requests.shift();
    notifyReact();
    // Let the modal release inertness and restore focus before callers focus a field.
    requestAnimationFrame(() => requestAnimationFrame(() => current.resolve(confirmed)));
  };
  if (current.kind === 'notice') return <Dialog isOpen aria-label="提示" purpose="info" padding={4} onOpenChange={(open) => { if (!open) settle(false); }}>
    <VStack gap={4}><Heading level={2}>提示</Heading><Text role="alert" style={{ whiteSpace: 'pre-wrap' }}>{current.description}</Text><Button label="知道了" size="lg" variant="primary" onClick={() => settle(true)} /></VStack>
  </Dialog>;
  return (
    <AlertDialog
      isOpen
      title="確認操作"
      description={current.description}
      actionLabel="確認"
      cancelLabel="取消"
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      onAction={() => settle(true)}
    />
  );
}
