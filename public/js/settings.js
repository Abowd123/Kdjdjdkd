/**
 * Settings Manager - إدارة مفاتيح API من داخل الموقع
 * تسجيل دخول بكلمة مرور الإدارة، إضافة/حذف/تفعيل مفاتيح، اختبار الكل، واختيار وضع التشغيل
 */

class SettingsManager {
    constructor() {
        this.TOKEN_KEY = 'ai_chat_admin_token';
        this.PROVIDER_KEY = 'ai_chat_provider_id';
        this.token = localStorage.getItem(this.TOKEN_KEY) || null;

        this.els = {
            openBtn: document.getElementById('settingsBtn'),
            overlay: document.getElementById('settingsOverlay'),
            closeBtn: document.getElementById('settingsCloseBtn'),
            loginView: document.getElementById('settingsLoginView'),
            mainView: document.getElementById('settingsMainView'),
            passwordInput: document.getElementById('adminPasswordInput'),
            loginBtn: document.getElementById('adminLoginBtn'),
            loginError: document.getElementById('adminLoginError'),
            keysList: document.getElementById('apiKeysList'),
            addForm: document.getElementById('addKeyForm'),
            nameInput: document.getElementById('newKeyName'),
            baseUrlInput: document.getElementById('newKeyBaseUrl'),
            apiKeyInput: document.getElementById('newKeyApiKey'),
            modelInput: document.getElementById('newKeyModel'),
            testAllBtn: document.getElementById('testAllKeysBtn'),
            providerSelect: document.getElementById('providerSelect'),
            logoutBtn: document.getElementById('adminLogoutBtn')
        };

        this.bindEvents();
    }

