export type ClassValue = string | false | null | undefined;

/** Joins truthy class names. */
export function cx(...values: ClassValue[]): string {
  let result = '';
  for (const value of values) {
    if (!value) continue;
    result = result ? `${result} ${value}` : value;
  }
  return result;
}
