import { test, APIRequestContext } from '@playwright/test';
import { getConfig } from '../src/config/env';
import { EndpointCheck, getReadOnlyEndpointsByAuth } from '../src/config/endpoints';
import { createAuthenticatedRequest } from '../src/helpers/authenticatedRequest';
import { assertEndpointReturnsExpectedStatus } from '../src/helpers/endpointCheck';

const config = getConfig();

function describeValidation(ep: EndpointCheck): string {
  const checks: string[] = [];
  const method = ep.method ?? 'GET';
  const status = ep.expectedStatus ?? 200;
  const statusStr = Array.isArray(status) ? status.join('|') : String(status);

  checks.push(`proves=${ep.validation ?? 'success'}`);
  checks.push(`status=${statusStr}`);

  if (ep.maxResponseTimeMs) {
    checks.push(`perf<${ep.maxResponseTimeMs}ms`);
  }
  if (ep.bodyContains) {
    checks.push(`body~"${ep.bodyContains}"`);
  }
  if (ep.bodyHasKey) {
    checks.push(`key="${ep.bodyHasKey}"`);
  }
  if (ep.noRedirect) {
    checks.push('no-redirect');
  }

  return `[${ep.name}] ${method} ${ep.path} → validates: ${checks.join(', ')}`;
}

test.describe('Endpoint health checks', () => {
  test.describe('Public endpoints', () => {
    for (const endpoint of getReadOnlyEndpointsByAuth('none')) {
      test(describeValidation(endpoint), {
        tag: ['@prod-sanity', '@endpoints'],
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

    for (const endpoint of getReadOnlyEndpointsByAuth('participant')) {
      test(describeValidation(endpoint), {
        tag: ['@prod-sanity', '@endpoints'],
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

    for (const endpoint of getReadOnlyEndpointsByAuth('siteAdmin')) {
      test(describeValidation(endpoint), {
        tag: ['@prod-sanity', '@endpoints'],
      }, async () => {
        await assertEndpointReturnsExpectedStatus(authRequest, endpoint);
      });
    }
  });
});
