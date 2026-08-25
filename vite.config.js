const { defineConfig } = require('vite');
const { resolve } = require('path');

module.exports = defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'space_shooter.html'),
        hangar: resolve(__dirname, 'v7_hangar.html'),
        leaderboard: resolve(__dirname, 'leaderboard.html'),
      },
    },
  },
});
