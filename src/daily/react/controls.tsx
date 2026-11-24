import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { appState } from '../../app/state';
import { dailyAction, dailyLocked } from './actions';
import { readOnlyDailyActions } from '../views/daily-view';

export function Action({
  action,
  data,
  label,
  isDisabled,
  ...props
}: ComponentProps<typeof Button> & { action: string; data?: Record<string, string> }) {
  return (
    <Button
      {...props}
      label={label}
      data-react-action={action}
      isDisabled={isDisabled ?? (dailyLocked() && !readOnlyDailyActions.has(action))}
      onClick={(event) => {
        event.stopPropagation();
        void dailyAction(action, data);
      }}
    />
  );
}

type FieldProps = Omit<ComponentProps<typeof TextInput>, 'onChange'> & {
  onChange(value: string): void;
};
export function Field({ value, onChange, ...props }: FieldProps) {
  const [text, setText] = useState(value);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current) setText(value);
  }, [value]);
  return (
    <TextInput
      {...props}
      value={text}
      isDisabled={props.isDisabled ?? dailyLocked()}
      onCompositionStart={() => {
        composing.current = true;
        appState.entryComposing = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        appState.entryComposing = false;
        setText((event.target as HTMLInputElement).value);
        onChange((event.target as HTMLInputElement).value);
      }}
      onChange={(next, event) => {
        setText(next);
        if (!composing.current && !(event.nativeEvent as InputEvent).isComposing) onChange(next);
      }}
    />
  );
}

export function Notes({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof TextArea>, 'onChange'> & { onChange(value: string): void }) {
  const [text, setText] = useState(value);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current) setText(value);
  }, [value]);
  return (
    <TextArea
      {...props}
      value={text}
      isDisabled={props.isDisabled ?? dailyLocked()}
      onCompositionStart={() => {
        composing.current = true;
        appState.entryComposing = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        appState.entryComposing = false;
        setText((event.target as HTMLInputElement).value);
        onChange((event.target as HTMLInputElement).value);
      }}
      onChange={(next, event) => {
        setText(next);
        if (!composing.current && !(event.nativeEvent as InputEvent).isComposing) onChange(next);
      }}
    />
  );
}
