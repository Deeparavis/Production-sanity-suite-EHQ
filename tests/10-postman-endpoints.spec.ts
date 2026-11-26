import { test, APIRequestContext } from '@playwright/test';
import { getConfig } from '../src/config/env';
import { EndpointCheck } from '../src/config/endpoints';
import { createAuthenticatedRequest } from '../src/helpers/authenticatedRequest';
import { assertEndpointReturnsExpectedStatus } from '../src/helpers/endpointCheck';
import { getPostmanEndpointsByAuth } from '../src/config/postmanEndpoints';

const config = getConfig();

function describeValidation(ep: EndpointCheck): string {
  const checks: string[] = [];
  const method = ep.method ?? 'GET';
  const status = ep.expectedStatus ?? 200;
  const statusStr = Array.isArray(status) ? status.join('|') : String(status);

  checks.push(`status=${statusStr}`);
  if (ep.maxResponseTimeMs) checks.push(`perf<${ep.maxResponseTimeMs}ms`);
  if (ep.bodyContains) checks.push(`body~"${ep.bodyContains}"`);

  return `[${ep.name}] ${method} ${ep.path} -> validates: ${checks.join(', ')}`;
}

test.describe('Postman collection endpoint checks', () => {
  test.describe('Public endpoints', () => {
    for (const endpoint of getPostmanEndpointsByAuth('none')) {
      test(describeValidation(endpoint), {
        tag: ['@prod-sanity', '@postman-endpoints'],
      }, async ({ request }) => {
        await assertEndpointReturnsExpectedStatus(request, endpoint);
      });
    }
  });

  test.describe('Participant endpoints', () => {
    let authRequest: APIRequestContext;

    test.beforeAll(async ({ browser }) => {
      authRequest = await createAuthenticatedRequest(
        browser,
        config,
        config.participant.username,
        config.participant.password
      );
    });

    test.afterAll(async () => {
      await authRequest.dispose();
    });

    for (const endpoint of getPostmanEndpointsByAuth('participant')) {
      test(describeValidation(endpoint), {
        tag: ['@prod-sanity', '@postman-endpoints'],
      }, async () => {
        await assertEndpointReturnsExpectedStatus(authRequest, endpoint);
      });
    }
  });

  test.describe('Site admin endpoints', () => {
    let authRequest: APIRequestContext;

    test.beforeAll(async ({ browser }) => {
      authRequest = await createAuthenticatedRequest(
        browser,
        config,
        config.siteAdmin.username,
        config.siteAdmin.password
      );
    });

    test.afterAll(async () => {
      await authRequest.dispose();
    });

    for (const endpoint of getPostmanEndpointsByAuth('siteAdmin')) {
      test(describeValidation(endpoint), {
        tag: ['@prod-sanity', '@postman-endpoints'],
      }, async () => {
        await assertEndpointReturnsExpectedStatus(authRequest, endpoint);
      });
    }
  });
});
