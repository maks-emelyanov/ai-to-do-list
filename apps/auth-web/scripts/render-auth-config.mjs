import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultTemplatePath = path.resolve(
  scriptDir,
  '../auth-config.template.js'
);
const defaultOutputPath = path.resolve(scriptDir, '../public/auth-config.js');
const placeholder = '__AUTH_WEB_CONFIG__';

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required to render hosted auth config.`);
  }

  return value;
}

function requireString(config, pathParts) {
  const value = pathParts.reduce((next, key) => next?.[key], config);

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Hosted auth config is missing ${pathParts.join('.')}.`);
  }
}

function requireStringArray(config, key) {
  const value = config[key];

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Hosted auth config ${key} must be an array of strings.`);
  }
}

function validateConfig(config) {
  requireString(config, ['firebase', 'apiKey']);
  requireString(config, ['firebase', 'authDomain']);
  requireString(config, ['firebase', 'projectId']);
  requireString(config, ['firebase', 'appId']);
  requireString(config, ['canonicalAuthDomain']);
  requireString(config, ['appUrl']);
  requireStringArray(config, 'allowedReturnHosts');
  requireStringArray(config, 'redirectAuthDomains');
}

const config = JSON.parse(requireEnv('AUTH_WEB_CONFIG'));
const templatePath = path.resolve(
  process.env.AUTH_WEB_CONFIG_TEMPLATE || defaultTemplatePath
);
const outputPath = path.resolve(
  process.env.AUTH_WEB_CONFIG_OUTPUT || defaultOutputPath
);

validateConfig(config);

const template = await readFile(templatePath, 'utf8');

if (!template.includes(placeholder)) {
  throw new Error(`Hosted auth config template must contain ${placeholder}.`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  template.replace(placeholder, JSON.stringify(config, null, 2)),
  'utf8'
);
