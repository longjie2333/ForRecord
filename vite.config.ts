import { defineConfig } from 'vite'
import { nitro } from 'nitro/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'

export default defineConfig({
  plugins: [nitro(), react()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: './app/entry-client.tsx',
        },
      },
    },
  },
})
