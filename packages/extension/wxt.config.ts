import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Chess Move Reader',
    description: 'Baca posisi di chess.com dan tampilkan saran dari engine lokal.',
    permissions: ['storage'],
    host_permissions: ['*://*.chess.com/*'],
  },
});
