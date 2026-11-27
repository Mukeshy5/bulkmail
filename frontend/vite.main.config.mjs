import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendDirectory, 'BULK_MAIL_API_URL');
  const apiUrl = env.BULK_MAIL_API_URL || 'http://127.0.0.1:3002';

  return {
    define: {
      __BULK_MAIL_API_URL__: JSON.stringify(apiUrl),
    },
  };
});
