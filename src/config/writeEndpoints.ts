import { EndpointAuth, EndpointCheck } from './endpoints';

/**
 * Write API catalog with dummy payloads (site admin + participant + public).
 * Opt-in only via ALLOW_WRITE_TESTS=true on non-production hosts.
 * Project routes use {projectSlug} from PROD_PROJECT_SLUG (no hardcoded IDs).
 */
function writeEndpoints(): EndpointCheck[] {
  return [
    // ── Participant write APIs ────────────────────────────────────
    {
      name: 'PUT participant profile',
      path: '/api/v2/users/current',
      method: 'PUT',
      auth: 'participant',
      body: '{"user":{"bio":"sanity-participant-write-test"}}',
      expectedStatus: [200],
    },
    {
      name: 'PATCH participant profile',
      path: '/api/v2/users/current',
      method: 'PATCH',
      auth: 'participant',
      body: '{"user":{"bio":"sanity-participant-write-test"}}',
      expectedStatus: [200],
    },
    // ── PUT APIs (site admin) ─────────────────────────────────────
    {
      name: 'PUT user profile',
      path: '/api/v2/users/current',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{"user":{"bio":"sanity-dummy-write-test"}}',
      expectedStatus: [200],
    },
    {
      name: 'PUT site config',
      path: '/api/v2/site',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{"site":{"description":"sanity-dummy-write-test"}}',
      expectedStatus: [200],
    },
    {
      name: 'PUT site settings',
      path: '/api/v2/settings',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{"settings":{}}',
      expectedStatus: [200],
    },
    {
      name: 'PUT theme',
      path: '/api/v2/theme',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{"theme":{"primary_color":"#6366f1"}}',
      expectedStatus: [200],
    },
    {
      name: 'PUT project',
      path: '/api/v2/projects/{projectSlug}',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{"project":{"description":"sanity-dummy-write-test"}}',
      expectedStatus: [200],
    },
    {
      name: 'Reject publishing an already-published project',
      path: '/api/v2/projects/{projectSlug}/publish',
      method: 'PUT',
      auth: 'siteAdmin',
      body: '{}',
      expectedStatus: [422],
      validation: 'rejection',
    },
    {
      name: 'Reject invalid project archive request',
      path: '/api/v2/projects/{projectSlug}/archive',
      method: 'PUT',
      auth: 'siteAdmin',
      // Invalid body forces 422 so the route is validated without archiving
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

    // ── PATCH APIs (site admin) ───────────────────────────────────
    {
      name: 'PATCH user profile',
      path: '/api/v2/users/current',
      method: 'PATCH',
      auth: 'siteAdmin',
      body: '{"user":{"bio":"sanity-dummy-write-test"}}',
      expectedStatus: [200],
    },
    {
      name: 'PATCH site config',
      path: '/api/v2/site',
      method: 'PATCH',
      auth: 'siteAdmin',
      body: '{"site":{"description":"sanity-dummy-write-test"}}',
      expectedStatus: [200],
    },
    {
      name: 'PATCH site settings',
      path: '/api/v2/settings',
      method: 'PATCH',
      auth: 'siteAdmin',
      body: '{"settings":{}}',
      expectedStatus: [200],
    },
    {
      name: 'PATCH theme',
      path: '/api/v2/theme',
      method: 'PATCH',
      auth: 'siteAdmin',
      body: '{"theme":{"primary_color":"#6366f1"}}',
      expectedStatus: [200],
    },
    {
      name: 'PATCH project',
      path: '/api/v2/projects/{projectSlug}',
      method: 'PATCH',
      auth: 'siteAdmin',
      body: '{"project":{"description":"sanity-dummy-write-test"}}',
      expectedStatus: [200],
    },
    {
      name: 'PATCH heartbeat',
      path: '/admin/api/auth/heartbeat',
      method: 'PATCH',
      auth: 'siteAdmin',
      body: '{}',
      expectedStatus: [200, 204],
    },

    // ── POST APIs (public — invalid dummy payloads; route must respond) ──
    {
      name: 'POST password reset',
      path: '/users/password',
      method: 'POST',
      auth: 'none',
      body: '{"user":{"email":"sanity-dummy-write@test.invalid"}}',
      expectedStatus: [200],
    },
    {
      name: 'Reject invalid registration',
      path: '/api/v2/registrations',
      method: 'POST',
      auth: 'none',
      body: '{"data":{"type":"registration","attributes":{}}}',
      expectedStatus: [422],
      validation: 'rejection',
    },
  ];
}

export function getWriteEndpoints(): EndpointCheck[] {
  return writeEndpoints();
}

export function getWriteEndpointsByAuth(auth: EndpointAuth): EndpointCheck[] {
  return getWriteEndpoints().filter((endpoint) => (endpoint.auth ?? 'none') === auth);
}
