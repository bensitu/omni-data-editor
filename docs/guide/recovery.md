# Recovery example

Open `/recovery/` on the local examples server started by `pnpm dev`. The example uses public package exports, native dialog forms and an application-owned host reflection map. Choose a scenario to reset the previous run and open its form. **Reset scenario** clears drafts, server data, held responses, uncertainty records and diagnostics; it is available inside an open dialog as well as on the page.

All data is synthetic and held in memory. Revision preconditions and successful-write idempotency are simulated application/server behavior. No backend requests are sent. Reloading or resetting discards recovery requirements; this is not a durable recovery implementation.

## Concurrent changes

1. Choose **Start conflict** and change Name and Salary.
2. Choose **Simulate remote update**, then **Save**. The server rejects the stale revision and returns its current entity.
3. Use **Use remote data**, **Keep local changes**, or the two conflict choices followed by **Merge chosen fields**.
4. Save again. The next request uses the refreshed revision and a new logical mutation identifier.

Resolution invalidates prior validation. The simulator retains `revision` outside the registered editable fields, illustrating an application-owned server precondition. See [concurrent changes](./conflicts.md).

## Unknown update or create

1. Choose **Start unknown update** or **Start unknown create**, edit the fields and Save once. The simulated server commits canonical data but holds the successful response.
2. **Check duplicate submission** returns busy without dispatching another persistence request.
3. Choose **Cancel waiting for response**. The form closes, but cancellation does not undo the server write. The page retains the uncertain draft and the operation's recovery record.
4. **Try blocked operation** attempts to reopen the affected operation. The reconciliation port returns unknown; no new write is dispatched. **Edit unrelated person** shows that an unrelated identity remains editable. Cancel that form before continuing.
5. **Reconcile authoritative data** makes the authoritative result available and opens a fresh session. An update reconciles by entity key. A create reconciles by client mutation ID, reflects the generated entity exactly once and opens an independent new create draft. Cancel the fresh form to avoid starting another write.
6. For an update, optionally choose **Apply newer remote update**. Then **Deliver held response**. The old response must not overwrite the newer canonical data or emit another canonical commit.

Alternatively, deliver the held response after cancelling and before reconciliation. Its success establishes the canonical result, reflects the entity once and clears the recovery controls without a reconciliation request.

The diagnostics show actual requests, writes, reconciliation calls and public runtime events. Known-entity reconciliation refreshes the application's host map; create reconciliation also emits the runtime's canonical commit and invokes host creation reflection. An authoritative refresh is not an additional server write. See [persistence and reconciliation](./persistence.md).

## Partial batches

Choose **Start partial batch**, change Salary and Save. Ada succeeds, Grace receives a simulated refusal and Katherine commits with an unknown result. The retained batch snapshot shows all three outcomes; the uncertain form remains locked until dismissed with **Close**.

**Try blocked operation** checks Katherine's unresolved identity. **Reconcile authoritative data** reads her canonical entity and delivers it through `notifyExternalEntity`. Because an unknown batch outcome terminates the old session, the example opens a new batch session containing only Grace and reapplies her retained field changes. Save to complete this new logical write. Confirmed successful entities are excluded. The simulator permits Grace's next attempt; real authorization and retry eligibility belong to the application/server.

For a retry within the same session, choose **Start selective retry**. Here Ada and Katherine succeed and Grace is refused, with no unknown results. Save again without editing: only Grace is sent, with the same client mutation ID and a new operation ID. Editing Salary before saving starts a new logical write for all three targets. Untouched names remain independent.

The simulator deduplicates successful writes by `(clientMutationId, entityKey)` and creates by client mutation ID. It does not implement authorization, an HTTP protocol or durable idempotency storage. A production server must define those guarantees. See [editing multiple entities](./multiple-entities.md).

## Regression coverage

`tests/e2e/recovery.test.ts` runs through the existing Chromium, Firefox and WebKit projects. Tests inspect the visible request journal, server writes, snapshots, reflected data and runtime events. Explicit scenario controls and state assertions synchronize execution; no elapsed-time sleeps determine the result.

```sh
pnpm build
pnpm exec playwright test tests/e2e/recovery.test.ts
```
