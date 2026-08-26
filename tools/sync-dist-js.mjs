import { cpSync, mkdirSync } from 'fs';

// 引擎源码唯一存放于 js/，构建后复制到 dist/js 供 Workers 静态资源部署使用。
// 开发模式 (vite dev) 下 Vite 直接服务根目录 js/，无需任何同步步骤。
mkdirSync('dist', { recursive: true });
cpSync('js', 'dist/js', { recursive: true, force: true });
console.log('synced js/ -> dist/js/');
