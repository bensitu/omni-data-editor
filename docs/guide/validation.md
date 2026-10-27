# Validation

Field validators run before entity validators and Standard Schema. Each receives the candidate, revision and cancellation signal. Return one issue, an array of issues or null. Warnings do not prevent submission.

Standard Schema is optional and has no runtime dependency. Only its issues are consumed; returned transformed values never replace the candidate. Paths are matched exactly to registered fields, including nested `{ key }` segments. Unserializable paths remain global issues.

`session.validate()` returns to editing without invoking persistence. Validation reports are current, stale or aborted. A new draft invalidates pending validation. A current report is valid only for its recorded revision. Schema promises may continue after cancellation; obsolete results cannot update the session.

Server validation issues retain their field identifiers and are associated with the submitted revision. Changing a field invalidates the report. Native control parsing happens before `set`; incomplete numbers stay in the control and prevent form submission.

Built-in fields accept `null` and `undefined` as empty semantic values. Required fields report a `required` issue for empty values. Native number and select controls report `undefined` when cleared; custom validators and writers should support the empty values used by their application models. Select and radio field definitions require an options array.
