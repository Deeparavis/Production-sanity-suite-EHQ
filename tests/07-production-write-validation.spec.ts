import { APIRequestContext, test } from '@playwright/test';
import { EndpointCheck } from '../src/config/endpoints';
import { getConfig } from '../src/config/env';
import { getProductionWriteEndpointsByAuth } from '../src/config/productionWriteEndpoints';
import { createAuthenticatedRequest } from '../src/helpers/authenticatedRequest';
import { assertEndpointReturnsExpectedStatus } from '../src/helpers/endpointCheck';

const config = getConfig();
const allowed = process.env.ALLOW_PROD_WRITE_VALIDATION === 'true';

function describeValidation(endpoint: EndpointCheck): string {
  const status = endpoint.expectedStatus ?? 422;
  const statusText = Array.isArray(status) ? status.join('|') : String(status);
  return `[${endpoint.name}] ${endpoint.method} ${endpoint.path} → proves=rejection, status=${statusText}`;
}

test.describe('Production-safe write rejection checks', () => {
  test.skip(!allowed, 'Production write validation requires explicit UI or environment opt-in');

  test.describe('Public rejection checks', () => {
    for (const endpoint of getProductionWriteEndpointsByAuth('none')) {
      test(
        describeValidation(endpoint),
        { tag: ['@prod-write-validation'] },
        async ({ request }) => {
          await assertEndpointReturnsExpectedStatus(request, endpoint);
        }
      );
    }
  });

  test.describe('Site admin rejection checks', () => {
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

    for (const endpoint of getProductionWriteEndpointsByAuth('siteAdmin')) {
      test(
        describeValidation(endpoint),
        { tag: ['@prod-write-validation'] },
        async () => {
          await assertEndpointReturnsExpectedStatus(authRequest, endpoint);
        }
      );
    }
  });
});
