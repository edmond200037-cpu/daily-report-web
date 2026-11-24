import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { notifyReact, useAppVersion } from './react-store';

type Request = { description: string; resolve: (confirmed: boolean) => void };
const requests: Request[] = [];

/** UI decisions stay outside report state, persistence and mutations. */
export function confirmAction(description: string): Promise<boolean> {
  return new Promise((resolve) => {
    requests.push({ description, resolve });
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
    current.resolve(confirmed);
    notifyReact();
  };
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
