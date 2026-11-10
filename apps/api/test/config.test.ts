import { describe, expect, it } from 'vitest';
import { cleanSecret, describeSecret } from '../src/config';

describe('chaves coladas no painel', () => {
  it('tira espaço, quebra de linha, aspas e "Bearer " da frente', () => {
    expect(cleanSecret('  APP_USR-123\n')).toBe('APP_USR-123');
    expect(cleanSecret('"APP_USR-123"')).toBe('APP_USR-123');
    expect(cleanSecret('Bearer APP_USR-123')).toBe('APP_USR-123');
    expect(cleanSecret('   ')).toBe('');
    expect(cleanSecret(undefined)).toBe('');
  });

  it('o log mostra só o começo e o tamanho', () => {
    expect(describeSecret('APP_USR-1234567890')).toBe('APP_USR-… (18 caracteres)');
    expect(describeSecret('')).toBe('vazia');
  });
});
