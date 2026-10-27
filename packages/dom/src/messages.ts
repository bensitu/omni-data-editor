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
  'value-not-applied': 'The value could not be applied.',
  'check-values': 'Check the entered values.',
  'save-unknown':
    'The save result is unknown. Refresh canonical data before continuing.',
  'batch-summary': '{saved} saved. {remaining} require attention.',
  'remote-removed': 'This entity was removed remotely.',
  'remote-updated': 'This entity changed remotely.',
  'accept-remote': 'Use remote data',
  'rebase-local': 'Keep local changes',
  'complete-number': 'Enter a complete number.',
  'choose-option': 'Choose an option',
  mixed: 'Multiple values',
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
