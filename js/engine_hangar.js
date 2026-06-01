// =============================================
// 星海猎手 V7: GameEngine - HANGAR 模块
// =============================================

Object.assign(GameEngine.prototype, {
    openHangar() {
        this.isPaused = true;
        this.workshopScreen.classList.remove('hidden');
        this.updateHangarUI();
    },

    _renderUpgradeCard(cardId, progressId, tagId, btnId, level, maxLevel, cost, labels, balance = this.scrap) {
        const card = document.getElementById(cardId);
        const progress = document.getElementById(progressId);
        const tag = document.getElementById(tagId);
        const btn = document.getElementById(btnId);
        if (!card || !progress || !tag || !btn) return;

        const dots = progress.querySelectorAll('.dot');
        for (let i = 0; i < dots.length; i++) {
            if (i < level) dots[i].classList.add('active');
            else dots[i].classList.remove('active');
        }

        if (level >= maxLevel) {
            card.classList.add('is-maxed');
            tag.innerText = labels.maxed;
            btn.innerText = labels.btnMaxed;
            btn.disabled = true;
        } else {
            card.classList.remove('is-maxed');
            tag.innerText = level > 0 ? labels.leveled(level) : labels.locked;
            btn.innerText = labels.btnCost(cost);
            btn.disabled = balance < cost;
        }
    },

    updateHangarUI() {
        document.getElementById('shopScrapText').innerText = this.scrap;
        const permanentCoreText = document.getElementById('permanentCoreText');
        const permanentCores = safeReadPermanentCores();
        if (permanentCoreText) permanentCoreText.innerText = permanentCores;

        this._renderUpgradeCard(
            'upgradeCardTurret', 'turretProgress', 'turretLevelText', 'buyTurretBtn',
            this.hangar.turretLevel, 3, 50 + this.hangar.turretLevel * 30,
            {
                maxed: 'MAX · LV.3',
                btnMaxed: '已满级',
                leveled: (lv) => `LV.${lv}`,
                locked: '未装备',
                btnCost: (c) => `升级 · ${c}`
            }
        );

        this._renderUpgradeCard(
            'upgradeCardEngine', 'engineProgress', 'engineLevelText', 'buyEngineBtn',
            this.hangar.engineLevel, 3, 40 + this.hangar.engineLevel * 25,
            {
                maxed: 'MAX · LV.3',
                btnMaxed: '已满级',
                leveled: (lv) => `LV.${lv}`,
                locked: '未装备',
                btnCost: (c) => `升级 · ${c}`
            }
        );

        this._renderUpgradeCard(
            'upgradeCardWings', 'wingsProgress', 'wingsLevelText', 'buyWingsBtn',
            this.hangar.wingsLevel, 1, 60,
            {
                maxed: 'EQUIPPED',
                btnMaxed: '已装配',
                leveled: (lv) => `LV.${lv}`,
                locked: '未装备',
                btnCost: (c) => `购买 · ${c}`
            }
        );

        // --- V7 皮肤 UI 更新 (v2 涂装卡：status chip + action button + is-equipped 三件套) ---
        const skins = [
            { id: 'void',     cost: 80,  cardId: 'skinCardVoid',     textId: 'skinVoidText',     btnId: 'buySkinVoidBtn' },
            { id: 'thunder',  cost: 100, cardId: 'skinCardThunder',  textId: 'skinThunderText',  btnId: 'buySkinThunderBtn' },
            { id: 'imperial', cost: 120, cardId: 'skinCardImperial', textId: 'skinImperialText', btnId: 'buySkinImperialBtn' }
        ];

        skins.forEach(s => {
            const card = document.getElementById(s.cardId);
            const chip = document.getElementById(s.textId);
            const btn = document.getElementById(s.btnId);
            if (!card || !chip || !btn) return;

            if (this.currentSkin === s.id) {
                card.classList.add('is-equipped');
                chip.className = 'status-chip status-equipped';
                chip.innerHTML = '<i class="fa-solid fa-circle-radiation text-[8px]"></i> EQUIPPED';
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-check-double text-[10px] mr-2"></i> 使用中';
            } else if (this.unlockedSkins.includes(s.id)) {
                card.classList.remove('is-equipped');
                chip.className = 'status-chip status-unlocked';
                chip.innerHTML = '<i class="fa-solid fa-circle-check text-[8px]"></i> Unlocked';
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-rocket text-[10px] mr-2"></i> 装配涂装';
            } else {
                card.classList.remove('is-equipped');
                chip.className = 'status-chip status-locked';
                chip.innerHTML = '<i class="fa-solid fa-lock text-[8px]"></i> Locked';
                btn.disabled = permanentCores < s.cost;
                btn.innerHTML = `<span class="cost"><i class="fa-solid fa-gem text-cyan-300"></i> ${s.cost}</span> 解锁涂装`;
            }
        });

        // --- V7 先驱者永久天赋矩阵 ---
        this.renderTalentCards();
    },

    renderTalentCards() {
        if (typeof TALENT_DEFINITIONS === 'undefined') return;
        const labels = {
            maxed: 'MAX',
            btnMaxed: '已点满',
            leveled: (lv) => `LV.${lv}`,
            locked: '未点亮',
            btnCost: (c) => `点亮 · ${c}`
        };
        for (let i = 0; i < TALENT_DEFINITIONS.length; i++) {
            const def = TALENT_DEFINITIONS[i];
            this._renderUpgradeCard(
                `talentCard${def.id}`, `talentProgress${def.id}`, `talentLevelText${def.id}`, `buyTalent${def.id}Btn`,
                (this.talents && this.talents[def.id]) || 0, def.maxLevel, def.cost, labels, permanentCores
            );
        }
    },

    buyTalent(id) {
        if (typeof TALENT_DEFINITIONS === 'undefined') return;
        const def = TALENT_DEFINITIONS.find(t => t.id === id);
        if (!def) return;
        if (!this.talents) this.talents = defaultTalents();
        const lv = this.talents[id] || 0;
        if (lv >= def.maxLevel) return;
        const permanentCores = safeReadPermanentCores();
        if (permanentCores < def.cost) {
            this.showToast("❌ 星核不足，无法点亮永久天赋！");
            return;
        }
        savePermanentCores(permanentCores - def.cost);
        this.talents[id] = lv + 1;
        localStorage.setItem('space_v7_talents', JSON.stringify(this.talents));
        sfx.playPowerup();
        this.showToast(`🧬 永久天赋【${def.name}】已强化至 LV.${this.talents[id]}！`);
        this.updateHangarUI();
        this.updateHUD();
    },

    buyModule(type, baseCost) {
        let cost = baseCost;
        if (type === 'turret') {
            cost = 50 + this.hangar.turretLevel * 30;
            if (this.scrap >= cost && this.hangar.turretLevel < 3) {
                this.scrap -= cost;
                this.hangar.turretLevel++;
                sfx.playPowerup();
                this.showToast(`🛠 纳米伴飞僚机装配成功！当前僚机等级/数量: ${this.hangar.turretLevel}`);
            }
        } else if (type === 'engine') {
            cost = 40 + this.hangar.engineLevel * 25;
            if (this.scrap >= cost && this.hangar.engineLevel < 3) {
                this.scrap -= cost;
                this.hangar.engineLevel++;
                sfx.playPowerup();
                this.showToast(`🛠 等离子尾喷升级成功！当前等级: ${this.hangar.engineLevel}`);
            }
        } else if (type === 'wings') {
            if (this.scrap >= 60 && this.hangar.wingsLevel < 1) {
                this.scrap -= 60;
                this.hangar.wingsLevel = 1;
                sfx.playPowerup();
                this.showToast("🛠 切割能盾翼配置成功！");
            }
        }
        this.updateHangarUI();
        this.updateHUD();
    },

    interactSkin(skinId, cost) {
        if (this.unlockedSkins.includes(skinId)) {
            // Equip skin
            this.currentSkin = skinId;
            localStorage.setItem('space_current_skin', skinId);
            sfx.playSkinSwitch();
            const names = { void: '🌌 星渊幻影', thunder: '⚡ 超维雷霆', imperial: '✨ 帝皇余晖' };
            this.showToast(`🎨 成功切换机体涂装为: ${names[skinId] || skinId}`);
        } else {
            // Unlock skin
            const permanentCores = safeReadPermanentCores();
            if (permanentCores >= cost) {
                savePermanentCores(permanentCores - cost);
                this.unlockedSkins.push(skinId);
                localStorage.setItem('space_unlocked_skins', JSON.stringify(this.unlockedSkins));
                this.currentSkin = skinId;
                localStorage.setItem('space_current_skin', skinId);
                sfx.playPowerup();
                const names = { void: '🌌 星渊幻影', thunder: '⚡ 超维雷霆', imperial: '✨ 帝皇余晖' };
                this.showToast(`✨ 成功解锁并装配超维机体: ${names[skinId] || skinId}`);
            } else {
                this.showToast("❌ 星核不足，无法解锁！");
            }
        }
        this.updateHangarUI();
        this.updateHUD();
    },

    exitHangar() {
        this.workshopScreen.classList.add('hidden');
        this.isPaused = false;
        this.showToast(`🛰 舰队重新起航！当前波数: ${this.wave}`);
    }

});
