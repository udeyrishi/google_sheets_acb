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

export function zipArrays<T1, T2>(arr1: readonly T1[], arr2: readonly T2[]): [T1, T2][] {
  if (arr1.length !== arr2.length) {
    throw new Error(`arr1.length ${arr1.length} did not match arr2.length ${arr2.length}`);
  }

  return arr1.map((item, i) => [item, arr2[i]] as const);
}
