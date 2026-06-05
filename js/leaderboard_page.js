(function () {
    const API = window.StarseaLeaderboard;
    const DEFAULT_NICKNAME = API ? API.DEFAULT_NICKNAME : '星海先驱者';
    const DEFAULT_AVATAR = 'fa-user-astronaut';
    const DEFAULT_BIO = '向着星辰与深渊！';
    const LEADERBOARD_CACHE_KEY = 'space_leaderboard_cache_v1';
    const LEADERBOARD_CACHE_MAX_AGE_MS = 2 * 60 * 1000;

    const SHIP_META = {
        default: { icon: 'fa-rocket', name: '先驱者默认', className: 'skin-default', badge: 'D', color: '#22d3ee' },
        void: { icon: 'fa-ghost', name: '星渊幻影', className: 'skin-void', badge: 'V', color: '#d946ef' },
        thunder: { icon: 'fa-bolt-lightning', name: '超维雷霆', className: 'skin-thunder', badge: 'T', color: '#facc15' },
        imperial: { icon: 'fa-crown', name: '帝皇余晖', className: 'skin-imperial', badge: 'I', color: '#ef4444' }
    };

    const TALENT_DEFS = [
        { id: 'A', color: 'cyan', max: 3 },
        { id: 'B', color: 'rose', max: 3 },
        { id: 'C', color: 'cyan', max: 3 },
        { id: 'D', color: 'emerald', max: 3 },
        { id: 'E', color: 'rose', max: 2 }
    ];

    const state = {
        userId: API ? API.ensureUserId() : 'usr_guest00000000',
        bestScore: 0,
        permanentCores: 0,
        skin: 'default',
        nickname: DEFAULT_NICKNAME,
        avatar: DEFAULT_AVATAR,
        bio: DEFAULT_BIO,
        isBound: false,
        boundAccount: '',
        selectedAvatar: DEFAULT_AVATAR,
        leaderboard: []
    };

    const el = {
        syncStatus: document.getElementById('syncStatus'),
        syncStatusText: document.getElementById('syncStatusText'),
        playerNameInput: document.getElementById('playerNameInput'),
        pilotIdText: document.getElementById('pilotIdText'),
        btnCopyId: document.getElementById('btnCopyId'),
        pilotSignature: document.getElementById('pilotSignature'),
        localHighScoreText: document.getElementById('localHighScoreText'),
        permanentCoresText: document.getElementById('permanentCoresText'),
        avatarBox: document.getElementById('avatarBox'),
        currentAvatarIcon: document.getElementById('currentAvatarIcon'),
        avatarShipBadge: document.getElementById('avatarShipBadge'),
        bindStatusBadge: document.getElementById('bindStatusBadge'),
        bindStatusText: document.getElementById('bindStatusText'),
        boundAccountEmail: document.getElementById('boundAccountEmail'),
        bindForm: document.getElementById('bindForm'),
        bindEmail: document.getElementById('bindEmail'),
        bindPassword: document.getElementById('bindPassword'),
        btnBindAccount: document.getElementById('btnBindAccount'),
        btnLogoutAccount: document.getElementById('btnLogoutAccount'),
        boundDetails: document.getElementById('boundDetails'),
        hangarCurrentShip: document.getElementById('hangarCurrentShip'),
        hangarUnlockedCount: document.getElementById('hangarUnlockedCount'),
        hangarTalentTotal: document.getElementById('hangarTalentTotal'),
        unlockedShipsList: document.getElementById('unlockedShipsList'),
        leaderboardList: document.getElementById('leaderboardList'),
        matchHistoryList: document.getElementById('matchHistoryList'),
        playerRankText: document.getElementById('playerRankText'),
        avatarModal: document.getElementById('avatarModal'),
        avatarGrid: document.getElementById('avatarGrid'),
        btnCloseAvatarModal: document.getElementById('btnCloseAvatarModal'),
        btnCancelAvatar: document.getElementById('btnCancelAvatar'),
        btnConfirmAvatar: document.getElementById('btnConfirmAvatar'),
        customToast: document.getElementById('customToast'),
        toastIcon: document.getElementById('toastIcon'),
        toastText: document.getElementById('toastText')
    };

    function formatNumber(num) {
        return Number(num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function sanitizeNickname(value) {
        return API ? API.sanitizeNickname(value, DEFAULT_NICKNAME) : String(value || DEFAULT_NICKNAME).trim().slice(0, 12);
    }

    function sanitizeAvatar(value) {
        return API ? API.sanitizeAvatar(value) : (/^fa-[a-z0-9-]{2,40}$/.test(value || '') ? value : DEFAULT_AVATAR);
    }

    function sanitizeBio(value) {
        return API ? API.sanitizeBio(value) : String(value || '').trim().replace(/[<>"'`\\]/g, '').slice(0, 48);
    }

    function showToast(message, type) {
        if (!el.customToast) return;
        el.toastText.textContent = message;
        el.customToast.className = 'custom-toast';
        el.toastIcon.className = 'fa-solid';
        if (type === 'success') {
            el.customToast.classList.add('success');
            el.toastIcon.classList.add('fa-circle-check');
        } else if (type === 'error') {
            el.customToast.classList.add('error');
            el.toastIcon.classList.add('fa-circle-xmark');
        } else {
            el.toastIcon.classList.add('fa-circle-info');
        }
        el.customToast.classList.add('active');
        clearTimeout(el.customToast.timeoutId);
        el.customToast.timeoutId = setTimeout(() => el.customToast.classList.remove('active'), 2600);
    }

    function loadLocalData() {
        state.userId = API ? API.ensureUserId() : state.userId;
        state.bestScore = Math.max(0, parseInt(localStorage.getItem('space_best_score'), 10) || 0);
        state.permanentCores = Math.max(0, parseInt(localStorage.getItem('space_permanent_cores'), 10) || 0);
        state.skin = localStorage.getItem('space_current_skin') || 'default';
        state.nickname = sanitizeNickname(localStorage.getItem('space_user_nickname'));
        state.avatar = sanitizeAvatar(localStorage.getItem('space_user_avatar'));
        state.bio = sanitizeBio(localStorage.getItem('space_user_bio')) || DEFAULT_BIO;
        state.isBound = localStorage.getItem('space_user_is_bound') === 'true';
        state.boundAccount = localStorage.getItem('space_user_bound_email') || '';
    }

    function readLeaderboardCache() {
        try {
            const cached = JSON.parse(localStorage.getItem(LEADERBOARD_CACHE_KEY) || 'null');
            if (!cached || !Array.isArray(cached.entries)) return null;
            if (Date.now() - Number(cached.savedAt || 0) > LEADERBOARD_CACHE_MAX_AGE_MS) return null;
            return cached.entries;
        } catch (_) {
            return null;
        }
    }

    function writeLeaderboardCache(entries) {
        try {
            localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({
                savedAt: Date.now(),
                entries: Array.isArray(entries) ? entries : []
            }));
        } catch (_) {}
    }

    function renderCachedLeaderboard() {
        const cached = readLeaderboardCache();
        if (!cached || !cached.length) return false;
        state.leaderboard = cached;
        renderLeaderboard(cached);
        return true;
    }

    function saveProfile() {
        localStorage.setItem('space_user_nickname', state.nickname);
        localStorage.setItem('space_user_avatar', state.avatar);
        localStorage.setItem('space_user_bio', state.bio);
    }

    function renderProfile() {
        const ship = SHIP_META[state.skin] || SHIP_META.default;
        el.playerNameInput.value = state.nickname;
        el.pilotIdText.textContent = state.userId;
        el.pilotSignature.value = state.bio;
        el.localHighScoreText.textContent = state.bestScore > 0 ? formatNumber(state.bestScore) : '-';
        el.permanentCoresText.textContent = formatNumber(state.permanentCores);
        el.currentAvatarIcon.className = `fa-solid ${state.avatar}`;
        el.avatarShipBadge.textContent = ship.badge;
        el.avatarBox.style.borderColor = ship.color;

        if (state.isBound) {
            el.bindStatusBadge.className = 'binding-badge badge-bound';
            el.bindStatusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> 已绑定';
            el.bindStatusText.textContent = '正式飞行员档案';
            el.boundAccountEmail.textContent = obfuscateAccount(state.boundAccount);
            el.bindForm.style.display = 'none';
            el.boundDetails.style.display = 'block';
        } else {
            el.bindStatusBadge.className = 'binding-badge badge-guest';
            el.bindStatusBadge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> 游客';
            el.bindStatusText.textContent = '游客飞行员档案';
            el.boundAccountEmail.textContent = '绑定用户名或邮箱后，资料会随排行榜同步。';
            el.bindForm.style.display = 'flex';
            el.boundDetails.style.display = 'none';
        }

        renderShips();
        renderTalents();
        renderHangarSummary();
        renderMatchHistory();
    }

    function obfuscateAccount(value) {
        if (!value) return '-';
        if (value.includes('@')) {
            const parts = value.split('@');
            return parts[0].slice(0, 2) + '***@' + parts[1];
        }
        return value.length <= 4 ? value[0] + '***' : value.slice(0, 2) + '***' + value.slice(-1);
    }

    function renderShips() {
        let unlocked = ['default'];
        try {
            const parsed = JSON.parse(localStorage.getItem('space_unlocked_skins') || '["default"]');
            if (Array.isArray(parsed)) unlocked = parsed;
        } catch (_) {}
        el.unlockedShipsList.replaceChildren();
        Object.keys(SHIP_META).forEach(id => {
            const meta = SHIP_META[id];
            const chip = document.createElement('span');
            const owned = unlocked.includes(id);
            chip.className = 'ship-chip' + (state.skin === id ? ' active-ship' : '');
            chip.style.opacity = owned ? '1' : '0.42';
            chip.innerHTML = `<i class="fa-solid ${owned ? meta.icon : 'fa-lock'}"></i> ${meta.name}`;
            el.unlockedShipsList.appendChild(chip);
        });
    }

    function renderTalents() {
        let talents = {};
        try { talents = JSON.parse(localStorage.getItem('space_v7_talents') || '{}') || {}; } catch (_) {}
        TALENT_DEFS.forEach(def => {
            const target = document.getElementById(`talent-${def.id}`);
            if (!target) return;
            target.replaceChildren();
            const level = Math.max(0, Math.min(Number(talents[def.id]) || 0, def.max));
            for (let i = 0; i < def.max; i++) {
                const dot = document.createElement('span');
                dot.className = 'talent-dot' + (i < level ? ` active ${def.color}` : '');
                target.appendChild(dot);
            }
        });
    }

    function renderHangarSummary() {
        let unlocked = ['default'];
        let talents = {};
        try {
            const parsed = JSON.parse(localStorage.getItem('space_unlocked_skins') || '["default"]');
            if (Array.isArray(parsed)) unlocked = parsed;
        } catch (_) {}
        try { talents = JSON.parse(localStorage.getItem('space_v7_talents') || '{}') || {}; } catch (_) {}
        const ship = SHIP_META[state.skin] || SHIP_META.default;
        const ownedCount = Object.keys(SHIP_META).filter(id => unlocked.includes(id)).length;
        const totalTalentLv = TALENT_DEFS.reduce((sum, def) => {
            const level = Math.max(0, Math.min(Number(talents[def.id]) || 0, def.max));
            return sum + level;
        }, 0);
        if (el.hangarCurrentShip) el.hangarCurrentShip.textContent = ship.name;
        if (el.hangarUnlockedCount) el.hangarUnlockedCount.textContent = `${ownedCount} / ${Object.keys(SHIP_META).length}`;
        if (el.hangarTalentTotal) el.hangarTalentTotal.textContent = `LV.${totalTalentLv}`;
    }

    function renderLeaderboard(entries) {
        const list = entries || [];
        el.leaderboardList.replaceChildren();
        if (!list.length) {
            el.leaderboardList.innerHTML = '<div class="leaderboard-empty"><i class="fa-solid fa-satellite-dish"></i> 暂无可显示的排行榜记录。完成一局游戏后会自动上榜。</div>';
            el.playerRankText.textContent = '全球排名 -';
            return;
        }

        let ownRank = null;
        list.forEach(entry => {
            if (entry.user_id === state.userId) {
                // 同一玩家可能上榜多次（多条 leaderboard_entries），取排名最高（rank 最小）的
                if (ownRank === null || entry.rank < ownRank) ownRank = entry.rank;
            }
            const ship = SHIP_META[entry.ship_type] || SHIP_META.default;
            const avatarIcon = sanitizeAvatar(entry.avatar || ship.icon);
            const item = document.createElement('div');
            item.className = 'leaderboard-item' + (entry.user_id === state.userId ? ' highlight-user' : '');
            item.innerHTML = `
                <div class="rank-column ${rankClass(entry.rank)}">${rankLabel(entry.rank)}</div>
                <div class="user-column">
                    <div class="user-ship-ico ${ship.className}">
                        <i class="fa-solid ${avatarIcon}"></i>
                    </div>
                    <div class="user-details">
                        <span class="user-name">${escapeHtml(entry.username || DEFAULT_NICKNAME)}</span>
                        <span class="user-ship-name">${escapeHtml(entry.bio || ship.name)}</span>
                    </div>
                </div>
                <div class="score-column">${formatNumber(entry.score)}</div>
                <div class="date-column">${formatDate(entry.updated_at)}</div>
            `;
            el.leaderboardList.appendChild(item);
        });
        el.playerRankText.textContent = ownRank ? `全球排名 #${ownRank}` : '全球排名 -';
    }

    function rankClass(rank) {
        if (rank === 1) return 'rank-gold';
        if (rank === 2) return 'rank-silver';
        if (rank === 3) return 'rank-bronze';
        return 'rank-normal';
    }

    function rankLabel(rank) {
        if (rank === 1) return '<i class="fa-solid fa-crown"></i>';
        return `#${rank || '-'}`;
    }

    function renderMatchHistory() {
        let history = [];
        try {
            const parsed = JSON.parse(localStorage.getItem('space_match_history') || '[]');
            if (Array.isArray(parsed)) history = parsed;
        } catch (_) {}
        el.matchHistoryList.replaceChildren();
        if (!history.length) {
            el.matchHistoryList.innerHTML = '<div class="match-empty">还没有本地对局记录。完成游戏后，这里会显示最近 10 局。</div>';
            return;
        }
        history.slice(0, 10).forEach(match => {
            const ship = SHIP_META[match.skin] || SHIP_META.default;
            const item = document.createElement('div');
            item.className = 'match-item';
            item.innerHTML = `
                <div class="match-icon"><i class="fa-solid ${ship.icon}"></i></div>
                <div class="match-main">
                    <strong>WAVE ${Math.max(1, match.wave || 1)}</strong>
                    <span>${ship.name}${match.isNewBest ? ' · 新纪录' : ''}</span>
                </div>
                <div class="match-score">${formatNumber(match.score || 0)}</div>
                <div class="match-time">${formatDate(match.playedAt)} · +${match.permanentCoresEarned || 0} 星核</div>
            `;
            el.matchHistoryList.appendChild(item);
        });
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function formatDate(value) {
        if (!value) return '-';
        // 兼容旧的 SQLite datetime 格式（无时区后缀），视为 UTC
        const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
            ? value.replace(' ', 'T') + 'Z'
            : value;
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    async function refreshLeaderboard() {
        setStatus('connecting');
        try {
            if (!API || !API.isEnabled()) throw new Error('leaderboard_disabled');
            // 榜单先渲染，个人精确排名后台补齐，避免一个慢请求拖住首屏列表。
            const playerPromise = API.fetchPlayer(state.userId).catch(() => null);
            const data = await API.fetchLeaderboard(50);
            state.leaderboard = Array.isArray(data.entries) ? data.entries : [];
            writeLeaderboardCache(state.leaderboard);
            renderLeaderboard(state.leaderboard);
            setStatus('online');

            const player = await playerPromise;
            // 优先用 /api/player 返回的精确排名，否则保留榜单里推导出的排名
            if (player && player.rank) {
                el.playerRankText.textContent = `全球排名 #${player.rank}`;
            }
        } catch (err) {
            if (!state.leaderboard.length) renderLeaderboard([]);
            setStatus('offline');
        }
    }

    async function refreshCloudSaveIfBound() {
        if (!API || !API.isEnabled()) return false;
        if (!API.getSessionToken || !API.getSessionToken()) return false;
        if (typeof API.fetchCloudSave !== 'function') return false;
        try {
            await API.fetchCloudSave();
            return true;
        } catch (_) {
            return false;
        }
    }

    async function refreshProfileAndLeaderboard() {
        loadLocalData();
        renderProfile();
        renderCachedLeaderboard();
        const cloudRefresh = refreshCloudSaveIfBound().then(changed => {
            if (!changed) return;
            loadLocalData();
            renderProfile();
        });
        await refreshLeaderboard();
        await cloudRefresh;
    }

    function setStatus(mode) {
        if (mode === 'online') {
            el.syncStatusText.textContent = '联机正常';
            el.syncStatus.style.borderColor = 'rgba(16, 185, 129, 0.35)';
            return;
        }
        if (mode === 'offline') {
            el.syncStatusText.textContent = '暂不可用';
            el.syncStatus.style.borderColor = 'rgba(244, 63, 94, 0.35)';
            return;
        }
        el.syncStatusText.textContent = '连接中';
        el.syncStatus.style.borderColor = 'rgba(251, 191, 36, 0.35)';
    }

    async function syncProfileAndScore(options) {
        options = options || {};
        if (!API || !API.isEnabled()) {
            if (options.toast) showToast('联机服务暂不可用', 'error');
            return false;
        }
        loadLocalData();
        try {
            if (typeof API.submitScore === 'function') {
                await API.submitScore(0, state.skin, state.nickname, {
                    avatar: state.avatar,
                    bio: state.bio
                });
            }
            if (API.getSessionToken && API.getSessionToken() && API.saveCloudSave && API.collectLocalCloudSave) {
                await API.saveCloudSave(API.collectLocalCloudSave());
            }
            await refreshProfileAndLeaderboard();
            if (options.toast) showToast(options.toast, 'success');
            return true;
        } catch (_) {
            if (options.toast) showToast('同步失败，请稍后重试', 'error');
            setStatus('offline');
            return false;
        }
    }

    async function logoutAccount() {
        if (API && typeof API.logoutAccount === 'function') {
            try {
                await API.logoutAccount();
            } catch (_) {
                localStorage.removeItem('space_account_token');
            }
        } else {
            localStorage.removeItem('space_account_token');
        }
        localStorage.removeItem('space_user_is_bound');
        localStorage.removeItem('space_user_bound_email');
        state.isBound = false;
        state.boundAccount = '';
        loadLocalData();
        renderProfile();
        refreshLeaderboard();
        showToast('已退出当前账号，可登录其他档案', 'success');
    }

    async function bindAccount() {
        const account = el.bindEmail.value.trim();
        const password = el.bindPassword.value.trim();
        if (account.length < 4 || password.length < 6) {
            showToast('请输入至少 4 位账号和 6 位密码', 'error');
            return;
        }
        if (!API || typeof API.bindAccount !== 'function') {
            showToast('账号服务暂不可用', 'error');
            return;
        }
        try {
            const result = await API.bindAccount(account, password, API.collectLocalCloudSave());
            if (result && result.error) {
                showToast(result.error === 'invalid_credentials' ? '密码不正确' : '绑定失败', 'error');
                return;
            }
            state.isBound = true;
            state.boundAccount = account;
            localStorage.setItem('space_user_is_bound', 'true');
            localStorage.setItem('space_user_bound_email', account);
            loadLocalData();
            if (state.nickname === DEFAULT_NICKNAME) {
                state.nickname = sanitizeNickname(account.split('@')[0]);
                localStorage.setItem('space_user_nickname', state.nickname);
                if (API.saveCloudSave && API.collectLocalCloudSave) {
                    await API.saveCloudSave(API.collectLocalCloudSave());
                }
            }
            await syncProfileAndScore();
            showToast(result.mode === 'registered' ? '账号已注册并同步云存档' : '账号已登录，云存档已同步', 'success');
            await refreshLeaderboard();
        } catch (err) {
            showToast(err && err.data && err.data.error === 'invalid_credentials' ? '密码不正确' : '绑定失败，请稍后重试', 'error');
            setStatus('offline');
        }
    }

    function openAvatarModal() {
        state.selectedAvatar = state.avatar;
        document.querySelectorAll('.avatar-select-card').forEach(card => {
            card.classList.toggle('active', card.dataset.avatar === state.avatar);
        });
        el.avatarModal.classList.add('active');
        el.avatarModal.setAttribute('aria-hidden', 'false');
    }

    function closeAvatarModal() {
        el.avatarModal.classList.remove('active');
        el.avatarModal.setAttribute('aria-hidden', 'true');
    }

    function initEvents() {
        el.playerNameInput.addEventListener('change', () => {
            state.nickname = sanitizeNickname(el.playerNameInput.value);
            saveProfile();
            renderProfile();
            syncProfileAndScore({ toast: '呼号已保存并同步' });
        });
        el.pilotSignature.addEventListener('change', () => {
            state.bio = sanitizeBio(el.pilotSignature.value) || DEFAULT_BIO;
            saveProfile();
            renderProfile();
            syncProfileAndScore({ toast: '飞行签名已保存并同步' });
        });
        el.btnCopyId.addEventListener('click', () => {
            navigator.clipboard.writeText(state.userId).then(() => showToast('呼号 ID 已复制', 'success')).catch(() => showToast('复制失败', 'error'));
        });
        el.avatarBox.addEventListener('click', openAvatarModal);
        el.btnCloseAvatarModal.addEventListener('click', closeAvatarModal);
        el.btnCancelAvatar.addEventListener('click', closeAvatarModal);
        el.avatarModal.addEventListener('click', event => {
            if (event.target === el.avatarModal) closeAvatarModal();
        });
        el.avatarGrid.addEventListener('click', event => {
            const card = event.target.closest('.avatar-select-card');
            if (!card) return;
            state.selectedAvatar = sanitizeAvatar(card.dataset.avatar);
            document.querySelectorAll('.avatar-select-card').forEach(node => node.classList.remove('active'));
            card.classList.add('active');
        });
        el.btnConfirmAvatar.addEventListener('click', () => {
            state.avatar = state.selectedAvatar;
            saveProfile();
            renderProfile();
            closeAvatarModal();
            syncProfileAndScore({ toast: '头像已更新并同步' });
        });
        el.btnBindAccount.addEventListener('click', bindAccount);
        if (el.btnLogoutAccount) el.btnLogoutAccount.addEventListener('click', logoutAccount);
        window.addEventListener('focus', () => {
            refreshProfileAndLeaderboard();
        });
    }

    async function init() {
        loadLocalData();
        renderProfile();
        renderCachedLeaderboard();
        initEvents();
        refreshProfileAndLeaderboard();
    }

    init();
})();
