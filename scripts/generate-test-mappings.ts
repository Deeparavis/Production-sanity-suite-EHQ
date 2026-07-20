import * as fs from 'fs';
import * as path from 'path';
import { EndpointCheck, getEndpoints } from '../src/config/endpoints';
import { getProductionWriteEndpoints } from '../src/config/productionWriteEndpoints';
import { getWriteEndpoints } from '../src/config/writeEndpoints';

const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

type MappingRow = {
  suite: 'prod-sanity' | 'write-apis' | 'prod-write-validation';
  endpoint: EndpointCheck;
};

function csv(values: Array<string | number>): string {
  return values
    .map((value) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(',');
}

function statuses(endpoint: EndpointCheck): string {
  const expected = endpoint.expectedStatus ?? 200;
  return (Array.isArray(expected) ? expected : [expected]).join('|');
}

function authLabel(endpoint: EndpointCheck): string {
  if (endpoint.auth === 'participant') return 'Participant';
  if (endpoint.auth === 'siteAdmin') return 'Site Admin';
  return 'None';
}

function bodyValidation(endpoint: EndpointCheck): string {
  const checks: string[] = [];
  if (endpoint.bodyHasKey) checks.push(`JSON key: ${endpoint.bodyHasKey}`);
  if (endpoint.bodyContains) checks.push(`Contains: ${endpoint.bodyContains}`);
  return checks.join('; ');
}

function category(row: MappingRow): string {
  const { endpoint, suite } = row;
  if (suite !== 'prod-sanity') return `Write API - ${authLabel(endpoint)}`;
  if (endpoint.auth === 'participant') return 'Participant Endpoints';
  if (endpoint.auth === 'siteAdmin') {
    return endpoint.path.startsWith('/api') ? 'Admin API' : 'Admin Pages';
  }
  return endpoint.path.includes('{projectSlug}') ? 'Public Project' : 'Public Pages';
}

function passCriteria(endpoint: EndpointCheck): string {
  const validation = endpoint.validation ?? 'success';
  const expected = statuses(endpoint);
  const suffixes: string[] = [];
  if (endpoint.maxResponseTimeMs) suffixes.push(`within ${endpoint.maxResponseTimeMs}ms`);
  if (endpoint.bodyContains) suffixes.push(`body contains ${endpoint.bodyContains}`);
  if (endpoint.bodyHasKey) suffixes.push(`JSON contains ${endpoint.bodyHasKey}`);
  const suffix = suffixes.length > 0 ? ` and ${suffixes.join(' and ')}` : '';

  if (validation === 'availability') {
    return `Returns configured availability status ${expected}; 404/204 does not prove feature success${suffix}`;
  }
  if (validation === 'rejection') {
    return `Invalid request is rejected with ${expected}${suffix}`;
  }
  if (validation === 'access-control') {
    return `Unauthenticated request is blocked or redirected with ${expected}${suffix}`;
  }
  return `Feature request succeeds with ${expected}${suffix}`;
}

function detailedId(row: MappingRow, index: number): string {
  const suite =
    row.suite === 'write-apis'
      ? 'WRT'
      : row.suite === 'prod-write-validation'
        ? 'PWR'
        : 'SAN';
  const auth =
    row.endpoint.auth === 'participant'
      ? 'PAR'
      : row.endpoint.auth === 'siteAdmin'
        ? 'ADM'
        : 'PUB';
  return `TC_${suite}_${auth}_${String(index + 1).padStart(3, '0')}`;
}

const rows: MappingRow[] = [
  ...getEndpoints().map((endpoint) => ({ suite: 'prod-sanity' as const, endpoint })),
  ...getWriteEndpoints().map((endpoint) => ({ suite: 'write-apis' as const, endpoint })),
  ...getProductionWriteEndpoints().map((endpoint) => ({
    suite: 'prod-write-validation' as const,
    endpoint,
  })),
];

for (const { suite, endpoint } of rows) {
  const method = endpoint.method ?? 'GET';
  const expected = endpoint.expectedStatus ?? 200;
  const validStatuses = Array.isArray(expected) ? expected : [expected];
  const validation = endpoint.validation ?? 'success';

  if (suite === 'prod-sanity' && !['GET', 'HEAD'].includes(method)) {
    throw new Error(`Production mapping contains write method: ${method} ${endpoint.path}`);
  }
  if (validation === 'success' && validStatuses.some((status) => status >= 400)) {
    throw new Error(`${endpoint.name} claims success while accepting an error status`);
  }
  if (
    validation === 'rejection' &&
    validStatuses.some((status) => status < 400 || status >= 500)
  ) {
    throw new Error(`${endpoint.name} rejection mapping must contain only 4xx statuses`);
  }
}

const mappingLines = [
  csv([
    'S.No',
    'Suite',
    'Test Case Name',
    'HTTP Method',
    'API Endpoint / Path',
    'Auth Required',
    'Expected Status',
    'Validation Type',
    'Performance Threshold',
    'Body Validation',
    'Category',
  ]),
  ...rows.map(({ suite, endpoint }, index) =>
    csv([
      index + 1,
      suite,
      endpoint.name,
      endpoint.method ?? 'GET',
      endpoint.path,
      authLabel(endpoint),
      statuses(endpoint),
      endpoint.validation ?? 'success',
      endpoint.maxResponseTimeMs ? `${endpoint.maxResponseTimeMs}ms` : '',
      bodyValidation(endpoint),
      category({ suite, endpoint }),
    ])
  ),
];

const detailedLines = [
  csv([
    'S.No',
    'Test Case ID',
    'Suite',
    'Test Case Name',
    'Test Description',
    'HTTP Method',
    'API Endpoint / Path',
    'Auth Required',
    'Expected Status',
    'Validation Type',
    'Performance Threshold',
    'Body Validation',
    'Pass Criteria',
    'Category',
  ]),
  ...rows.map(({ suite, endpoint }, index) =>
    csv([
      index + 1,
      detailedId({ suite, endpoint }, index),
      suite,
      endpoint.name,
      `${endpoint.method ?? 'GET'} ${endpoint.path} as ${authLabel(endpoint)}`,
      endpoint.method ?? 'GET',
      endpoint.path,
      authLabel(endpoint),
      statuses(endpoint),
      endpoint.validation ?? 'success',
      endpoint.maxResponseTimeMs ? `${endpoint.maxResponseTimeMs}ms` : '',
      bodyValidation(endpoint),
      passCriteria(endpoint),
      category({ suite, endpoint }),
    ])
  ),
];

const outputs = new Map([
  ['test-cases-api-mapping.csv', `${mappingLines.join('\n')}\n`],
  ['test-cases-detailed.csv', `${detailedLines.join('\n')}\n`],
]);

for (const [filename, content] of outputs) {
  const outputPath = path.join(ROOT, filename);
  if (CHECK_ONLY) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
    if (current !== content) {
      throw new Error(`${filename} is stale; run npm run docs:generate`);
    }
  } else {
    fs.writeFileSync(outputPath, content);
    console.log(`Generated ${filename}`);
  }
}

console.log(`${rows.length} endpoint mappings are synchronized.`);
