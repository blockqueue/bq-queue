/**
 * Replaces ${VAR} and $VAR in a string with process.env[VAR].
 */
export function substituteEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/gi, (_, a, b) => {
    const key = (a ?? b)?.trim();
    return key ? (process.env[key] ?? '') : '';
  });
}

/**
 * Recursively substitute env vars in objects and strings.
 */
export function substituteEnvDeep<T>(obj: T): T {
  if (typeof obj === 'string') {
    return substituteEnv(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => substituteEnvDeep(item)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = substituteEnvDeep(v);
    }
    return result as T;
  }
  return obj;
}
