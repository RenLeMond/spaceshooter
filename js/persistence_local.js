// ⚡ 本地持久化辅助：比赛历史记录与云存档脏标记（无外部依赖，可独立测试）

function recordLocalMatchHistory(match) {
    try {
        const key = 'space_match_history';
        const raw = localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        const history = Array.isArray(list) ? list : [];
        const record = {
            id: `match_${Date.now().toString(36)}`,
            score: Math.max(0, Math.floor(Number(match.score) || 0)),
            wave: Math.max(1, Math.floor(Number(match.wave) || 1)),
            skin: match.skin || 'default',
            isNewBest: !!match.isNewBest,
            permanentCoresEarned: Math.max(0, Math.floor(Number(match.permanentCoresEarned) || 0)),
            playedAt: new Date().toISOString()
        };
        history.unshift(record);
        localStorage.setItem(key, JSON.stringify(history.slice(0, 50)));
        return record;
    } catch (_) {}
    return null;
}

function markLocalCloudSaveDirty() {
    if (window.StarseaLeaderboard && typeof window.StarseaLeaderboard.markLocalCloudSaveDirty === 'function') {
        window.StarseaLeaderboard.markLocalCloudSaveDirty();
        return;
    }
    try {
        localStorage.setItem('space_cloud_save_dirty_at', String(Date.now()));
    } catch (_) {}
}

async function settleLocalGameOver(match) {
    const record = recordLocalMatchHistory(match);
    markLocalCloudSaveDirty();
    if (window.StarseaLeaderboard) {
        const scoreToSync = match.isNewBest ? match.bestScore : match.score;
        if (typeof window.StarseaLeaderboard.syncScoreToCloud === 'function') {
            await window.StarseaLeaderboard.syncScoreToCloud(scoreToSync, match.skin, undefined, match.runDurationMs);
        }
        if (typeof window.StarseaLeaderboard.syncCloudSaveFromLocal === 'function') {
            window.StarseaLeaderboard.syncCloudSaveFromLocal();
        }
    }
    return record;
}

window.settleLocalGameOver = settleLocalGameOver;
