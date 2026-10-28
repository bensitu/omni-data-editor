# Validation

Field validators run before entity validators and Standard Schema. Each receives the candidate, revision and cancellation signal. Return one issue, an array of issues or null. Warnings do not prevent submission.

Standard Schema is optional and has no runtime dependency. Only its issues are consumed; returned transformed values never replace the candidate. Paths are matched exactly to registered fields, including nested `{ key }` segments. Unserializable paths remain global issues.

`session.validate()` returns to editing without invoking persistence. Validation reports are current, stale or aborted. A new draft invalidates pending validation. A current report is valid only for its recorded revision. Schema promises may continue after cancellation; obsolete results cannot update the session.

Server validation issues retain their field identifiers and are associated with the submitted revision. Changing a field invalidates the report. Native control parsing happens before `set`; incomplete numbers stay in the control and prevent form submission.

Built-in fields accept `null` and `undefined` as empty semantic values. Required fields report a `required` issue for empty values. Native number and select controls report `undefined` when cleared; custom validators and writers should support the empty values used by their application models. Select and radio field definitions require an options array.

Field validators are skipped when `visibleWhen` returns false for that candidate. Entity and schema validators still validate the complete entity. Disabled and read-only fields retain their domain validation; conditional entity rules should explicitly express when a value is applicable. `validationConcurrency` limits simultaneous entity validation (default: 8); validators receive cancellation signals when an operation becomes obsolete or a parallel validator fails.

Built-in required text follows native presence semantics: whitespace is a value. Use a custom validator for trimmed text or additional date-range, text-length, or domain constraints. Equality is configurable for structured values. Snapshots remain reference-stable between notifications and expose immutable data; applications must not mutate their maps, sets or referenced entities.

The default numeric codec uses a dot decimal separator and does not accept grouping separators. Configure `presentation: { decimalSeparator: ',' }` on a number field for comma decimal input. Renderer input spelling is preserved during semantic updates; programmatic changes replace it and clear obsolete parsing errors. Validation message parameters use the same catalog interpolation as field labels.

Built-in date fields validate calendar dates in `YYYY-MM-DD` form. Local date-time fields validate a calendar date and a local time, without timezone conversion. Empty optional values remain valid.
