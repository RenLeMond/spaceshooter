// 一体化入口：/api/* 走排行榜 API 逻辑，其余请求回落到静态资源 (dist/)。
// 同源部署后浏览器不再跨域，ALLOWED_ORIGINS 名单仅作为兼容保留。
import leaderboardApi from '../leaderboard/src/index.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return leaderboardApi.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request, env, ctx);
  }
};
