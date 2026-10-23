# Interactive playground

The team directory at `/showcase/` demonstrates OmniDataEditor through a responsive application interface. All people and values are illustrative sample data. Data lives in memory, resets on reload and is not sent to an external service. Office options simulate cancellable asynchronous loading from a local list. Fonts and icons are served locally without third party asset requests.

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

Open `http://127.0.0.1:5173/showcase/`. Use the URL printed by Vite if that port is occupied. The example index at `/` also links to the playground and the focused integrations.

`pnpm build:examples` builds all eight example pages into `dist/examples/`. Serve that directory at the root of a static HTTP server. The generated files use public package exports and explicit theme CSS imports.

## Explore the directory

| Interaction                            | Behavior                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add member                             | Opens a native dialog with required name, email and role, typed salary validation and office selection.                                          |
| Edit icon                              | Edits one complete member in a dialog. Save returns canonical data; Escape and Cancel discard the draft.                                         |
| Salary amount                          | Opens the inline presentation anchored to the salary cell. Save, Reset and Cancel operate on that field.                                         |
| Select multiple rows                   | Enables a shared form for department, office, salary and status. Unchanged mixed values retain each member's original data.                      |
| Remove selected member                 | Removes one selected member and reflects the result in the host table.                                                                           |
| Search, department and status controls | Filter the real DataTables host without changing stored entities. Select all affects visible rows; selection can include rows hidden by filters. |
| Guided interaction buttons             | Open a member, an inline salary editor or two selected members. They clear filters so the target rows are visible.                               |
| Team overview                          | Recalculates member count, distinct departments and payroll after successful persistence.                                                        |
| Event list                             | Displays recent real session, validation and mutation events using safe DOM text.                                                                |

The form uses the shared renderer registry and the asynchronous selection extension. Enter a city fragment such as `Sing` in Office, then select Singapore with a pointer or keyboard. Typing a query alone does not select a semantic value.

## Integration

`examples/showcase/main.ts` defines the fields, application persistence, event observers, renderer registry and host connection. One editing runtime switches between dialog and inline presentations after disposing the previous presentation. The DataTables adapter supplies selection, canonical reflection, field anchors, focus and viewport capabilities. API selection is explicitly enabled because the page provides its own checkboxes.

DataTables owns search and filters. Application persistence owns the local entity map and returns immutable canonical members. The batch form shows only fields intended for shared updates. The table renders names, email addresses, badges and labels as DOM text so edited content cannot become markup.

This example demonstrates local editing and successful atomic batch persistence. It does not simulate a production server, concurrent writers, network failures or partial batch rejection. See [persistence](./persistence), [conflicts](./conflicts) and [multiple entities](./multiple-entities) for those contracts. Links in the navigation open focused DataTables, Tabulator and asynchronous selection examples.
