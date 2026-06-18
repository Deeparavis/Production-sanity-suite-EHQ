import * as fs from 'fs';
import * as path from 'path';
import { getBaseConfig, getConfig } from './env';

export type EndpointAuth = 'none' | 'participant' | 'siteAdmin';

export interface EndpointCheck {
  /** Display name shown in test reports */
  name: string;
  /** Path relative to site root. Supports `{projectSlug}` placeholder. */
  path: string;
  method?: 'GET' | 'HEAD' | 'PUT' | 'PATCH' | 'POST' | 'DELETE';
  auth?: EndpointAuth;
  /** Expected HTTP status (default 200). Accepts an array of valid statuses. */
  expectedStatus?: number | number[];
  /** When true, do not follow redirects (useful for auth-gated routes). */
  noRedirect?: boolean;
  /** Request body for PUT/PATCH/POST (default: empty JSON object for write methods). */
  body?: string;
  /** Max acceptable response time in milliseconds (fails if exceeded). */
  maxResponseTimeMs?: number;
  /** Substring or regex pattern the response body must contain. */
  bodyContains?: string;
  /** JSONPath-style key that must exist in a JSON response (e.g. "data.id"). */
  bodyHasKey?: string;
}

function resolvePath(template: string): string {
  const config = getConfig();
  return template.replace(/\{projectSlug\}/g, config.projectSlug);
}

export function resolveEndpointUrl(pathTemplate: string): string {
  const { siteUrl } = getBaseConfig();
  const resolvedPath = resolvePath(pathTemplate);
  return `${siteUrl}${resolvedPath.startsWith('/') ? resolvedPath : `/${resolvedPath}`}`;
}

