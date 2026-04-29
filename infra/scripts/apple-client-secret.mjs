#!/usr/bin/env node
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const MAX_TTL_SECONDS = 86400 * 180;

function getEnv(name) {
  return process.env[name]?.trim() ?? '';
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readLength(buffer, offset) {
  const first = buffer[offset];

  if (first < 0x80) {
    return { length: first, offset: offset + 1 };
  }

  const bytes = first & 0x7f;
  let length = 0;

  for (let index = 0; index < bytes; index += 1) {
    length = (length << 8) | buffer[offset + 1 + index];
  }

  return { length, offset: offset + 1 + bytes };
}

function readInteger(buffer, offset) {
  if (buffer[offset] !== 0x02) {
    throw new Error('Expected ASN.1 integer in ECDSA signature.');
  }

  const lengthInfo = readLength(buffer, offset + 1);
  const end = lengthInfo.offset + lengthInfo.length;
  let value = buffer.subarray(lengthInfo.offset, end);

  while (value.length > 0 && value[0] === 0x00) {
    value = value.subarray(1);
  }

  if (value.length > 32) {
    throw new Error('ECDSA signature integer is longer than expected.');
  }

  return {
    offset: end,
    value: Buffer.concat([Buffer.alloc(32 - value.length), value]),
  };
}

function derToJose(signature) {
  if (signature[0] !== 0x30) {
    throw new Error('Expected ASN.1 sequence in ECDSA signature.');
  }

  const sequence = readLength(signature, 1);
  const r = readInteger(signature, sequence.offset);
  const s = readInteger(signature, r.offset);

  return Buffer.concat([r.value, s.value]);
}

function getPrivateKey() {
  const privateKey = getEnv('APPLE_AUTH_PROVIDER_PRIVATE_KEY');
  const privateKeyFile = getEnv('APPLE_AUTH_PROVIDER_PRIVATE_KEY_FILE');

  if (privateKey) {
    return privateKey.replace(/\\n/g, '\n');
  }

  if (privateKeyFile) {
    return readFileSync(privateKeyFile, 'utf8');
  }

  return '';
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const providedClientSecret = getEnv('APPLE_AUTH_PROVIDER_CLIENT_SECRET');

if (providedClientSecret) {
  console.log(providedClientSecret);
  process.exit(0);
}

const servicesId = getEnv('APPLE_AUTH_PROVIDER_SERVICES_ID');
const teamId = getEnv('APPLE_AUTH_PROVIDER_TEAM_ID');
const keyId = getEnv('APPLE_AUTH_PROVIDER_KEY_ID');
const privateKey = getPrivateKey();

if (!servicesId && !teamId && !keyId && !privateKey) {
  console.log('');
  process.exit(0);
}

if (!servicesId || !teamId || !keyId || !privateKey) {
  fail(
    'Set APPLE_AUTH_PROVIDER_SERVICES_ID, APPLE_AUTH_PROVIDER_TEAM_ID, APPLE_AUTH_PROVIDER_KEY_ID, and APPLE_AUTH_PROVIDER_PRIVATE_KEY or APPLE_AUTH_PROVIDER_PRIVATE_KEY_FILE.'
  );
}

const now = Math.floor(Date.now() / 1000);
const header = {
  alg: 'ES256',
  kid: keyId,
};
const payload = {
  aud: APPLE_AUDIENCE,
  exp: now + MAX_TTL_SECONDS,
  iat: now,
  iss: teamId,
  sub: servicesId,
};

const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(
  JSON.stringify(payload)
)}`;
const signer = createSign('SHA256');
signer.update(unsignedToken);
signer.end();

const signature = derToJose(signer.sign(privateKey));

console.log(`${unsignedToken}.${base64Url(signature)}`);
