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

        // --- V6 皮肤 UI 更新 ---
        const skins = [
            { id: 'void', cost: 80, textId: 'skinVoidText', btnId: 'buySkinVoidBtn', name: '星渊幻影' },
            { id: 'thunder', cost: 100, textId: 'skinThunderText', btnId: 'buySkinThunderBtn', name: '超维雷霆' },
            { id: 'imperial', cost: 120, textId: 'skinImperialText', btnId: 'buySkinImperialBtn', name: '帝皇余晖' }
        ];

        skins.forEach(s => {
            const txt = document.getElementById(s.textId);
            const btn = document.getElementById(s.btnId);
            if (!txt || !btn) return;

            if (this.currentSkin === s.id) {
                txt.innerText = `[使用中 • 极效]`;
                txt.className = txt.className.replace('text-gray-500', '').trim() + ' text-emerald-400 font-bold';
                btn.innerText = "使用中";
                btn.disabled = true;
                btn.className = btn.className.replace(/bg-\w+-600/, 'bg-emerald-600');
            } else if (this.unlockedSkins.includes(s.id)) {
                txt.innerText = `[已解锁]`;
                txt.className = txt.className.replace('text-emerald-400', '').trim() + ' text-gray-400';
                btn.innerText = "装配";
                btn.disabled = false;
                // restore base colors based on skin type
                const color = s.id === 'void' ? 'fuchsia' : (s.id === 'thunder' ? 'yellow' : 'amber');
                btn.className = btn.className.replace(/bg-\w+-600/, `bg-${color}-600`);
            } else {
                txt.innerText = "未解锁";
                txt.className = txt.className.replace('text-emerald-400', '').trim() + ' text-gray-500';
                btn.innerText = `解锁: ${s.cost} 废料`;
                btn.disabled = this.scrap < s.cost;
                const color = s.id === 'void' ? 'fuchsia' : (s.id === 'thunder' ? 'yellow' : 'amber');
                btn.className = btn.className.replace(/bg-\w+-600/, `bg-${color}-600`);
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
