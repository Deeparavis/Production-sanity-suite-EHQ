import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

type PostmanUrl =
  | string
  | {
      raw?: string;
      host?: string[];
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
  response?: unknown[];
};

type PostmanCollection = {
  info?: Record<string, unknown>;
  item?: PostmanItem[];
  variable?: unknown[];
};

type ExportSummary = {
  topLevelItems: number;
  totalRequests: number;
  requestsByFolder: Record<string, number>;
};

const AUTH_TOKEN = /\[auth:(none|participant|siteAdmin)\]/i;
const STATUS_TOKEN = /\[status:[0-9,\s]+\]/i;

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Required env var ${key} is not set.`);
  }
  return value;
}

function optional(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function parseFolderFilter(): Set<string> | undefined {
  const raw = optional('POSTMAN_EXPORT_INCLUDE_FOLDERS');
  if (!raw) return undefined;

  const names = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return names.length > 0 ? new Set(names) : undefined;
}

function isRequest(item: PostmanItem): boolean {
  return !!item.request && !item.item;
}

function toRawPath(url: PostmanUrl): string {
  if (typeof url === 'string') return url;
  if (url.raw) return url.raw;

  const pathname = `/${(url.path ?? []).join('/')}`.replace(/\/+/g, '/');
  const query = (url.query ?? []).filter((q) => !q.disabled && q.key);
  if (query.length === 0) return pathname;

  const qs = query
    .map((q) => `${encodeURIComponent(q.key as string)}=${encodeURIComponent(q.value ?? '')}`)
    .join('&');
  return `${pathname}?${qs}`;
}

function normalizeUrl(url: PostmanUrl): PostmanUrl {
  const raw = toRawPath(url);

  if (raw.includes('{{baseUrl}}')) return raw;

  try {
    const parsed = new URL(raw);
    return `{{baseUrl}}${parsed.pathname}${parsed.search}`;
  } catch {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/')) return `{{baseUrl}}${raw}`;
    return `{{baseUrl}}/${raw}`;
  }
}

function withDefaultTokens(name: string, auth: string, status: string): string {
  let next = name.trim();
  if (!AUTH_TOKEN.test(next)) {
    next = `${next} [auth:${auth}]`;
  }
  if (!STATUS_TOKEN.test(next)) {
    next = `${next} [status:${status}]`;
  }
  return next;
}

function shouldKeepRequest(item: PostmanItem): boolean {
  if (!isRequest(item)) return false;
  const method = item.request?.method?.toUpperCase() ?? 'GET';
  return method === 'GET' || method === 'HEAD';
}

function filterItems(
  items: PostmanItem[],
  folderFilter: Set<string> | undefined,
  defaults: { auth: string; status: string },
  depth = 0
): PostmanItem[] {
  const output: PostmanItem[] = [];

  for (const item of items) {
    if (Array.isArray(item.item)) {
      const includeFolder = !folderFilter || folderFilter.has(item.name ?? '');
      const children = filterItems(item.item, folderFilter, defaults, depth + 1);
      if ((depth > 0 || includeFolder) && children.length > 0) {
        output.push({ ...item, item: children });
      }
      continue;
    }

    if (!shouldKeepRequest(item)) continue;

    const requestUrl = item.request?.url;
    if (!requestUrl) continue;

    output.push({
      ...item,
      name: withDefaultTokens(item.name || 'Unnamed request', defaults.auth, defaults.status),
      request: {
        ...item.request,
        url: normalizeUrl(requestUrl),
      },
      response: [],
    });
  }

  return output;
}

function summarizeExport(items: PostmanItem[]): ExportSummary {
  const summary: ExportSummary = {
    topLevelItems: items.length,
    totalRequests: 0,
    requestsByFolder: {},
  };

  function walk(children: PostmanItem[], folderPath: string[] = []): void {
    for (const child of children) {
      if (Array.isArray(child.item)) {
        walk(child.item, [...folderPath, child.name || 'Unnamed folder']);
        continue;
      }
      if (!isRequest(child)) continue;

      const folderKey = folderPath.length > 0 ? folderPath.join(' > ') : '(root)';
      summary.totalRequests += 1;
      summary.requestsByFolder[folderKey] = (summary.requestsByFolder[folderKey] ?? 0) + 1;
    }
  }

  walk(items);
  return summary;
}

function printSummary(summary: ExportSummary): void {
  console.log(`Top-level items: ${summary.topLevelItems}`);
  console.log(`Total selected requests: ${summary.totalRequests}`);
  console.log('Requests by folder:');

  const folders = Object.entries(summary.requestsByFolder).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [folder, count] of folders) {
    console.log(`- ${folder}: ${count}`);
  }
}

async function fetchCollection(collectionId: string, apiKey: string): Promise<PostmanCollection> {
  const response = await fetch(`https://api.getpostman.com/collections/${encodeURIComponent(collectionId)}`, {
    headers: {
      'X-Api-Key': apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postman API request failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as { collection?: PostmanCollection };
  if (!json.collection) {
    throw new Error('Postman API response did not include a collection object.');
  }

  return json.collection;
}

async function main() {
  const apiKey = required('POSTMAN_API_KEY');
  const sourceCollectionId = required('POSTMAN_SOURCE_COLLECTION_ID');
  const outputPath = optional('POSTMAN_EXPORT_OUTPUT') || 'postman-collection.json';
  const defaultAuth = optional('POSTMAN_EXPORT_DEFAULT_AUTH') || 'none';
  const defaultStatus = optional('POSTMAN_EXPORT_DEFAULT_STATUS') || '200';
  const folderFilter = parseFolderFilter();
  const dryRun = process.argv.includes('--dry-run');

  const source = await fetchCollection(sourceCollectionId, apiKey);
  const filteredItems = filterItems(source.item ?? [], folderFilter, {
    auth: defaultAuth,
    status: defaultStatus,
  });

  if (filteredItems.length === 0) {
    throw new Error('No GET/HEAD requests matched the current export filters.');
  }

  const summary = summarizeExport(filteredItems);
  if (summary.totalRequests === 0) {
    throw new Error('No request items matched after filtering.');
  }

  const target: PostmanCollection = {
    info: source.info,
    item: filteredItems,
    variable: source.variable,
  };

  const resolvedOutput = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(__dirname, `../${outputPath}`);

  if (dryRun) {
    console.log('Dry run enabled: no output file written.');
    printSummary(summary);
    console.log(`Would write collection to: ${resolvedOutput}`);
    return;
  }

  fs.writeFileSync(resolvedOutput, `${JSON.stringify(target, null, 2)}\n`, 'utf-8');
  console.log(`Exported ${summary.totalRequests} request(s) to ${resolvedOutput}`);
  printSummary(summary);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Postman export failed: ${message}`);
  process.exit(1);
});
