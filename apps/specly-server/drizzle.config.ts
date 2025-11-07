import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/database/schema/*.ts',
    out: './src/database/migrations',
    dialect: 'sqlite',
    migrations: {
        prefix: 'timestamp'
    },
    verbose: true,
    strict: true
});
