import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExpressServer } from '@omar391/mcp-kit/server/express';
import { configureSpeclyApp } from '../server/specly-express-hooks.js';

const hooksDir = path.dirname(fileURLToPath(new URL('../server/specly-express-hooks.ts', import.meta.url)));
const uiDistPath = path.resolve(hooksDir, '../../../specly-ui/dist');
const indexPath = path.join(uiDistPath, 'index.html');

describe('configureSpeclyApp static assets', () => {
    afterEach(() => {
      try {
        if (fs.existsSync(indexPath)) {
            fs.rmSync(indexPath);
        }
        if (fs.existsSync(uiDistPath)) {
            fs.rmSync(uiDistPath, { recursive: true, force: true });
        }
    } catch {
          // ignore cleanup errors in tests
      }
  });

    it('serves index.html for non-API GET requests in production mode', async () => {
        fs.mkdirSync(uiDistPath, { recursive: true });
        fs.writeFileSync(indexPath, '<html><body><div>hello-ui</div></body></html>');

      const server = createExpressServer({
          port: 0,
          dev: false,
          info: { name: 'specly', version: 'test', uiHintUrl: 'http://localhost:5173' },
          endpoints: { apiBase: '/api', mcpBase: '/mcp', healthPath: '/health' },
      });

      configureSpeclyApp(server.app, { dev: false });
      server.setupHealthAndRoot();

      const response = await request(server.app)
          .get('/some/route')
          .expect(200);

      expect(response.text.toLowerCase()).toContain('hello-ui');

      await server.stop();
  });

    it('skips SPA fallback for API routes when no router is mounted', async () => {
        const server = createExpressServer({
            port: 0,
            dev: false,
            info: { name: 'specly', version: 'test', uiHintUrl: 'http://localhost:5173' },
            endpoints: { apiBase: '/api', mcpBase: '/mcp', healthPath: '/health' },
        });

      configureSpeclyApp(server.app, { dev: false });
      server.setupHealthAndRoot();

      await request(server.app)
          .get('/api/something')
          .expect(404);

      await server.stop();
  });
});
