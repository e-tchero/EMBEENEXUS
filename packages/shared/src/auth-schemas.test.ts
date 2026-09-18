import { describe, expect, it } from 'vitest';

import { signInSchema, signUpSchema } from '@embee/shared';

describe('signUpSchema', () => {
  it('accepts valid signup input and normalizes email', () => {
    const result = signUpSchema.parse({
      email: '  USER@Example.COM ',
      password: 'correct horse battery',
      fullName: '  Ada Obi  ',
    });
    expect(result.email).toBe('user@example.com');
    expect(result.fullName).toBe('Ada Obi');
  });

  it('rejects invalid email', () => {
    const result = signUpSchema.safeParse({
      email: 'not-an-email',
      password: 'longenough123',
      fullName: 'Ada',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short passwords', () => {
    const result = signUpSchema.safeParse({
      email: 'a@b.com',
      password: 'short',
      fullName: 'Ada',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = signUpSchema.safeParse({
      email: 'a@b.com',
      password: 'longenough123',
      fullName: '   ',
    });
    expect(result.success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('accepts valid credentials and normalizes email', () => {
    const result = signInSchema.parse({ email: ' A@B.COM ', password: 'x' });
    expect(result.email).toBe('a@b.com');
  });

  it('rejects empty password', () => {
    const result = signInSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
  });
});