    bindEvents() {
        this.els.openBtn?.addEventListener('click', () => this.open());
        this.els.closeBtn?.addEventListener('click', () => this.close());
        this.els.overlay?.addEventListener('click', (e) => {
            if (e.target === this.els.overlay) this.close();
        });

        this.els.loginBtn?.addEventListener('click', () => this.login());
        this.els.passwordInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.login();
        });

        this.els.addForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addKey();
        });

        this.els.testAllBtn?.addEventListener('click', () => this.testAllKeys());

        this.els.providerSelect?.addEventListener('change', () => {
            localStorage.setItem(this.PROVIDER_KEY, this.els.providerSelect.value);
        });

        this.els.logoutBtn?.addEventListener('click', () => this.logout());

        this.els.keysList?.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.key-delete-btn');
            if (delBtn) {
                this.deleteKey(delBtn.dataset.id);
                return;
            }
            const toggle = e.target.closest('.key-enabled-toggle');
            if (toggle) {
                this.toggleKey(toggle.dataset.id, toggle.checked);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    }

    open() {
        this.els.overlay.classList.add('show');
        if (this.token) {
            this.showMain();
            this.loadKeys();
        } else {
            this.showLogin();
        }
    }

    close() {
        this.els.overlay.classList.remove('show');
    }

    showLogin() {
        this.els.loginView.style.display = 'block';
        this.els.mainView.style.display = 'none';
        this.els.loginError.textContent = '';
        this.els.passwordInput.value = '';
        this.els.passwordInput.focus();
    }

    showMain() {
        this.els.loginView.style.display = 'none';
        this.els.mainView.style.display = 'block';
    }

    async login() {
        const password = this.els.passwordInput.value.trim();
        if (!password) return;

        this.els.loginBtn.disabled = true;
        this.els.loginError.textContent = '';

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل تسجيل الدخول');

            this.token = data.token;
            localStorage.setItem(this.TOKEN_KEY, this.token);
            this.showMain();
            this.loadKeys();
        } catch (err) {
            this.els.loginError.textContent = err.message;
        } finally {
            this.els.loginBtn.disabled = false;
        }
    }

    logout() {
        this.token = null;
        localStorage.removeItem(this.TOKEN_KEY);
        this.showLogin();
    }

    authHeaders() {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`
        };
    }

    async loadKeys() {
        this.els.keysList.innerHTML = '<p class="no-keys-msg">جاري التحميل...</p>';
        try {
            const res = await fetch('/api/admin/keys', { headers: this.authHeaders() });
            if (res.status === 401) {
                this.logout();
                return;
            }
            const data = await res.json();
            this.renderKeys(data.keys || []);
            this.renderProviderOptions(data.keys || []);
        } catch (err) {
            this.els.keysList.innerHTML = `<p class="no-keys-msg">تعذر تحميل المفاتيح: ${this.escapeHtml(err.message)}</p>`;
        }
    }

    renderKeys(keys) {
        if (!keys.length) {
            this.els.keysList.innerHTML = '<p class="no-keys-msg">لا توجد مفاتيح مضافة بعد. أضف مفتاحًا من الأعلى.</p>';
            return;
        }

        this.els.keysList.innerHTML = keys
            .map(
                (k) => `
            <div class="api-key-card" data-id="${k.id}">
                <div class="api-key-card-header">
                    <strong>${this.escapeHtml(k.name)}</strong>
                    <label class="toggle-switch" title="تفعيل / تعطيل">
                        <input type="checkbox" class="key-enabled-toggle" data-id="${k.id}" ${k.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="api-key-card-body">
                    <div class="api-key-detail"><span>الرابط:</span> ${this.escapeHtml(k.baseUrl)}</div>
                    <div class="api-key-detail"><span>الموديل:</span> ${this.escapeHtml(k.model || '-')}</div>
                    <div class="api-key-detail"><span>المفتاح:</span> <code>${this.escapeHtml(k.apiKeyMasked)}</code></div>
                    <div class="api-key-status" id="status-${k.id}"></div>
                </div>
                <button class="key-delete-btn" data-id="${k.id}">🗑️ حذف</button>
            </div>
        `
            )
            .join('');
    }

    renderProviderOptions(keys) {
        const current = localStorage.getItem(this.PROVIDER_KEY) || 'auto';
        let html = '<option value="auto">تلقائي (Failover)</option>';
        html += keys.map((k) => `<option value="${k.id}">${this.escapeHtml(k.name)}</option>`).join('');
        this.els.providerSelect.innerHTML = html;

        const validValues = [...this.els.providerSelect.options].map((o) => o.value);
        this.els.providerSelect.value = validValues.includes(current) ? current : 'auto';
        localStorage.setItem(this.PROVIDER_KEY, this.els.providerSelect.value);
    }

    async addKey() {
        const name = this.els.nameInput.value.trim();
        const baseUrl = this.els.baseUrlInput.value.trim() || 'https://gorouter.app/v1/chat/completions';
        const apiKey = this.els.apiKeyInput.value.trim();
        const model = this.els.modelInput.value.trim() || 'claude-opus-5-thinking';

        if (!name || !apiKey) return;

        try {
            const res = await fetch('/api/admin/keys', {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify({ name, baseUrl, apiKey, model, enabled: true })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشلت الإضافة');

            this.els.addForm.reset();
            this.els.baseUrlInput.value = 'https://gorouter.app/v1/chat/completions';
            this.els.modelInput.value = 'claude-opus-5-thinking';
            this.loadKeys();
        } catch (err) {
            alert(err.message);
        }
    }

    async deleteKey(id) {
        if (!confirm('متأكد من حذف هذا المفتاح؟')) return;
        try {
            const res = await fetch(`/api/admin/keys?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: this.authHeaders()
            });
            if (!res.ok) throw new Error('فشل الحذف');
            this.loadKeys();
        } catch (err) {
            alert(err.message);
        }
    }

    async toggleKey(id, enabled) {
        try {
            await fetch('/api/admin/keys', {
                method: 'PATCH',
                headers: this.authHeaders(),
                body: JSON.stringify({ id, enabled })
            });
        } catch (err) {
            console.error('[Settings] toggle error:', err);
        }
    }

    async testAllKeys() {
        this.els.testAllBtn.disabled = true;
        this.els.testAllBtn.textContent = 'جاري الاختبار...';

        document.querySelectorAll('.api-key-status').forEach((el) => {
            el.innerHTML = '<span class="status-testing">⏳ جاري الاختبار...</span>';
        });

        try {
            const res = await fetch('/api/admin/test', {
                method: 'POST',
                headers: this.authHeaders()
            });
            const data = await res.json();

            (data.results || []).forEach((r) => {
                const el = document.getElementById(`status-${r.id}`);
                if (!el) return;
                el.innerHTML = r.ok
                    ? `<span class="status-ok">✅ ${this.escapeHtml(r.message)}</span>`
                    : `<span class="status-fail">❌ ${this.escapeHtml(r.message)}</span>`;
            });
        } catch (err) {
            alert('فشل الاتصال بالسيرفر أثناء الاختبار.');
        } finally {
            this.els.testAllBtn.disabled = false;
            this.els.testAllBtn.textContent = 'اختبار جميع المفاتيح';
        }
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    getSelectedProviderId() {
        return localStorage.getItem(this.PROVIDER_KEY) || 'auto';
    }
}

window.settingsManager = new SettingsManager();
