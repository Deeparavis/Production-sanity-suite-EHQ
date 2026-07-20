import { EndpointAuth, EndpointCheck } from './endpoints';

/**
 * Production-safe negative checks.
 *
 * Every payload is intentionally invalid and must be rejected with 422.
 * A 2xx response is always a failure because it could indicate mutation.
 */
function productionWriteEndpoints(): EndpointCheck[] {
  return [
    {
      name: 'Reject invalid registration',
      path: '/api/v2/registrations',
      method: 'POST',
      auth: 'none',
      body: '{"data":{"type":"registration","attributes":{}}}',
      expectedStatus: [422],
      validation: 'rejection',
    },
    {
      name: 'Reject invalid project archive request',
      path: '/api/v2/projects/{projectSlug}/archive',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{"__sanity_invalid":true}',
      expectedStatus: [422],
      validation: 'rejection',
    },
    {
      name: 'Reject invalid reporting filter update',
      path: '/api/v2/reporting/dashboard_filters',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{"dashboard_filters":{}}',
      expectedStatus: [422],
      validation: 'rejection',
    },
  ];
}

export function getProductionWriteEndpoints(): EndpointCheck[] {
  return productionWriteEndpoints();
}

export function getProductionWriteEndpointsByAuth(auth: EndpointAuth): EndpointCheck[] {
  return getProductionWriteEndpoints().filter(
    (endpoint) => (endpoint.auth ?? 'none') === auth
  );
}
