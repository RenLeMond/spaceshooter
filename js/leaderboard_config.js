// 排行榜 API 配置 — 部署 Cloudflare Worker 后修改 apiBase
(function () {
  const hostname = window.location.hostname;
  const isNgrokPreview = hostname.endsWith('.ngrok-free.dev');

  window.STARSEA_LEADERBOARD = {
    // Worker 地址，例如: 'https://e92c11bf-8429-471d-93ea-9fe086c3b3f5.842695824.workers.dev'
    // 留空则使用同源 /api/*（需在 Cloudflare Pages 配置 Worker 路由）
    apiBase: isNgrokPreview ? 'https://game.rlmbest.xyz' : '',

    // 关闭后所有联机请求跳过
    enabled: true,

    // 游戏破纪录时自动上云
    syncOnGameOver: true,

    // apiBase 为空时是否尝试同源 /api/health
    useSameOriginApi: true
  };
})();
