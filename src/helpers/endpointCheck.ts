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
  const validation = endpoint.validation ?? 'success';

  if (validation === 'success' && validStatuses.some((status) => status >= 400)) {
    throw new Error(`${endpoint.name} is a success check but accepts an error status`);
  }
  if (
    validation === 'rejection' &&
    validStatuses.some((status) => status < 400 || status >= 500)
  ) {
    throw new Error(`${endpoint.name} is a rejection check but accepts a non-4xx status`);
  }
  if (
    validation === 'access-control' &&
    validStatuses.some(
      (status) => !((status >= 300 && status < 400) || status === 401 || status === 403)
    )
  ) {
    throw new Error(`${endpoint.name} has an invalid access-control status`);
  }

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
  const needsBody = Boolean(endpoint.bodyContains || endpoint.bodyHasKey);
  const responseBody = needsBody ? await response.text() : undefined;

  // Status code assertion
  expect(
    validStatuses.includes(actual),
    `${method} ${url} (${endpoint.name}, ${validation}) expected one of [${validStatuses.join(', ')}], got ${actual}`
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
    const body = responseBody ?? '';

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
