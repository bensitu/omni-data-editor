import type { MessageLike } from '@omnidataeditor/core';
export const englishMessages: Readonly<Record<string, string>> = Object.freeze({
  save: 'Save',
  cancel: 'Cancel',
  reset: 'Reset',
  required: 'This field is required.',
  'invalid-value': 'Enter a valid value.',
  'invalid-option': 'Choose an available option.',
  'out-of-range': 'Enter a value within the allowed range.',
  'validation-unavailable': 'Validation is unavailable. Try again.',
  'save-failed': 'The data could not be saved.',
});
export function formatMessage(
  message: MessageLike,
  catalog: Readonly<Record<string, string>> = englishMessages,
): string {
  if (typeof message === 'string') return message;
  const template =
    catalog[message.key] ?? message.defaultMessage ?? message.key;
  return template.replace(/\{([\w-]+)\}/g, (match, key: string) =>
    String(message.params?.[key] ?? match),
  );
}
