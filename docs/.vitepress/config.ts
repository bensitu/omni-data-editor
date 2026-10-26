import { defineConfig } from 'vitepress';
export default defineConfig({
  title: 'OmniDataEditor',
  description: 'A headless TypeScript entity editing engine',
  lang: 'en-US',
  base: process.env.OMNIDATAEDITOR_DOCS_BASE ?? '/',
  cleanUrls: true,
  srcExclude: [
    'public/**',
    'internal/**',
    'decisions/**',
    'architecture/**',
    'implementation/**',
    'delivery.md',
    'migration.md',
    'release.md',
  ],
  themeConfig: {
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/index.html' },
      { text: 'Playground', link: '/examples/showcase/', target: '_blank' },
    ],
    sidebar: [
      {
        text: 'Using the editor',
        items: [
          'getting-started',
          'playground',
          'standalone',
          'validation',
          'persistence',
          'conflicts',
          'multiple-entities',
          'inline',
          'datatables',
          'tabulator',
          'async-select',
        ].map((name) => ({
          text: name
            .split('-')
            .map((word) => word[0]!.toUpperCase() + word.slice(1))
            .join(' '),
          link: `/guide/${name}`,
        })),
      },
      {
        text: 'Extensions',
        items: [
          { text: 'Renderers', link: '/guide/custom-renderer' },
          { text: 'Presentations', link: '/guide/custom-presentation' },
          { text: 'Hosts', link: '/guide/custom-host' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Compatibility', link: '/support' },
          { text: 'Accessibility', link: '/accessibility' },
          { text: 'Security', link: '/security' },
        ],
      },
    ],
  },
});
