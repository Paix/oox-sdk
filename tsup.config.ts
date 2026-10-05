import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2020',
  // sdk-core è una peer dependency: resta fuori dal bundle, la dapp usa la sua copia
  external: ['@multiversx/sdk-core'],
});
