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

    function getSessionToken() {
        return String(localStorage.getItem('space_account_token') || '');
    }

    function setSessionToken(token) {
        if (token) localStorage.setItem('space_account_token', token);
    }

    function safeJson(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '');
            return parsed == null ? fallback : parsed;
        } catch (_) {
            return fallback;
        }
    }

    function collectLocalCloudSave() {
        return {
            permanentCores: Math.max(0, Math.floor(Number(localStorage.getItem('space_permanent_cores')) || 0)),
            talents: safeJson('space_v7_talents', {}),
            unlockedSkins: safeJson('space_unlocked_skins', ['default']),
            currentSkin: localStorage.getItem('space_current_skin') || 'default',
            bestScore: Math.max(0, Math.floor(Number(localStorage.getItem('space_best_score')) || 0)),
            profile: getProfile(),
            matchHistory: safeJson('space_match_history', [])
        };
    }

    function applyCloudSave(save) {
        if (!save || typeof save !== 'object') return;
        if (typeof save.permanentCores !== 'undefined') localStorage.setItem('space_permanent_cores', String(Math.max(0, Math.floor(Number(save.permanentCores) || 0))));
        if (save.talents) localStorage.setItem('space_v7_talents', JSON.stringify(save.talents));
        if (Array.isArray(save.unlockedSkins)) localStorage.setItem('space_unlocked_skins', JSON.stringify(save.unlockedSkins));
        if (save.currentSkin) localStorage.setItem('space_current_skin', save.currentSkin);
        if (typeof save.bestScore !== 'undefined') localStorage.setItem('space_best_score', String(Math.max(0, Math.floor(Number(save.bestScore) || 0))));
        if (save.profile) {
            if (save.profile.nickname) localStorage.setItem('space_user_nickname', sanitizeNickname(save.profile.nickname));
            if (save.profile.avatar) localStorage.setItem('space_user_avatar', sanitizeAvatar(save.profile.avatar));
            if (typeof save.profile.bio !== 'undefined') localStorage.setItem('space_user_bio', sanitizeBio(save.profile.bio));
        }
        if (Array.isArray(save.matchHistory)) localStorage.setItem('space_match_history', JSON.stringify(save.matchHistory));
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

    async function bindAccount(account, password, save) {
        const payload = {
            account: String(account || '').trim(),
            password: String(password || ''),
            user_id: ensureUserId(),
            save: save || collectLocalCloudSave()
        };
        const result = await apiFetch('/api/auth/bind', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (result && result.token) {
            setSessionToken(result.token);
            if (result.user_id) localStorage.setItem('space_user_id', result.user_id);
            if (result.save) applyCloudSave(result.save);
        }
        return result;
    }

    async function fetchCloudSave() {
        const token = getSessionToken();
        if (!token) return { skipped: true, reason: 'not_bound' };
        const result = await apiFetch('/api/cloud-save', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (result && result.save) applyCloudSave(result.save);
        return result;
    }

    async function saveCloudSave(save) {
        const token = getSessionToken();
        if (!token) return { skipped: true, reason: 'not_bound' };
        const result = await apiFetch('/api/cloud-save', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: JSON.stringify({ save: save || collectLocalCloudSave() })
        });
        if (result && result.save) applyCloudSave(result.save);
        return result;
    }

    async function syncCloudSaveFromLocal() {
        if (!isEnabled()) return { skipped: true, reason: 'disabled' };
        try {
            const result = await saveCloudSave(collectLocalCloudSave());
            clearLastSyncError();
            return result;
        } catch (err) {
            const message = err.message || String(err);
            setLastSyncError(message);
            return { error: message };
        }
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
            if (getSessionToken()) await syncCloudSaveFromLocal();
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
        getSessionToken: getSessionToken,
        collectLocalCloudSave: collectLocalCloudSave,
        applyCloudSave: applyCloudSave,
        checkHealth: checkHealth,
        fetchLeaderboard: fetchLeaderboard,
        fetchPlayer: fetchPlayer,
        submitScore: submitScore,
        bindAccount: bindAccount,
        fetchCloudSave: fetchCloudSave,
        saveCloudSave: saveCloudSave,
        syncCloudSaveFromLocal: syncCloudSaveFromLocal,
        syncScoreToCloud: syncScoreToCloud
    };
})(window);
