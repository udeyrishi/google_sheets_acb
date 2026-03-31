function indentLines(text: string, depth: number): string {
  const indent = '  '.repeat(depth);
  return text
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

export function formatErrorCause(error: unknown, depth = 0): string {
  if (error instanceof Error) {
    const details = error.stack ?? String(error);
    return `${indentLines('Cause:', depth)}\n${indentLines(details, depth)}`;
  }

  return `${indentLines('Cause:', depth)}\n${indentLines(String(error), depth)}`;
}
