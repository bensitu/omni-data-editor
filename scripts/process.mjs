import spawn from 'cross-spawn';
export function run(command, args, cwd = process.cwd(), options = {}) {
  const result = spawn.sync(command, args, {
    cwd,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} exited with ${result.status ?? result.signal}.`,
    );
  return result;
}
