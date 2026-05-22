// =============================================
// 星海猎手 V6: GameEngine - HANGAR 模块
// =============================================

Object.assign(GameEngine.prototype, {
    openHangar() {
        this.isPaused = true;
        this.workshopScreen.classList.remove('hidden');
        this.updateHangarUI();
    },

    updateHangarUI() {
        document.getElementById('shopScrapText').innerText = this.scrap;
        const buyTurretBtn = document.getElementById('buyTurretBtn');
        const turretLevelText = document.getElementById('turretLevelText');
        if (this.hangar.turretLevel >= 3) {
            turretLevelText.innerText = `[MAX • 级3]`;
            buyTurretBtn.innerText = "已满级";
            buyTurretBtn.disabled = true;
        } else {
            const cost = 50 + this.hangar.turretLevel * 30;
            turretLevelText.innerText = this.hangar.turretLevel > 0 ? `[级${this.hangar.turretLevel}]` : "未装备";
            buyTurretBtn.innerText = `升级: ${cost} 废料`;
            buyTurretBtn.disabled = this.scrap < cost;
        }

        const buyEngineBtn = document.getElementById('buyEngineBtn');
        const engineLevelText = document.getElementById('engineLevelText');
        if (this.hangar.engineLevel >= 3) {
            engineLevelText.innerText = `[MAX • 级3]`;
            buyEngineBtn.innerText = "已满级";
            buyEngineBtn.disabled = true;
        } else {
            const cost = 40 + this.hangar.engineLevel * 25;
            engineLevelText.innerText = this.hangar.engineLevel > 0 ? `[级${this.hangar.engineLevel}]` : "未装备";
            buyEngineBtn.innerText = `升级: ${cost} 废料`;
            buyEngineBtn.disabled = this.scrap < cost;
        }

        const buyWingsBtn = document.getElementById('buyWingsBtn');
        const wingsLevelText = document.getElementById('wingsLevelText');
        if (this.hangar.wingsLevel >= 1) {
            wingsLevelText.innerText = `[MAX • 已激活]`;
            buyWingsBtn.innerText = "已装配";
            buyWingsBtn.disabled = true;
        } else {
            wingsLevelText.innerText = "未装备";
            buyWingsBtn.innerText = `购买: 60 废料`;
            buyWingsBtn.disabled = this.scrap < 60;
        }

        // --- V6 皮肤 UI 更新 (v2 涂装卡：status chip + action button + is-equipped 三件套) ---
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
                btn.disabled = this.scrap < s.cost;
                btn.innerHTML = `<span class="cost"><i class="fa-solid fa-cube text-amber-300"></i> ${s.cost}</span> 解锁涂装`;
            }
        });
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
            if (this.scrap >= cost) {
                this.scrap -= cost;
                this.unlockedSkins.push(skinId);
                localStorage.setItem('space_unlocked_skins', JSON.stringify(this.unlockedSkins));
                this.currentSkin = skinId;
                localStorage.setItem('space_current_skin', skinId);
                sfx.playPowerup();
                const names = { void: '🌌 星渊幻影', thunder: '⚡ 超维雷霆', imperial: '✨ 帝皇余晖' };
                this.showToast(`✨ 成功解锁并装配超维机体: ${names[skinId] || skinId}`);
            } else {
                this.showToast("❌ 合金废料不足，无法解锁！");
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
