import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import Icons from 'unplugin-icons/vite'

export default defineConfig({
	server: {
		host: '127.0.0.1',
		proxy: {
			'/api': { target: 'http://127.0.0.1:18081', changeOrigin: true },
		},
	},
	plugins: [
		sveltekit(),
		purgeCss(),
		Icons({
			autoInstall: true,
			compiler: 'svelte',
		}),
	],
});
