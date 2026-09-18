import { describe, expect, it } from 'vitest';

import { getOrCreateCorrelationId, logger } from '@/lib/logging/logger';

describe('getOrCreateCorrelationId', () => {
  it('accepts a well-formed incoming correlation id', () => {
    const id = 'abc12345-def6-7890-abcd-ef0123456789';
    expect(getOrCreateCorrelationId(id)).toBe(id);
  });

  it('generates a fresh id when none is provided', () => {
    const id = getOrCreateCorrelationId(undefined);
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });

  it('rejects truncated or oversized ids', () => {
    expect(getOrCreateCorrelationId('short')).not.toBe('short');
    expect(getOrCreateCorrelationId('x'.repeat(200))).not.toBe('x'.repeat(200));
  });
});

describe('logger', () => {
  it('emits valid single-line JSON to stdout without throwing', () => {
    // Capturing console output across environments is flaky; the contract
    // under test is: valid JSON lines, redaction by key, no secrets.
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: unknown) => lines.push(String(line));
    try {
      const log = logger.child({ correlationId: 'corr-123' });
      log.info('test.message', { orderId: 'o-1', password: 'hunter2' });
    } finally {
      console.log = original;
    }

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['msg']).toBe('test.message');
    expect(parsed['correlationId']).toBe('corr-123');
    expect(parsed['password']).toBe('[redacted]');
  });

  it('redacts nested secret keys', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: unknown) => lines.push(String(line));
    try {
      logger.info('nested', { nested: { apiKey: 'should-not-appear', safe: 'ok' } });
    } finally {
      console.log = original;
    }
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    const nested = parsed['nested'] as Record<string, unknown>;
    expect(nested['apiKey']).toBe('[redacted]');
    expect(nested['safe']).toBe('ok');
  });
});