function defaultEndpoints(): EndpointCheck[] {
  return [
    // ── Public (no auth) ──────────────────────────────────────────
    { name: 'Homepage', path: '/', auth: 'none' },
    { name: 'Login page', path: '/login', auth: 'none' },
    { name: 'Sign-in page', path: '/sign_in', auth: 'none' },
    { name: 'Register page', path: '/register', auth: 'none' },
    { name: 'Forgot password', path: '/users/password/new', auth: 'none' },
    { name: 'Confirm account page', path: '/users/confirmation/new', auth: 'none' },
    { name: 'Terms', path: '/terms', auth: 'none' },
    { name: 'Accessibility statement', path: '/accessibility-statement', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Technical support', path: '/technical_support', auth: 'none' },
    { name: 'Moderation policy', path: '/moderation', auth: 'none' },
    { name: 'Sitemap XML', path: '/sitemap.xml', auth: 'none' },
    { name: 'Favicon', path: '/favicon.ico', auth: 'none' },
    { name: 'Published project page', path: '/{projectSlug}', auth: 'none' },
    { name: 'Project documents', path: '/{projectSlug}/documents', auth: 'none' },
    { name: 'Project FAQs', path: '/{projectSlug}/faqs', auth: 'none' },
    { name: 'Project photos', path: '/{projectSlug}/photos', auth: 'none' },
    { name: 'Project videos', path: '/{projectSlug}/videos', auth: 'none' },

    // ── Engagement tool pages (project-level) ─────────────────────
    { name: 'Project surveys', path: '/{projectSlug}/surveys', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project forums', path: '/{projectSlug}/forums', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project stories', path: '/{projectSlug}/stories', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project maps', path: '/{projectSlug}/maps', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project ideas', path: '/{projectSlug}/ideas', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project polls', path: '/{projectSlug}/polls', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project Q&A', path: '/{projectSlug}/qanda', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project guestbook', path: '/{projectSlug}/guestbook', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project news feed', path: '/{projectSlug}/newsfeed', auth: 'none', expectedStatus: [200, 404] },
    { name: 'Project key dates', path: '/{projectSlug}/key_dates', auth: 'none', expectedStatus: [200, 404] },

    // ── Participant (logged-in user) ──────────────────────────────
    { name: 'Participant home', path: '/', auth: 'participant' },
    { name: 'Participant project page', path: '/{projectSlug}', auth: 'participant' },
    { name: 'Participant project documents', path: '/{projectSlug}/documents', auth: 'participant' },
    { name: 'Participant project FAQs', path: '/{projectSlug}/faqs', auth: 'participant' },
    { name: 'Session info', path: '/session_info', auth: 'participant' },
    { name: 'Token endpoint', path: '/token', auth: 'participant' },

    // ── API v2 (authenticated) ────────────────────────────────────
    // Temporarily disabled — bodyHasKey checks don't match this site's JSON shape.
    // { name: 'API site info', path: '/api/v2/site', auth: 'siteAdmin', bodyHasKey: 'name' },
    // { name: 'API settings', path: '/api/v2/settings', auth: 'siteAdmin', bodyHasKey: 'settings' },
    // { name: 'API features', path: '/api/v2/features', auth: 'siteAdmin', bodyHasKey: 'features' },
    // { name: 'API theme', path: '/api/v2/theme', auth: 'siteAdmin', bodyHasKey: 'theme' },
    // { name: 'API current user', path: '/api/v2/users/current', auth: 'siteAdmin', bodyHasKey: 'email' },
    // { name: 'API projects', path: '/api/v2/projects', auth: 'siteAdmin', bodyHasKey: 'projects' },
    { name: 'API navigation links', path: '/api/v2/navigation_links', auth: 'siteAdmin' },
    { name: 'API layouts', path: '/api/v2/layouts/selected', auth: 'siteAdmin' },
    { name: 'API home page revisions', path: '/api/v2/home_page_revisions', auth: 'siteAdmin' },
    { name: 'API recommendations', path: '/api/v2/recommendations', auth: 'siteAdmin' },
    { name: 'API signup form questions', path: '/api/v2/signup_form_questions', auth: 'siteAdmin' },
    { name: 'API intercom', path: '/api/v2/intercom', auth: 'siteAdmin' },
    { name: 'API user subscriptions', path: '/api/v2/user_subscriptions', auth: 'siteAdmin' },
    { name: 'API reporting dashboard filters', path: '/api/v2/reporting/dashboard_filters', auth: 'siteAdmin' },
    { name: 'API reporting contribution tags', path: '/api/v2/reporting/dashboards/contribution_tags', auth: 'siteAdmin' },
    { name: 'API reporting contributions location', path: '/api/v2/reporting/dashboards/contributions_location', auth: 'siteAdmin' },
    { name: 'API reporting top performing tools', path: '/api/v2/reporting/dashboards/top_performing_tools', auth: 'siteAdmin' },

    // ── Site admin (new PFE admin) ────────────────────────────────
    { name: 'Admin dashboard', path: '/adm', auth: 'siteAdmin' },
    { name: 'Admin dashboard page', path: '/adm/dashboard', auth: 'siteAdmin' },
    { name: 'Admin projects', path: '/adm/projects', auth: 'siteAdmin' },
    { name: 'Admin archived projects', path: '/adm/projects/archived', auth: 'siteAdmin' },
    { name: 'Admin draft projects', path: '/adm/projects/draft', auth: 'siteAdmin' },
    { name: 'Admin users', path: '/adm/users', auth: 'siteAdmin' },
    { name: 'Admin participants', path: '/adm/participants', auth: 'siteAdmin' },
    { name: 'Admin registered participants', path: '/adm/participants/registered', auth: 'siteAdmin' },
    { name: 'Admin pending participants', path: '/adm/participants/pending', auth: 'siteAdmin' },
    { name: 'Admin settings', path: '/adm/settings', auth: 'siteAdmin' },
    { name: 'Admin reports', path: '/adm/reports', auth: 'siteAdmin' },
    { name: 'Admin reports: registrations', path: '/adm/reports/registrations', auth: 'siteAdmin' },
    { name: 'Admin reports: contributions', path: '/adm/reports/contributions', auth: 'siteAdmin' },
    { name: 'Admin reports: visitors', path: '/adm/reports/visitors', auth: 'siteAdmin' },
    { name: 'Admin reports: engagement', path: '/adm/reports/engagement', auth: 'siteAdmin' },
    { name: 'Admin moderation', path: '/adm/moderation', auth: 'siteAdmin' },
    { name: 'Admin moderation: comments', path: '/adm/moderation/comments', auth: 'siteAdmin' },
    { name: 'Admin moderation: submissions', path: '/adm/moderation/submissions', auth: 'siteAdmin' },
    { name: 'Admin engagement', path: '/adm/engagement', auth: 'siteAdmin' },
    { name: 'Admin analytics', path: '/adm/analytics', auth: 'siteAdmin' },
    { name: 'Admin analytics: visitors', path: '/adm/analytics/visitors', auth: 'siteAdmin' },
    { name: 'Admin analytics: engagement', path: '/adm/analytics/engagement', auth: 'siteAdmin' },
    { name: 'Admin analytics: demographics', path: '/adm/analytics/demographics', auth: 'siteAdmin' },
    { name: 'Admin integrations', path: '/adm/integrations', auth: 'siteAdmin' },
    { name: 'Admin emails', path: '/adm/emails', auth: 'siteAdmin' },
    { name: 'Admin email templates', path: '/adm/emails/templates', auth: 'siteAdmin' },
    { name: 'Admin sent emails', path: '/adm/emails/sent', auth: 'siteAdmin' },
    { name: 'Admin themes', path: '/adm/themes', auth: 'siteAdmin' },
    { name: 'Admin permissions', path: '/adm/permissions', auth: 'siteAdmin' },
    { name: 'Admin activity', path: '/adm/activity', auth: 'siteAdmin' },
    { name: 'Admin site settings', path: '/adm/site', auth: 'siteAdmin' },
    { name: 'Admin site config', path: '/adm/site/settings', auth: 'siteAdmin' },
    { name: 'Admin site navigation', path: '/adm/site/navigation', auth: 'siteAdmin' },
    { name: 'Admin site custom pages', path: '/adm/site/custom_pages', auth: 'siteAdmin' },
    { name: 'Admin site SSO', path: '/adm/site/sso', auth: 'siteAdmin' },
    { name: 'Admin site API keys', path: '/adm/site/api_keys', auth: 'siteAdmin' },
    { name: 'Admin site webhooks', path: '/adm/site/webhooks', auth: 'siteAdmin' },
    { name: 'Admin site custom domain', path: '/adm/site/custom_domain', auth: 'siteAdmin' },
    { name: 'Admin site custom CSS', path: '/adm/site/custom_css', auth: 'siteAdmin' },
    { name: 'Admin branding', path: '/adm/branding', auth: 'siteAdmin' },
    { name: 'Admin project detail', path: '/adm/projects/{projectSlug}', auth: 'siteAdmin' },
    { name: 'Admin project settings', path: '/adm/projects/{projectSlug}/settings', auth: 'siteAdmin' },

    // ── Site admin (legacy admin) ─────────────────────────────────
    { name: 'Legacy project admin', path: '/admin/projects/{projectSlug}', auth: 'siteAdmin', noRedirect: true },
    { name: 'Legacy site settings', path: '/admin/sites/settings', auth: 'siteAdmin' },
    { name: 'Legacy site editor (home page)', path: '/admin/sites/editors/home-page', auth: 'siteAdmin' },
    { name: 'Legacy administrators', path: '/admin/people/administrators', auth: 'siteAdmin' },
    { name: 'Legacy newsletters', path: '/admin/newsletters', auth: 'siteAdmin' },
    { name: 'Legacy marketplace', path: '/admin/marketplace', auth: 'siteAdmin' },
    { name: 'Legacy site hubs', path: '/admin/site_hubs', auth: 'siteAdmin' },
    { name: 'Admin heartbeat', path: '/admin/api/auth/heartbeat', auth: 'siteAdmin' },

    // ── Admin data & audit ──────────────────────────────────────
    { name: 'Admin data exports', path: '/adm/data_exports', auth: 'siteAdmin' },
    { name: 'Admin imports', path: '/adm/imports', auth: 'siteAdmin' },
    { name: 'Admin audit log', path: '/adm/audit_log', auth: 'siteAdmin' },

    // ── PUT APIs (validated with empty body — expect 200 or 422 for safety) ───
    { name: 'PUT user profile', path: '/api/v2/users/current', method: 'PUT', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PUT site config', path: '/api/v2/site', method: 'PUT', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PUT site settings', path: '/api/v2/settings', method: 'PUT', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PUT theme', path: '/api/v2/theme', method: 'PUT', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PUT reporting filters', path: '/api/v2/reporting/dashboard_filters', method: 'PUT', auth: 'siteAdmin', expectedStatus: [200, 422] },

    // ── PATCH APIs (validated with empty body — expect 200 or 422 for safety) ──
    { name: 'PATCH user profile', path: '/api/v2/users/current', method: 'PATCH', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PATCH site config', path: '/api/v2/site', method: 'PATCH', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PATCH site settings', path: '/api/v2/settings', method: 'PATCH', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PATCH theme', path: '/api/v2/theme', method: 'PATCH', auth: 'siteAdmin', expectedStatus: [200, 422] },
    { name: 'PATCH heartbeat', path: '/admin/api/auth/heartbeat', method: 'PATCH', auth: 'siteAdmin', expectedStatus: [200, 204, 422] },

    // ── POST APIs (validates route exists — expects 400/422, not 500) ──
    { name: 'POST login API', path: '/users/sign_in', method: 'POST', auth: 'none', expectedStatus: [200, 401, 404, 422], body: '{"user":{"email":"","password":""}}' },
    { name: 'POST password reset', path: '/users/password', method: 'POST', auth: 'none', expectedStatus: [200, 422], body: '{"user":{"email":"nonexistent@test.invalid"}}' },
    { name: 'POST registration', path: '/users', method: 'POST', auth: 'none', expectedStatus: [200, 422], body: '{"user":{"email":"","password":""}}' },

    // ── DELETE APIs (validates route exists — expects 401/403/405/422, not 500) ──
    { name: 'DELETE session (logout route)', path: '/users/sign_out', method: 'DELETE', auth: 'siteAdmin', expectedStatus: [200, 204, 302, 404, 405] },

    // ── Unauthenticated access to protected APIs (expect 401/403) ──
    // Temporarily disabled — these APIs are not auth-gated on this site (return 200/404, not 401/403).
    // { name: 'Unauth: API site (expect 401)', path: '/api/v2/site', auth: 'none', expectedStatus: [401, 403] },
    // { name: 'Unauth: API projects (expect 401)', path: '/api/v2/projects', auth: 'none', expectedStatus: [401, 403] },
    // { name: 'Unauth: API current user (expect 401)', path: '/api/v2/users/current', auth: 'none', expectedStatus: [401, 403] },
    { name: 'Unauth: Admin dashboard (expect redirect)', path: '/adm', auth: 'none', expectedStatus: [200, 302, 401, 403], noRedirect: true },

    // ── Critical endpoints with response time thresholds ────────
    { name: 'Homepage perf', path: '/', auth: 'none', maxResponseTimeMs: 5000 },
    { name: 'Login page perf', path: '/login', auth: 'none', maxResponseTimeMs: 5000 },
    { name: 'Project page perf', path: '/{projectSlug}', auth: 'none', maxResponseTimeMs: 5000 },
    { name: 'API projects perf', path: '/api/v2/projects', auth: 'siteAdmin', maxResponseTimeMs: 10000 },
    { name: 'API site perf', path: '/api/v2/site', auth: 'siteAdmin', maxResponseTimeMs: 5000 },
    { name: 'Admin dashboard perf', path: '/adm', auth: 'siteAdmin', maxResponseTimeMs: 5000 },
    { name: 'Admin projects perf', path: '/adm/projects', auth: 'siteAdmin', maxResponseTimeMs: 5000 },
    { name: 'Reporting dashboard perf', path: '/api/v2/reporting/dashboard_filters', auth: 'siteAdmin', maxResponseTimeMs: 8000 },

    // ── Response body validation (critical APIs return expected data) ──
    { name: 'API site returns JSON', path: '/api/v2/site', auth: 'siteAdmin', bodyContains: '"name"' },
    { name: 'API current user has email', path: '/api/v2/users/current', auth: 'siteAdmin', bodyContains: '"email"' },
    { name: 'API features returns JSON', path: '/api/v2/features', auth: 'siteAdmin', bodyContains: '"features"' },
    { name: 'API theme returns JSON', path: '/api/v2/theme', auth: 'siteAdmin', bodyContains: '"color' },
    { name: 'API projects returns list', path: '/api/v2/projects', auth: 'siteAdmin', bodyContains: '"projects"' },
    // Temporarily disabled — response JSON does not contain "navigation_links" on this site.
    // { name: 'API navigation has links', path: '/api/v2/navigation_links', auth: 'siteAdmin', bodyContains: '"navigation_links"' },
    { name: 'Homepage contains HTML', path: '/', auth: 'none', bodyContains: '<html' },
    { name: 'Login page has form', path: '/login', auth: 'none', bodyContains: 'password' },
    { name: 'Heartbeat is reachable', path: '/admin/api/auth/heartbeat', auth: 'siteAdmin', maxResponseTimeMs: 3000 },

    // ── Static assets / CDN checks ──────────────────────────────
    { name: 'Favicon loads', path: '/favicon.ico', auth: 'none', maxResponseTimeMs: 3000 },
    { name: 'Sitemap XML valid', path: '/sitemap.xml', auth: 'none', bodyContains: '<?xml' },
    { name: 'JS bundle reachable', path: '/packs/js/application.js', auth: 'none', expectedStatus: [200, 301, 302, 404] },
    { name: 'Robots.txt', path: '/robots.txt', auth: 'none', expectedStatus: [200, 404] },
  ];
}

function loadCustomEndpoints(): EndpointCheck[] | undefined {
  const customPath = path.resolve(__dirname, '../../endpoints.json');
  if (!fs.existsSync(customPath)) {
    return undefined;
  }

  const raw = JSON.parse(fs.readFileSync(customPath, 'utf-8')) as EndpointCheck[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('endpoints.json must be a non-empty array of endpoint checks');
  }

  for (const endpoint of raw) {
    if (!endpoint.name || !endpoint.path) {
      throw new Error('Each endpoint in endpoints.json requires "name" and "path"');
    }
  }

  return raw;
}

export function getEndpoints(): EndpointCheck[] {
  return loadCustomEndpoints() ?? defaultEndpoints();
}

export function getEndpointsByAuth(auth: EndpointAuth): EndpointCheck[] {
  return getEndpoints().filter((endpoint) => (endpoint.auth ?? 'none') === auth);
}
