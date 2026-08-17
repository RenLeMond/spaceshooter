// 排行榜 API 配置 — 无同源 /api 路由的域名回落到主站
(function () {
  const hostname = window.location.hostname;
  const API_ORIGIN = 'https://game.rlmbest.xyz';
  const SAME_ORIGIN_API_HOSTS = new Set([
    'game.rlmbest.xyz',
    'game.renlimeng.qzz.io',
    'localhost',
    '127.0.0.1'
  ]);
  const useSameOrigin = SAME_ORIGIN_API_HOSTS.has(hostname);

  window.STARSEA_LEADERBOARD = {
    // 留空则使用同源 /api/*；workers.dev / ngrok 等预览域走主站
    apiBase: useSameOrigin ? '' : API_ORIGIN,

    // 关闭后所有联机请求跳过
    enabled: true,

    // 游戏破纪录时自动上云
    syncOnGameOver: true,

    // apiBase 为空时是否尝试同源 /api/health
    useSameOriginApi: useSameOrigin
  };
})();
