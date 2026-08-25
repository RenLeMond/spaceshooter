import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const docs = [
  'game_design.html',
  'game_manual.html',
  'version_history.html',
  'v7_roadmap.html',
  'v6_hangar.html',
  'v6_roadmap.html',
  // Phase1: style.css / leaderboard.css 仍由 dist/assets/* 提供，Phase2 删除后不再透传
  // 'style.css',
  // 'leaderboard.css',
];

const dist = 'dist';
if (!existsSync(dist)) mkdirSync(dist, { recursive: true });

for (const f of docs) {
  if (existsSync(f)) {
    copyFileSync(f, join(dist, f));
    console.log(`copied ${f} -> dist/${f}`);
  }
}
