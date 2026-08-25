import { cpSync, mkdirSync, existsSync } from 'fs';

mkdirSync('public/js', { recursive: true });
cpSync('js', 'public/js', { recursive: true, force: true });
console.log('synced js/ -> public/js/');
