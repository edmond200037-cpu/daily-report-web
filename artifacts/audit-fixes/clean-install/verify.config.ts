import config from './vite.config.ts'; export default { ...config, resolve: { ...config.resolve, preserveSymlinks: true } };
