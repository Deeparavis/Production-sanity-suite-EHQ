import { APIRequestContext, expect } from '@playwright/test';
import { EndpointCheck, resolveEndpointUrl } from '../config/endpoints';

export interface EndpointResult {
  status: number;
  responseTimeMs: number;
  body?: string;
}

export async function assertEndpointReturnsExpectedStatus(
  request: APIRequestContext,
  endpoint: EndpointCheck
): Promise<void> {
  const url = resolveEndpointUrl(endpoint.path);
  const method = endpoint.method ?? 'GET';
  const expectedStatus = endpoint.expectedStatus ?? 200;
  const validStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

  const fetchOptions: Parameters<APIRequestContext['fetch']>[1] = {
    method,
    maxRedirects: endpoint.noRedirect ? 0 : undefined,
  };

  if (method === 'PUT' || method === 'PATCH' || method === 'POST' || method === 'DELETE') {
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    if (method !== 'DELETE') {
      fetchOptions.data = endpoint.body ?? '{}';
    }
  }

  const startTime = Date.now();
  const response = await request.fetch(url, fetchOptions);
  const responseTimeMs = Date.now() - startTime;
  const actual = response.status();

  // Status code assertion
  expect(
    validStatuses.includes(actual),
    `${method} ${url} (${endpoint.name}) expected one of [${validStatuses.join(', ')}], got ${actual}`
  ).toBe(true);

  // Response time assertion
  if (endpoint.maxResponseTimeMs) {
    expect(
      responseTimeMs,
      `${method} ${url} (${endpoint.name}) responded in ${responseTimeMs}ms, exceeds max ${endpoint.maxResponseTimeMs}ms`
    ).toBeLessThanOrEqual(endpoint.maxResponseTimeMs);
  }

  // Response body assertions
  if (endpoint.bodyContains || endpoint.bodyHasKey) {
    const body = await response.text();

    if (endpoint.bodyContains) {
      const pattern = endpoint.bodyContains;
      expect(
        body.includes(pattern) || new RegExp(pattern).test(body),
        `${method} ${url} (${endpoint.name}) body does not contain "${pattern}"`
      ).toBe(true);
    }

    if (endpoint.bodyHasKey) {
      try {
        const json = JSON.parse(body);
        const keys = endpoint.bodyHasKey.split('.');
        let obj = json;
        for (const key of keys) {
          expect(
            obj,
            `${method} ${url} (${endpoint.name}) missing key "${endpoint.bodyHasKey}" in response`
          ).toHaveProperty(key);
          obj = obj[key];
        }
      } catch {
        expect(false, `${method} ${url} (${endpoint.name}) response is not valid JSON for key check`).toBe(true);
      }
    }
  }
}
