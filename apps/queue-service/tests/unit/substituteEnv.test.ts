import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  substituteEnv,
  substituteEnvDeep,
} from '../../src/config/substituteEnv';

describe('substituteEnv', () => {
  beforeEach(() => {
    process.env.TEST_VAR = 'replaced';
    process.env.ANOTHER = 'value';
    process.env.EMPTY_VAR = '';
  });

  afterEach(() => {
    delete process.env.TEST_VAR;
    delete process.env.ANOTHER;
    delete process.env.EMPTY_VAR;
  });

  it('replaces ${VAR} with process.env[VAR]', () => {
    expect(substituteEnv('hello ${TEST_VAR}')).toBe('hello replaced');
  });

  it('replaces $VAR with process.env[VAR]', () => {
    expect(substituteEnv('$ANOTHER')).toBe('value');
  });

  it('replaces missing env with empty string', () => {
    expect(substituteEnv('${MISSING_VAR}')).toBe('');
    expect(substituteEnv('$MISSING_VAR')).toBe('');
  });

  it('leaves string without placeholders unchanged', () => {
    expect(substituteEnv('no placeholders')).toBe('no placeholders');
  });

  it('replaces multiple placeholders', () => {
    expect(substituteEnv('${TEST_VAR} and $ANOTHER')).toBe(
      'replaced and value',
    );
  });
});

describe('substituteEnvDeep', () => {
  beforeEach(() => {
    process.env.TEST_VAR = 'replaced';
    process.env.NESTED = 'nested_val';
  });

  afterEach(() => {
    delete process.env.TEST_VAR;
    delete process.env.NESTED;
  });

  it('substitutes in string', () => {
    expect(substituteEnvDeep('${TEST_VAR}')).toBe('replaced');
  });

  it('substitutes in array elements', () => {
    expect(substituteEnvDeep(['${TEST_VAR}', 'literal', '$NESTED'])).toEqual([
      'replaced',
      'literal',
      'nested_val',
    ]);
  });

  it('substitutes recursively in object values', () => {
    expect(
      substituteEnvDeep({
        a: '${TEST_VAR}',
        b: { c: '$NESTED' },
        d: 42,
      }),
    ).toEqual({
      a: 'replaced',
      b: { c: 'nested_val' },
      d: 42,
    });
  });

  it('leaves non-string primitives unchanged', () => {
    expect(substituteEnvDeep(42)).toBe(42);
    expect(substituteEnvDeep(null)).toBe(null);
    expect(substituteEnvDeep(true)).toBe(true);
  });
});
