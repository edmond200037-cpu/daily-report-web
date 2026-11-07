import { createServer } from 'vite';

// Override inherited variables AND .env.local without editing the user's files.
process.env.VITE_SUPABASE_URL = '';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = '';
const server = await createServer({
  base: '/',
  resolve: { preserveSymlinks: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
  },
  server: { host: '127.0.0.1', port: 5317, strictPort: true, open: false },
  plugins: [{
    name: 'daily-e2e-empty-origin',
    configureServer(vite) {
      vite.middlewares.use('/__e2e_blank', (_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><title>E2E isolated origin</title>');
      });
    },
  }],
});
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { void server.close().then(() => process.exit(0)); });
}
await server.listen();
