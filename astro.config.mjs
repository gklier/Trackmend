import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// SITE_URL is set at deploy time (see OPERATIONS.md). Without it, canonical links and the sitemap are omitted.
const site = process.env.SITE_URL || undefined;

export default defineConfig({
  site,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: site ? [sitemap({ filter: (page) => !page.includes('/404') })] : [],
});
