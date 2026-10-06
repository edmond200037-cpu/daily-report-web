import original from '../../vite.config';
export default { ...original, resolve: { ...original.resolve, preserveSymlinks: true } };
