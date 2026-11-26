import * as fs from 'fs';
import * as path from 'path';
import { EndpointAuth, EndpointCheck } from './endpoints';

type Meta = {
  auth?: EndpointAuth;
  status?: number[];
  maxMs?: number;
  contains?: string;
};

type PostmanUrl =
  | string
  | {
      raw?: string;
      path?: string[];
      query?: Array<{ key?: string; value?: string; disabled?: boolean }>;
    };

type PostmanRequest = {
  method?: string;
  url?: PostmanUrl;
};

type PostmanItem = {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
};

type PostmanCollection = {
  item?: PostmanItem[];
};

const AUTH_TOKEN = /\[auth:(none|participant|siteAdmin)\]/i;
const STATUS_TOKEN = /\[status:([0-9,\s]+)\]/i;
const MAX_MS_TOKEN = /\[maxMs:(\d+)\]/i;
const CONTAINS_TOKEN = /\[contains:([^\]]+)\]/i;

function resolveCollectionPath(): string {
  const configured = process.env.POSTMAN_COLLECTION_PATH || 'postman-collection.json';
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(__dirname, `../../${configured}`);
}

function parseMeta(name: string): Meta {
  const meta: Meta = {};

  const auth = AUTH_TOKEN.exec(name);
  if (auth?.[1]) {
    meta.auth = auth[1] as EndpointAuth;
  }

  const status = STATUS_TOKEN.exec(name);
  if (status?.[1]) {
    const values = status[1]
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value));
    if (values.length > 0) {
      meta.status = values;
    }
  }

  const maxMs = MAX_MS_TOKEN.exec(name);
  if (maxMs?.[1]) {
    meta.maxMs = Number(maxMs[1]);
  }

  const contains = CONTAINS_TOKEN.exec(name);
  if (contains?.[1]) {
    meta.contains = contains[1].trim();
  }

  return meta;
}

function stripMetaTokens(name: string): string {
  return name
    .replace(AUTH_TOKEN, '')
    .replace(STATUS_TOKEN, '')
    .replace(MAX_MS_TOKEN, '')
    .replace(CONTAINS_TOKEN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePathFromRaw(raw: string): string {
  const sanitized = raw.replace(/^{{baseUrl}}/i, '');

  if (sanitized.startsWith('/')) {
    return sanitized;
  }

  try {
    const parsed = new URL(sanitized);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
  }
}

function resolvePathFromUrl(url: PostmanUrl): string | undefined {
  if (typeof url === 'string') {
    return resolvePathFromRaw(url);
  }

  if (url.raw) {
    return resolvePathFromRaw(url.raw);
  }

  if (!url.path || url.path.length === 0) {
    return undefined;
  }

  const pathname = `/${url.path.join('/')}`.replace(/\/+/g, '/');
  const enabledQuery = (url.query ?? []).filter((entry) => !entry.disabled && entry.key);

  if (enabledQuery.length === 0) {
    return pathname;
  }

  const query = enabledQuery
    .map((entry) => `${encodeURIComponent(entry.key as string)}=${encodeURIComponent(entry.value ?? '')}`)
    .join('&');

  return `${pathname}?${query}`;
}

function collectRequests(items: PostmanItem[], folderPath: string[] = []): EndpointCheck[] {
  const endpoints: EndpointCheck[] = [];

  for (const item of items) {
    const currentName = item.name?.trim() || 'Unnamed request';
    const nextPath = [...folderPath, currentName];

    if (Array.isArray(item.item) && item.item.length > 0) {
      endpoints.push(...collectRequests(item.item, nextPath));
      continue;
    }

    if (!item.request?.url) {
      continue;
    }

    const method = (item.request.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) {
      continue;
    }

    const endpointPath = resolvePathFromUrl(item.request.url);
    if (!endpointPath) {
      continue;
    }

    const fullName = nextPath.join(' > ');
    const meta = parseMeta(fullName);
    const cleanName = stripMetaTokens(fullName);
    const expectedStatus =
      meta.status && meta.status.length === 1 ? meta.status[0] : meta.status;

    endpoints.push({
      name: cleanName,
      path: endpointPath,
      method: method as EndpointCheck['method'],
      auth: meta.auth ?? 'none',
      expectedStatus: expectedStatus ?? 200,
      maxResponseTimeMs: meta.maxMs,
      bodyContains: meta.contains,
    });
  }

  return endpoints;
}

export function getPostmanCollectionEndpoints(): EndpointCheck[] {
  const collectionPath = resolveCollectionPath();
  if (!fs.existsSync(collectionPath)) {
    throw new Error(
      `Postman collection not found at ${collectionPath}. Set POSTMAN_COLLECTION_PATH or add postman-collection.json at the repo root.`
    );
  }

  const raw = fs.readFileSync(collectionPath, 'utf-8');
  const collection = JSON.parse(raw) as PostmanCollection;
  const items = collection.item ?? [];

  const endpoints = collectRequests(items);
  if (endpoints.length === 0) {
    throw new Error(
      `No GET/HEAD requests found in Postman collection at ${collectionPath}. Add requests or adjust filters in src/config/postmanEndpoints.ts.`
    );
  }

  return endpoints;
}

export function getPostmanEndpointsByAuth(auth: EndpointAuth): EndpointCheck[] {
  return getPostmanCollectionEndpoints().filter((endpoint) => (endpoint.auth ?? 'none') === auth);
}
