export function logError(contextMessage: string, err: unknown) {
  if (err instanceof Error) {
    console.error(`${contextMessage} ${err.message}`);
    console.error(err.stack);
    return;
  }
  console.error(`${contextMessage} ${String(err)}`);
}
