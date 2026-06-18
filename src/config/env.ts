import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `Required env var ${key} is not set. Copy .env.example to .env and fill in values.`
    );
  }
  return val;
}

function optional(key: string): string | undefined {
  const val = process.env[key];
  return val && val.trim() ? val.trim() : undefined;
}

export interface BaseConfig {
  siteUrl: string;
  siteDomain: string;
}

export interface ProdConfig extends BaseConfig {
  participant: { username: string; password: string };
  siteAdmin: { username: string; password: string };
  platformAdmin?: { username: string; password: string };
  projectSlug: string;
}

function loadBaseConfig(): BaseConfig {
  return {
    siteUrl: required('EHQ_PROD_SITE_URL').replace(/\/$/, ''),
    siteDomain: required('EHQ_PROD_SITE_DOMAIN'),
  };
}

function loadConfig(): ProdConfig {
  const base = loadBaseConfig();
  return {
    ...base,
    participant: {
      username: required('PROD_PARTICIPANT_USERNAME'),
      password: required('PROD_PARTICIPANT_PASSWORD'),
    },
    siteAdmin: {
      username: required('PROD_SITEADMIN_USERNAME'),
      password: required('PROD_SITEADMIN_PASSWORD'),
    },
    platformAdmin:
      optional('PROD_PLATFORMADMIN_USERNAME') && optional('PROD_PLATFORMADMIN_PASSWORD')
        ? {
            username: required('PROD_PLATFORMADMIN_USERNAME'),
            password: required('PROD_PLATFORMADMIN_PASSWORD'),
          }
        : undefined,
    projectSlug: required('PROD_PROJECT_SLUG'),
  };
}

let cachedBase: BaseConfig | undefined;
let cached: ProdConfig | undefined;

export function getBaseConfig(): BaseConfig {
  if (!cachedBase) {
    cachedBase = loadBaseConfig();
  }
  return cachedBase;
}

export function getConfig(): ProdConfig {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}
