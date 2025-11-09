import express, { type Application } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { IExpressServer } from '@omar391/mcp-kit/server/express';
import { createApiRouter } from '../api/router.js';
import type { DatabaseService } from '../services/database-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function setupSpeclyApi(server: IExpressServer, databaseService: DatabaseService): Promise<void> {
    try {
        const apiRouter = await createApiRouter(databaseService);
        server.app.use('/api', apiRouter);
        console.log('REST API endpoints configured');
    } catch (error) {
        console.warn('REST API setup failed, continuing without API endpoints:', error);
    }
}

export function configureSpeclyApp(app: Application, options: { dev: boolean }): void {
    if (!options.dev) {
        configureProductionStaticUI(app);
    }
}

function configureProductionStaticUI(app: Application): void {
    try {
        const uiDistPath = path.resolve(__dirname, '../../../specly-ui/dist');
        app.use(express.static(uiDistPath));

        app.use((req, res, next) => {
            if (
                req.path.startsWith('/api') ||
                req.path.startsWith('/mcp') ||
                req.path.startsWith('/health') ||
                req.path.includes('.') ||
                req.method !== 'GET'
            ) {
                return next();
            }

            const indexPath = path.join(uiDistPath, 'index.html');
            res.sendFile(indexPath, (err) => {
                if (err) {
                    next();
                }
            });
        });

        console.log(`Production static UI configured to serve from ${uiDistPath}`);
    } catch (error) {
        console.warn('Production static UI setup failed, API-only mode:', error);
    }
}
