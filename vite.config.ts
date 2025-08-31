import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
    return {
      resolve: {
        alias: {
          // FIX: Replaced `process.cwd()` with `__dirname` to prevent a TypeScript type error.
          // `__dirname` is provided by Vite's config environment and reliably points to the project root,
          // which is the expected behavior for the '@' alias.
          '@': path.resolve(__dirname),
        }
      }
    };
});