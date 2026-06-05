(function (global) {
    const DEFAULT_NICKNAME = '星海先驱者';
    const ALLOWED_SHIPS = new Set(['default', 'void', 'thunder', 'imperial']);
    const USER_ID_RE = /^usr_[a-z0-9]{8,32}$/;
    const GUEST_KEY_RE = /^gst_[a-z0-9]{32,64}$/;
    const GUEST_KEY_KEY = 'space_guest_key';
    const CLOUD_REVISION_KEY = 'space_cloud_save_revision';
    const MATCH_HISTORY_LIMIT = 50;

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
        return createRandomToken('usr_', 16);
    }

    function createRandomToken(prefix, length) {
        const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let suffix = '';
        if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
            const values = new Uint8Array(length);
            global.crypto.getRandomValues(values);
            for (let i = 0; i < values.length; i++) {
                suffix += alphabet[values[i] % alphabet.length];
            }
        } else {
            suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').substring(2);
        }
        while (suffix.length < length) {
            suffix += Math.random().toString(36).replace(/[^a-z0-9]/g, '').substring(2);
        }
        return prefix + suffix.substring(0, length);
    }

    function ensureUserId() {
        let userId = localStorage.getItem('space_user_id');
        if (!USER_ID_RE.test(userId || '')) {
            userId = createUserId();
            localStorage.setItem('space_user_id', userId);
        }
        return userId;
    }

    function ensureGuestKey() {
        let guestKey = localStorage.getItem(GUEST_KEY_KEY);
        if (!GUEST_KEY_RE.test(guestKey || '')) {
            guestKey = createRandomToken('gst_', 48);
            localStorage.setItem(GUEST_KEY_KEY, guestKey);
        }
        return guestKey;
    }

    async function ensureGuestSession() {
        const requestedUserId = ensureUserId();
        const result = await apiFetch('/api/guest-session', {
            method: 'POST',
            body: JSON.stringify({
                user_id: requestedUserId,
                guest_key: ensureGuestKey()
            })
        });
        const replacementUserId = result && (result.replacement_user_id || result.user_id);
        if (replacementUserId && USER_ID_RE.test(replacementUserId) && replacementUserId !== requestedUserId) {
            localStorage.setItem('space_user_id', replacementUserId);
        }
        return result;
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

    function clearSessionToken() {
        localStorage.removeItem('space_account_token');
    }

    function getCloudRevision() {
        return Math.max(0, Math.floor(Number(localStorage.getItem(CLOUD_REVISION_KEY)) || 0));
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
            matchHistory: safeJson('space_match_history', []).slice(0, MATCH_HISTORY_LIMIT)
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
        if (Array.isArray(save.matchHistory)) localStorage.setItem('space_match_history', JSON.stringify(save.matchHistory.slice(0, MATCH_HISTORY_LIMIT)));
        if (typeof save.revision !== 'undefined') localStorage.setItem(CLOUD_REVISION_KEY, String(Math.max(0, Math.floor(Number(save.revision) || 0))));
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

    async function submitScore(score, shipType, username, profile, runDurationMs) {
        if (!isEnabled()) return { skipped: true, reason: 'disabled' };
        const token = getSessionToken();
        if (!token) await ensureGuestSession();
        const localProfile = Object.assign(getProfile(), profile || {});

        const payload = {
            user_id: ensureUserId(),
            guest_key: ensureGuestKey(),
            username: sanitizeNickname(username, localProfile.nickname),
            avatar: sanitizeAvatar(localProfile.avatar),
            bio: sanitizeBio(localProfile.bio),
            score: Math.max(0, Math.floor(Number(score) || 0)),
            ship_type: ALLOWED_SHIPS.has(shipType) ? shipType : 'default',
            run_duration_ms: Math.max(0, Math.floor(Number(runDurationMs) || 0))
        };
        return apiFetch('/api/submit-score', {
            method: 'POST',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: JSON.stringify(payload)
        });
    }

    async function bindAccount(account, password, save) {
        const payload = {
            account: String(account || '').trim(),
            password: String(password || ''),
            user_id: ensureUserId(),
            guest_key: ensureGuestKey(),
            save: save || collectLocalCloudSave()
        };
        let result;
        try {
            result = await apiFetch('/api/auth/bind', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (err) {
            if (!err || !err.data || err.data.error !== 'identity_required') throw err;
            await ensureGuestSession();
            payload.user_id = ensureUserId();
            result = await apiFetch('/api/auth/bind', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }
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
        try {
            const result = await apiFetch('/api/cloud-save', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token },
                body: JSON.stringify({
                    revision: getCloudRevision(),
                    save: save || collectLocalCloudSave()
                })
            });
            if (result && result.save) applyCloudSave(result.save);
            return result;
        } catch (err) {
            if (err && err.status === 409 && err.data && err.data.save) {
                applyCloudSave(err.data.save);
                return { conflict: true, save: err.data.save };
            }
            throw err;
        }
    }

    async function logoutAccount() {
        const token = getSessionToken();
        try {
            if (token) {
                await apiFetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token },
                    body: '{}'
                });
            }
        } finally {
            clearSessionToken();
            localStorage.removeItem(CLOUD_REVISION_KEY);
        }
        return { success: true };
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

    async function syncScoreToCloud(score, shipType, username, runDurationMs) {
        const cfg = getConfig();
        if (!isEnabled() || cfg.syncOnGameOver === false) {
            return { skipped: true, reason: 'disabled' };
        }
        if (Math.floor(Number(score) || 0) <= 0) {
            return { skipped: true, reason: 'zero_score' };
        }
        try {
            const result = await submitScore(score, shipType, username, undefined, runDurationMs);
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
        ensureGuestKey: ensureGuestKey,
        ensureGuestSession: ensureGuestSession,
        sanitizeNickname: sanitizeNickname,
        sanitizeAvatar: sanitizeAvatar,
        sanitizeBio: sanitizeBio,
        getNickname: getNickname,
        getProfile: getProfile,
        getSessionToken: getSessionToken,
        getCloudRevision: getCloudRevision,
        collectLocalCloudSave: collectLocalCloudSave,
        applyCloudSave: applyCloudSave,
        checkHealth: checkHealth,
        fetchLeaderboard: fetchLeaderboard,
        fetchPlayer: fetchPlayer,
        submitScore: submitScore,
        bindAccount: bindAccount,
        logoutAccount: logoutAccount,
        fetchCloudSave: fetchCloudSave,
        saveCloudSave: saveCloudSave,
        syncCloudSaveFromLocal: syncCloudSaveFromLocal,
        syncScoreToCloud: syncScoreToCloud
    };
})(window);
