(function () {
    const API = window.StarseaLeaderboard;
    const DEFAULT_NICKNAME = API.DEFAULT_NICKNAME;
    const LEADERBOARD_LIMIT = 50;

    const SHIP_META = {
        default: { icon: 'fa-rocket', name: '先驱者默认机型', className: 'skin-default', badge: 'D', border: '#22d3ee' },
        void: { icon: 'fa-ghost', name: '星渊幻影', className: 'skin-void', badge: 'V', border: '#d946ef' },
        thunder: { icon: 'fa-bolt-lightning', name: '超维雷霆', className: 'skin-thunder', badge: 'T', border: '#facc15' },
        imperial: { icon: 'fa-crown', name: '帝皇余晖', className: 'skin-imperial', badge: 'I', border: '#ef4444' }
    };

    const MOCK_D1_DB = {
        users: [
            { id: 'usr_static_1', username: '星海收割者', is_guest: 0 },
            { id: 'usr_static_2', username: '量子风暴', is_guest: 0 },
            { id: 'usr_static_3', username: '光速折跃', is_guest: 0 },
            { id: 'usr_static_4', username: '零重力玩家', is_guest: 1 },
            { id: 'usr_static_5', username: '帝皇守卫', is_guest: 1 },
            { id: 'usr_static_6', username: '彗星尾焰', is_guest: 1 },
            { id: 'usr_static_7', username: '暗能量研究员', is_guest: 0 }
        ],
        leaderboards: [
            { user_id: 'usr_static_1', score: 185200, ship_type: 'imperial', updated_at: '2026-06-01 10:20:15' },
            { user_id: 'usr_static_2', score: 142100, ship_type: 'void', updated_at: '2026-06-01 12:45:00' },
            { user_id: 'usr_static_3', score: 110900, ship_type: 'thunder', updated_at: '2026-06-01 15:10:32' },
            { user_id: 'usr_static_4', score: 85200, ship_type: 'default', updated_at: '2026-05-31 18:30:10' },
            { user_id: 'usr_static_5', score: 62000, ship_type: 'imperial', updated_at: '2026-06-01 08:12:19' },
            { user_id: 'usr_static_6', score: 43200, ship_type: 'thunder', updated_at: '2026-06-01 16:55:40' },
            { user_id: 'usr_static_7', score: 25800, ship_type: 'void', updated_at: '2026-06-01 17:05:11' }
        ]
    };

    let liveMode = false;
    let liveEntries = [];
    let cloudPlayer = null;

    let currentUserId = API.ensureUserId();
    let localBestScore = 0;
    let localSkin = 'default';
    let localNickname = DEFAULT_NICKNAME;

    const syncStatus = document.getElementById('syncStatus');
    const demoBanner = document.querySelector('.demo-banner');
    const cloudSyncFooter = document.getElementById('cloudSyncFooter');
    const localHighScoreText = document.getElementById('localHighScoreText');
    const cloudHighScoreText = document.getElementById('cloudHighScoreText');
    const playerNameInput = document.getElementById('playerNameInput');
    const playerRankText = document.getElementById('playerRankText');
    const avatarShipBadge = document.getElementById('avatarShipBadge');
    const avatarBox = document.getElementById('avatarBox');
    const leaderboardList = document.getElementById('leaderboardList');
    const consoleLogs = document.getElementById('consoleLogs');
    const simModal = document.getElementById('simModal');
    const btnOpenSimModal = document.getElementById('btnOpenSimModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnCancelSim = document.getElementById('btnCancelSim');
    const btnSubmitSim = document.getElementById('btnSubmitSim');
    const btnRandomScore = document.getElementById('btnRandomScore');
    const btnSyncLocalScore = document.getElementById('btnSyncLocalScore');
    const btnRefreshLocal = document.getElementById('btnRefreshLocal');
    const simUsername = document.getElementById('simUsername');
    const simScore = document.getElementById('simScore');
    const simShip = document.getElementById('simShip');
    const simWriteLocal = document.getElementById('simWriteLocal');
    const tabHeaders = document.getElementById('tabHeaders');

    const SYNC_BTN_DEFAULT = '<i class="fa-solid fa-cloud-arrow-up"></i> 将本地最高分同步至云端 D1';
    const SYNC_BTN_MOCK = '<i class="fa-solid fa-cloud-arrow-up"></i> 将本地最高分同步至 Mock 云端';

    function formatNumber(num) {
        return Number(num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatTimestamp(date) {
        date = date || new Date();
        return date.toISOString().replace('T', ' ').substring(0, 19);
    }

    function getShipMeta(shipType) {
        return SHIP_META[shipType] || SHIP_META.default;
    }

    function refreshLocalFromStorage() {
        localBestScore = Math.max(0, parseInt(localStorage.getItem('space_best_score'), 10) || 0);
        localSkin = localStorage.getItem('space_current_skin') || 'default';
        localNickname = API.sanitizeNickname(localStorage.getItem('space_user_nickname'), DEFAULT_NICKNAME);
    }

    function logToTerminal(prompt, text, isSql) {
        const line = document.createElement('div');
        line.className = 'terminal-line';

        const promptEl = document.createElement('span');
        promptEl.className = 'terminal-prompt';
        promptEl.textContent = '[' + prompt + ']';

        const textEl = document.createElement('span');
        if (isSql) textEl.className = 'terminal-sql';
        textEl.textContent = ' ' + text;

        line.appendChild(promptEl);
        line.appendChild(textEl);
        consoleLogs.appendChild(line);

        while (consoleLogs.children.length > 80) {
            consoleLogs.removeChild(consoleLogs.firstChild);
        }
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    }

    function flashButton(btn, doneHtml, defaultHtml, delay) {
        delay = delay || 2000;
        btn.innerHTML = doneHtml;
        setTimeout(function () { btn.innerHTML = defaultHtml; }, delay);
    }

    function setConnectionUi(isLive) {
        liveMode = isLive;
        const statusText = document.getElementById('syncStatusText');
        const statusDot = syncStatus ? syncStatus.querySelector('.status-dot') : null;
        if (!syncStatus || !statusText) return;

        if (isLive) {
            syncStatus.style.background = 'rgba(16, 185, 129, 0.1)';
            syncStatus.style.borderColor = 'rgba(16, 185, 129, 0.35)';
            syncStatus.style.color = '#10b981';
            syncStatus.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.1)';
            if (statusDot) statusDot.style.backgroundColor = '#10b981';
            statusText.textContent = ' LIVE · Cloudflare D1 已连接';
            if (demoBanner) demoBanner.hidden = true;
            if (cloudSyncFooter) cloudSyncFooter.textContent = '📡 Cloudflare D1 实时同步记录';
            if (btnSyncLocalScore) btnSyncLocalScore.innerHTML = SYNC_BTN_DEFAULT;
        } else {
            syncStatus.style.background = 'rgba(251, 191, 36, 0.1)';
            syncStatus.style.borderColor = 'rgba(251, 191, 36, 0.35)';
            syncStatus.style.color = '#fbbf24';
            syncStatus.style.boxShadow = '0 0 10px rgba(251, 191, 36, 0.1)';
            if (statusDot) statusDot.style.backgroundColor = '#fbbf24';
            statusText.textContent = ' OFFLINE · Mock 内存库';
            if (demoBanner) demoBanner.hidden = false;
            if (cloudSyncFooter) cloudSyncFooter.textContent = '📡 Mock 内存库记录（刷新重置）';
            if (btnSyncLocalScore) btnSyncLocalScore.innerHTML = SYNC_BTN_MOCK;
        }
    }

    function ensureCurrentUserInMock() {
        let userRecord = MOCK_D1_DB.users.find(function (u) { return u.id === currentUserId; });
        if (!userRecord) {
            MOCK_D1_DB.users.push({ id: currentUserId, username: localNickname, is_guest: 1 });
        } else {
            userRecord.username = localNickname;
        }

        if (!MOCK_D1_DB.leaderboards.find(function (l) { return l.user_id === currentUserId; })) {
            MOCK_D1_DB.leaderboards.push({
                user_id: currentUserId,
                score: localBestScore,
                ship_type: localSkin,
                updated_at: formatTimestamp()
            });
        }
    }

    function upsertMockScore(userId, username, score, shipType) {
        const safeName = API.sanitizeNickname(username, DEFAULT_NICKNAME);
        let userRecord = MOCK_D1_DB.users.find(function (u) { return u.id === userId; });
        if (!userRecord) {
            MOCK_D1_DB.users.push({ id: userId, username: safeName, is_guest: 1 });
        } else {
            userRecord.username = safeName;
        }

        let scoreRecord = MOCK_D1_DB.leaderboards.find(function (l) { return l.user_id === userId; });
        const previousScore = scoreRecord ? scoreRecord.score : 0;
        const now = formatTimestamp();

        if (score <= 0 && !scoreRecord) {
            return { updated: false, previousScore: 0, score: 0 };
        }

        if (!scoreRecord) {
            MOCK_D1_DB.leaderboards.push({ user_id: userId, score: score, ship_type: shipType, updated_at: now });
            return { updated: true, previousScore: 0 };
        }

        if (score > scoreRecord.score) {
            scoreRecord.score = score;
            scoreRecord.ship_type = shipType;
            scoreRecord.updated_at = now;
            return { updated: true, previousScore: previousScore };
        }

        return { updated: false, previousScore: scoreRecord.score };
    }

    function getMockSortedLeaderboard(limit) {
        return MOCK_D1_DB.leaderboards
            .slice()
            .sort(function (a, b) { return b.score - a.score || a.user_id.localeCompare(b.user_id); })
            .slice(0, limit)
            .map(function (record, index) {
                const user = MOCK_D1_DB.users.find(function (u) { return u.id === record.user_id; }) || { username: '未知飞行员' };
                return {
                    rank: index + 1,
                    user_id: record.user_id,
                    username: user.username,
                    score: record.score,
                    ship_type: record.ship_type,
                    updated_at: record.updated_at
                };
            });
    }

    function getDisplayEntries() {
        return liveMode ? liveEntries : getMockSortedLeaderboard(LEADERBOARD_LIMIT);
    }

    function getCloudScore() {
        if (liveMode && cloudPlayer) return cloudPlayer.score || 0;
        const record = MOCK_D1_DB.leaderboards.find(function (l) { return l.user_id === currentUserId; });
        return record ? record.score : 0;
    }

    function getPlayerRank() {
        if (liveMode && cloudPlayer && cloudPlayer.rank) return cloudPlayer.rank;
        const entries = getDisplayEntries();
        const found = entries.find(function (entry) { return entry.user_id === currentUserId; });
        return found ? found.rank : null;
    }

    async function refreshLiveData() {
        const [board, player] = await Promise.all([
            API.fetchLeaderboard(LEADERBOARD_LIMIT),
            API.fetchPlayer(currentUserId)
        ]);
        liveEntries = (board && board.entries) ? board.entries : [];
        cloudPlayer = player || null;
    }

    async function connectLiveApi() {
        if (!API.isEnabled()) {
            setConnectionUi(false);
            logToTerminal('SYSTEM', '联机功能已在 leaderboard_config.js 中关闭，使用 Mock 模式。');
            return false;
        }

        const apiLabel = API.getApiBase() || window.location.origin + '/api';
        logToTerminal('SYSTEM', '正在探测联机 API: ' + apiLabel);

        try {
            const healthy = await API.checkHealth();
            if (!healthy) throw new Error('health check failed');

            await refreshLiveData();
            setConnectionUi(true);
            logToTerminal('SYSTEM', 'Cloudflare D1 联机 API 连接成功。');
            return true;
        } catch (err) {
            setConnectionUi(false);
            logToTerminal('SYSTEM', '无法连接联机 API，已回退 Mock 模式。请检查 js/leaderboard_config.js 中的 apiBase 与 Worker 部署。');
            console.warn(err);
            return false;
        }
    }

    async function submitScoreToBackend(username, score, shipType) {
        if (liveMode) {
            logToTerminal('D1-API', 'POST /api/submit-score { user_id: \'' + currentUserId + '\', score: ' + score + ' }');
            const result = await API.submitScore(score, shipType, username);
            if (result.updated) {
                logToTerminal('D1-API', 'D1 记录更新：' + result.previous_score + ' → ' + result.score);
            } else if ((result.score || 0) <= 0) {
                logToTerminal('D1-API', '昵称已同步，零分玩家未写入排行榜。');
            } else {
                logToTerminal('D1-API', '分数 ' + score + ' 未突破云端记录，Upsert 已忽略。');
            }
            await refreshLiveData();
            return result;
        }

        logToTerminal('SQL-EX', 'INSERT INTO users (...) ON CONFLICT...', true);
        const mockResult = upsertMockScore(currentUserId, username, score, shipType);
        if (mockResult.updated) {
            logToTerminal('D1-API', 'Mock 云端最高分更新：' + mockResult.previousScore + ' → ' + score);
        } else if ((mockResult.score || score) <= 0) {
            logToTerminal('D1-API', '昵称已同步，零分玩家未写入 Mock 排行榜。');
        } else {
            logToTerminal('D1-API', '提交分数 ' + score + ' 未突破 Mock 记录 ' + mockResult.previousScore + '。');
        }
        return mockResult;
    }

    function writeLocalGameStorage(score, shipType, nickname) {
        localStorage.setItem('space_best_score', String(score));
        localStorage.setItem('space_current_skin', shipType);
        localStorage.setItem('space_user_nickname', API.sanitizeNickname(nickname));
        refreshLocalFromStorage();
    }

    function renderLocalCard() {
        localHighScoreText.textContent = localBestScore > 0 ? formatNumber(localBestScore) : '—';
        playerNameInput.value = localNickname;

        const cloudScore = getCloudScore();
        cloudHighScoreText.textContent = cloudScore > 0 ? formatNumber(cloudScore) : '—';

        const ship = getShipMeta(localSkin);
        avatarShipBadge.textContent = ship.badge;
        avatarBox.className = 'profile-avatar';
        avatarBox.style.borderColor = ship.border;

        const rank = getPlayerRank();
        playerRankText.textContent = rank ? ('全球排名 #' + rank) : '全球排名 —';
    }

    function createRankNode(rank) {
        const column = document.createElement('div');
        column.className = 'rank-column';
        if (rank === 1) {
            column.appendChild(createIcon('fa-solid fa-medal rank-gold'));
        } else if (rank === 2) {
            column.appendChild(createIcon('fa-solid fa-medal rank-silver'));
        } else if (rank === 3) {
            column.appendChild(createIcon('fa-solid fa-medal rank-bronze'));
        } else {
            const span = document.createElement('span');
            span.className = 'rank-normal';
            span.textContent = String(rank);
            column.appendChild(span);
        }
        return column;
    }

    function createIcon(className) {
        const icon = document.createElement('i');
        icon.className = className;
        return icon;
    }

    function renderLeaderboard() {
        const entries = getDisplayEntries();
        leaderboardList.replaceChildren();

        if (!entries.length) {
            const empty = document.createElement('div');
            empty.className = 'leaderboard-empty';
            empty.innerHTML = '<i class="fa-solid fa-satellite"></i>暂无排行数据。完成一局游戏并同步分数后即可上榜。';
            leaderboardList.appendChild(empty);
            return;
        }

        entries.forEach(function (record) {
            const ship = getShipMeta(record.ship_type);
            const isCurrentUser = record.user_id === currentUserId;

            const item = document.createElement('div');
            item.className = 'leaderboard-item' + (isCurrentUser ? ' highlight-user' : '');

            const userColumn = document.createElement('div');
            userColumn.className = 'user-column';

            const shipIconWrap = document.createElement('div');
            shipIconWrap.className = 'user-ship-ico ' + ship.className;
            shipIconWrap.innerHTML = '<i class="fa-solid ' + ship.icon + '"></i>';

            const userDetails = document.createElement('div');
            userDetails.className = 'user-details';

            const userName = document.createElement('span');
            userName.className = 'user-name';
            userName.textContent = record.username || '未知飞行员';
            if (isCurrentUser) {
                userName.appendChild(document.createTextNode(' '));
                const meTag = document.createElement('small');
                meTag.textContent = '(我)';
                userName.appendChild(meTag);
            }

            const shipName = document.createElement('span');
            shipName.className = 'user-ship-name';
            shipName.textContent = ship.name;

            userDetails.appendChild(userName);
            userDetails.appendChild(shipName);
            userColumn.appendChild(shipIconWrap);
            userColumn.appendChild(userDetails);

            const scoreColumn = document.createElement('div');
            scoreColumn.className = 'score-column';
            scoreColumn.textContent = formatNumber(record.score);

            const dateColumn = document.createElement('div');
            dateColumn.className = 'date-column';
            dateColumn.textContent = (record.updated_at || '').split(' ')[0];

            item.appendChild(createRankNode(record.rank));
            item.appendChild(userColumn);
            item.appendChild(scoreColumn);
            item.appendChild(dateColumn);
            leaderboardList.appendChild(item);
        });
    }

    function renderAll() {
        renderLocalCard();
        renderLeaderboard();
    }

    playerNameInput.addEventListener('change', async function () {
        localNickname = API.sanitizeNickname(playerNameInput.value, DEFAULT_NICKNAME);
        playerNameInput.value = localNickname;
        localStorage.setItem('space_user_nickname', localNickname);
        try {
            await submitScoreToBackend(localNickname, localBestScore, localSkin);
            renderAll();
            logToTerminal('D1-API', '昵称已同步 -> ' + localNickname);
        } catch (err) {
            logToTerminal('SYSTEM', '昵称同步失败: ' + err.message);
        }
    });

    btnSyncLocalScore.addEventListener('click', async function () {
        refreshLocalFromStorage();
        logToTerminal('D1-API', '开始同步本地数据 (Score: ' + localBestScore + ')...');
        try {
            await submitScoreToBackend(localNickname, localBestScore, localSkin);
            renderAll();
            logToTerminal('SYSTEM', liveMode ? 'D1 云端同步完成。' : 'Mock 云端同步完成。');
            flashButton(
                btnSyncLocalScore,
                '<i class="fa-solid fa-check"></i> 同步已完成',
                liveMode ? SYNC_BTN_DEFAULT : SYNC_BTN_MOCK
            );
        } catch (err) {
            logToTerminal('SYSTEM', '同步失败: ' + err.message);
        }
    });

    btnRefreshLocal.addEventListener('click', function () {
        refreshLocalFromStorage();
        renderLocalCard();
        logToTerminal('LOCAL', '已重新读取 localStorage：score=' + localBestScore + ', skin=' + localSkin);
    });

    btnOpenSimModal.addEventListener('click', function () {
        refreshLocalFromStorage();
        simUsername.value = localNickname;
        const demoBase = localBestScore > 0 ? localBestScore : 3500;
        simScore.value = Math.floor(demoBase * 0.8 + Math.random() * demoBase * 0.4);
        simShip.value = localSkin;
        simWriteLocal.checked = false;
        simModal.classList.add('active');
    });

    function closeModal() {
        simModal.classList.remove('active');
    }

    btnCloseModal.addEventListener('click', closeModal);
    btnCancelSim.addEventListener('click', closeModal);
    simModal.addEventListener('click', function (event) {
        if (event.target === simModal) closeModal();
    });

    btnRandomScore.addEventListener('click', function () {
        const rand = Math.floor(1000 + Math.random() * 200000);
        simScore.value = rand;
        logToTerminal('SIM', '随机生成演示分数: ' + rand);
    });

    btnSubmitSim.addEventListener('click', async function () {
        const scoreVal = Math.max(0, parseInt(simScore.value, 10) || 0);
        const shipVal = simShip.value;
        const nameVal = API.sanitizeNickname(simUsername.value, DEFAULT_NICKNAME);
        const shouldWriteLocal = simWriteLocal.checked;

        closeModal();

        if (shouldWriteLocal && scoreVal > localBestScore) {
            writeLocalGameStorage(scoreVal, shipVal, nameVal);
            logToTerminal('LOCAL', '已写入 localStorage：space_best_score = ' + scoreVal);
        } else if (shouldWriteLocal) {
            logToTerminal('LOCAL', '分数未超过本地记录，未改写游戏存档。');
        } else {
            logToTerminal('LOCAL', '未勾选本地存档写入，仅提交至' + (liveMode ? ' D1 云端' : ' Mock') + '。');
        }

        try {
            await submitScoreToBackend(nameVal, scoreVal, shipVal);
            if (shouldWriteLocal) {
                localNickname = nameVal;
                localSkin = shipVal;
            }
            renderAll();
        } catch (err) {
            logToTerminal('SYSTEM', '模拟结算提交失败: ' + err.message);
        }
    });

    tabHeaders.addEventListener('click', function (event) {
        const target = event.target.closest('.tab-header');
        if (!target) return;

        document.querySelectorAll('.tab-header').forEach(function (btn) { btn.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function (content) { content.classList.remove('active'); });

        target.classList.add('active');
        document.getElementById('tab-' + target.getAttribute('data-tab')).classList.add('active');
    });

    window.copyCode = function (id) {
        const preEl = document.getElementById(id);
        navigator.clipboard.writeText(preEl.innerText).then(function () {
            logToTerminal('SYSTEM', '已将代码复制到剪贴板。');
            const btn = preEl.parentElement.querySelector('.copy-btn');
            if (!btn) return;
            const origHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
            setTimeout(function () { btn.innerHTML = origHtml; }, 2000);
        }).catch(function () {
            logToTerminal('SYSTEM', '复制失败，请手动选择代码复制。');
        });
    };

    window.addEventListener('focus', async function () {
        refreshLocalFromStorage();
        if (liveMode) {
            try {
                await refreshLiveData();
            } catch (_) {}
        }
        renderAll();
    });

    async function initPage() {
        refreshLocalFromStorage();
        ensureCurrentUserInMock();
        await connectLiveApi();
        renderAll();
    }

    initPage();
})();
