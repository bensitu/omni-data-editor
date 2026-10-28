import type {
  EditorRuntime,
  EditorOptions,
  CommandOutcome,
  SessionSnapshot,
  SubmitOutcome,
  RemoveOutcome,
  StandardSchemaV1Like,
  BatchMutationOutcome,
} from '@omnidataeditor/editor';
type Employee = { id: number; name: string };
export function consume(
  editor: EditorRuntime<Employee>,
  options: EditorOptions<Employee>,
  schema: StandardSchemaV1Like<Employee>,
  batch: BatchMutationOutcome<Employee>,
): void {
  const session = editor.create({ initial: { id: 1, name: 'Ada' } });
  const command: CommandOutcome = session.set('name', 'Grace');
  const snapshot: SessionSnapshot<Employee> = session.snapshot();
  const submit: Promise<SubmitOutcome<Employee>> = session.submit();
  const remove: Promise<RemoveOutcome> = editor.remove({ id: 1, name: 'Ada' });
  editor.editMany([{ id: 1, name: 'Ada' }]);
  editor.use({
    requiredCapabilities: [],
    mount(context) {
      context.dispatch({ type: 'reset' });
    },
    destroy() {},
  });
  editor.attach({ capabilities: {}, detach() {} });
  editor.on('mutation:uncertain', (record) => record.clientMutationId);
  void [options, schema, batch, command, snapshot, submit, remove];
}
