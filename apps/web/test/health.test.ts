import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns a healthy payload with configuration booleans only', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      status: string;
      service: string;
      version: string;
      configured: Record<string, boolean>;
    };

    expect(body.status).toBe('ok');
    expect(body.service).toBe('embee-nexus-v2');
    expect(typeof body.version).toBe('string');

    // Only booleans are exposed — never configuration values.
    for (const value of Object.values(body.configured)) {
      expect(typeof value).toBe('boolean');
    }
  });
});
