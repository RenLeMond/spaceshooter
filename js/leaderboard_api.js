(function (global) {
    const DEFAULT_NICKNAME = '星海先驱者';
    const ALLOWED_SHIPS = new Set(['default', 'void', 'thunder', 'imperial']);
    const USER_ID_RE = /^usr_[a-z0-9]{8,32}$/;

    function getConfig() {
        return global.STARSEA_LEADERBOARD || {};
    }

    function getApiBase() {
        const cfg = getConfig();
        return String(cfg.apiBase || '').trim().replace(/\/+$/, '');
    }

    function isEnabled() {
        const cfg = getConfig();
        return cfg.enabled !== false;
    }

    function buildUrl(path) {
        const base = getApiBase();
        return base ? `${base}${path}` : path;
    }

    function canUseSameOriginApi() {
        const cfg = getConfig();
        return !!getApiBase() || cfg.useSameOriginApi !== false;
    }

    function createUserId() {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let suffix = '';
        if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
            const values = new Uint8Array(16);
            global.crypto.getRandomValues(values);
            for (let i = 0; i < values.length; i++) {
                suffix += alphabet[values[i] % alphabet.length];
            }
        } else {
            suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').substring(2, 18);
        }
        while (suffix.length < 12) {
            suffix += Math.random().toString(36).replace(/[^a-z0-9]/g, '').substring(2, 6);
        }
        return 'usr_' + suffix.substring(0, 32);
    }

    function ensureUserId() {
        let userId = localStorage.getItem('space_user_id');
        if (!USER_ID_RE.test(userId || '')) {
            userId = createUserId();
            localStorage.setItem('space_user_id', userId);
        }
        return userId;
    }

    function sanitizeNickname(value, fallback) {
        fallback = fallback || DEFAULT_NICKNAME;
        const trimmed = String(value || '').trim().replace(/[<>"'`\\]/g, '').slice(0, 12);
        return trimmed || fallback;
    }

    function getNickname() {
        return sanitizeNickname(localStorage.getItem('space_user_nickname'), DEFAULT_NICKNAME);
    }

    function sanitizeAvatar(value) {
        const icon = String(value || 'fa-user-astronaut').trim();
        return /^fa-[a-z0-9-]{2,40}$/.test(icon) ? icon : 'fa-user-astronaut';
    }

    function sanitizeBio(value) {
        return String(value || '').trim().replace(/[<>"'`\\]/g, '').slice(0, 48);
    }

    function getProfile() {
        return {
            nickname: getNickname(),
            avatar: sanitizeAvatar(localStorage.getItem('space_user_avatar')),
            bio: sanitizeBio(localStorage.getItem('space_user_bio'))
        };
    }

    async function apiFetch(path, options) {
        if (!canUseSameOriginApi()) {
            throw new Error('same_origin_api_disabled');
        }
        options = options || {};
        const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        const response = await fetch(buildUrl(path), Object.assign({}, options, { headers }));
        let data = null;
        try {
            data = await response.json();
        } catch (_) {
            data = null;
        }
        if (!response.ok) {
            const error = new Error((data && data.error) || ('HTTP ' + response.status));
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    async function checkHealth() {
        if (!isEnabled()) return false;
        if (!canUseSameOriginApi()) return false;
        try {
            const data = await apiFetch('/api/health');
            return !!(data && data.ok);
        } catch (_) {
            return false;
        }
    }

    async function fetchLeaderboard(limit) {
        limit = limit || 50;
        return apiFetch('/api/leaderboard?limit=' + encodeURIComponent(String(limit)));
    }

    async function fetchPlayer(userId) {
        return apiFetch('/api/player?user_id=' + encodeURIComponent(userId));
    }

    async function submitScore(score, shipType, username, profile) {
        if (!isEnabled()) return { skipped: true, reason: 'disabled' };
        const localProfile = Object.assign(getProfile(), profile || {});

        const payload = {
            user_id: ensureUserId(),
            username: sanitizeNickname(username, localProfile.nickname),
            avatar: sanitizeAvatar(localProfile.avatar),
            bio: sanitizeBio(localProfile.bio),
            score: Math.max(0, Math.floor(Number(score) || 0)),
            ship_type: ALLOWED_SHIPS.has(shipType) ? shipType : 'default'
        };

        return apiFetch('/api/submit-score', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async function syncScoreToCloud(score, shipType, username) {
        const cfg = getConfig();
        if (!isEnabled() || cfg.syncOnGameOver === false) {
            return { skipped: true, reason: 'disabled' };
        }
        if (Math.floor(Number(score) || 0) <= 0) {
            return { skipped: true, reason: 'zero_score' };
        }
        try {
            const result = await submitScore(score, shipType, username);
            clearLastSyncError();
            return result;
        } catch (err) {
            console.warn('[StarseaLeaderboard] sync failed:', err);
            const message = err.message || String(err);
            setLastSyncError(message);
            return { error: message };
        }
    }

    function setLastSyncError(message) {
        try {
            localStorage.setItem('space_last_cloud_sync_error', message);
        } catch (_) {}
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
            global.dispatchEvent(new global.CustomEvent('starsea-leaderboard-sync-error', {
                detail: { message: message }
            }));
        }
    }

    function clearLastSyncError() {
        try {
            localStorage.removeItem('space_last_cloud_sync_error');
        } catch (_) {}
    }

    global.StarseaLeaderboard = {
        DEFAULT_NICKNAME: DEFAULT_NICKNAME,
        getConfig: getConfig,
        getApiBase: getApiBase,
        isEnabled: isEnabled,
        buildUrl: buildUrl,
        canUseSameOriginApi: canUseSameOriginApi,
        ensureUserId: ensureUserId,
        sanitizeNickname: sanitizeNickname,
        sanitizeAvatar: sanitizeAvatar,
        sanitizeBio: sanitizeBio,
        getNickname: getNickname,
        getProfile: getProfile,
        checkHealth: checkHealth,
        fetchLeaderboard: fetchLeaderboard,
        fetchPlayer: fetchPlayer,
        submitScore: submitScore,
        syncScoreToCloud: syncScoreToCloud
    };
})(window);
