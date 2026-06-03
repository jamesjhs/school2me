import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import argon2 from 'argon2';

const toBuffer = (uuid) => Buffer.from(uuid.replace(/-/g, ''), 'hex');

const requestJson = (port, path, body) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} });
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });

const withAuthApp = async (fetchImpl, run) => {
  const tempRoot = mkdtempSync(join(tmpdir(), 's2m-auth-test-'));
  const dbPath = join(tempRoot, 'test.sqlite');

  process.env.NODE_ENV = 'development';
  process.env.PORT = '4020';
  process.env.TRUST_PROXY = '0';
  process.env.DB_PATH = dbPath;
  process.env.DB_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.CF_TURNSTILE_SITE_KEY = 'site-key';
  process.env.CF_TURNSTILE_SECRET_KEY = 'secret-key';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '2525';
  process.env.SMTP_USER = 'noreply@example.com';
  process.env.SMTP_PASS = 'password';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_PASSWORD_HASH = await argon2.hash('admin-password');
  process.env.WEBHOOK_API_KEY = 'webhook-key';
  process.env.OPENAI_API_KEY = 'openai-key';
  process.env.FRONTEND_BASE_URL = 'http://localhost:5173';
  process.env.PUBLIC_BASE_URL = 'http://localhost:5173';

  const originalFetch = global.fetch;
  global.fetch = fetchImpl;

  const { authRouter } = await import(`../dist/routes/auth.js?${Date.now()}-${Math.random()}`);
  const { db } = await import(`../dist/database/db.js?${Date.now()}-${Math.random()}`);

  const familyId = toBuffer(randomUUID());
  const userId = toBuffer(randomUUID());
  const passwordHash = await argon2.hash('user-password');

  db.prepare('INSERT INTO families (id, routing_alias) VALUES (?, ?)').run(familyId, 'family-test');
  db.prepare('INSERT INTO users (id, family_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    familyId,
    'member@example.com',
    passwordHash,
    'member'
  );

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/auth', authRouter);

  const server = app.listen(0);

  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await run({ port });
  } finally {
    server.close();
    db.close();
    global.fetch = originalFetch;
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

test('password login rejects missing turnstile token', async () => {
  await withAuthApp(async () => ({ ok: true, json: async () => ({ success: true }) }), async ({ port }) => {
    const response = await requestJson(port, '/api/auth/password-login', {
      email: 'member@example.com',
      password: 'user-password',
      role: 'user'
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Missing required fields');
  });
});

test('password login rejects invalid turnstile token', async () => {
  await withAuthApp(async () => ({ ok: true, json: async () => ({ success: false }) }), async ({ port }) => {
    const response = await requestJson(port, '/api/auth/password-login', {
      email: 'member@example.com',
      password: 'user-password',
      role: 'user',
      'cf-turnstile-response': 'invalid-token'
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Turnstile validation failed');
  });
});

test('password login handles turnstile verifier failure', async () => {
  await withAuthApp(async () => {
    throw new Error('network error');
  }, async ({ port }) => {
    const response = await requestJson(port, '/api/auth/password-login', {
      email: 'member@example.com',
      password: 'user-password',
      role: 'user',
      'cf-turnstile-response': 'token'
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Turnstile validation failed');
  });
});

test('password login succeeds with valid turnstile token', async () => {
  await withAuthApp(async () => ({ ok: true, json: async () => ({ success: true }) }), async ({ port }) => {
    const response = await requestJson(port, '/api/auth/password-login', {
      email: 'member@example.com',
      password: 'user-password',
      role: 'user',
      'cf-turnstile-response': 'valid-token'
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.destination, '/dashboard');
  });
});
