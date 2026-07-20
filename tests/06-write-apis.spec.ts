import { test, APIRequestContext } from '@playwright/test';
import { getBaseConfig, getConfig } from '../src/config/env';
import { EndpointCheck } from '../src/config/endpoints';
import { getWriteEndpointsByAuth } from '../src/config/writeEndpoints';
import { createAuthenticatedRequest } from '../src/helpers/authenticatedRequest';
import { assertEndpointReturnsExpectedStatus } from '../src/helpers/endpointCheck';

const config = getConfig();
const domain = getBaseConfig().siteDomain;
const isNonProd = /replica|preprod|staging|localhost/i.test(domain);
const allowed = process.env.ALLOW_WRITE_TESTS === 'true' && isNonProd;

function describeValidation(ep: EndpointCheck): string {
  const method = ep.method ?? 'GET';
  const status = ep.expectedStatus ?? 200;
  const statusStr = Array.isArray(status) ? status.join('|') : String(status);
  return `[${ep.name}] ${method} ${ep.path} → proves=${ep.validation ?? 'success'}, status=${statusStr}`;
}

test.describe('Write API checks', () => {
  test.skip(
    !allowed,
    'Write API tests are opt-in (ALLOW_WRITE_TESTS=true) and non-production only'
  );

  test.describe('Public write endpoints', () => {
    for (const endpoint of getWriteEndpointsByAuth('none')) {
      test(describeValidation(endpoint), {
        tag: ['@write-apis'],
      }, async ({ request }) => {
        await assertEndpointReturnsExpectedStatus(request, endpoint);
      });
    }
  });

  test.describe('Participant write endpoints', () => {
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
      if (authRequest) {
        await authRequest.dispose();
      }
    });

    for (const endpoint of getWriteEndpointsByAuth('participant')) {
      test(describeValidation(endpoint), {
        tag: ['@write-apis'],
      }, async () => {
        await assertEndpointReturnsExpectedStatus(authRequest, endpoint);
      });
    }
  });

  test.describe('Site admin write endpoints', () => {
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
      if (authRequest) {
        await authRequest.dispose();
      }
    });

    for (const endpoint of getWriteEndpointsByAuth('siteAdmin')) {
      test(describeValidation(endpoint), {
        tag: ['@write-apis'],
      }, async () => {
        await assertEndpointReturnsExpectedStatus(authRequest, endpoint);
      });
    }
  });
});
