/**
 * AI Chat App - Frontend Application
 * Streaming + Markdown + Copy + Regenerate + Download + Local History
 * Provider: gorouter.app (OpenAI-compatible)
 */

class ChatApp {
    constructor() {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true
            });
        }

        this.state = {
            messages: [],
            currentModel: 'claude-opus-5-thinking',
            isProcessing: false,
            conversations: [],
            currentConversationId: null,
            abortController: null,
            lastUserMessage: null
        };

        this.elements = {
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            menuToggle: document.getElementById('menuToggle'),
            messagesArea: document.getElementById('messagesArea'),
            messagesContainer: document.getElementById('messagesContainer'),
            welcomeScreen: document.getElementById('welcomeScreen'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            newChatBtn: document.getElementById('newChatBtn'),
            modelSelectorBtn: document.getElementById('modelSelectorBtn'),
            modelDropdown: document.getElementById('modelDropdown'),
            selectedModelName: document.getElementById('selectedModelName'),
            conversationsList: document.getElementById('conversationsList'),
            noConversations: document.getElementById('noConversations'),
            suggestionBtns: document.querySelectorAll('.suggestion-btn'),
            stopBtn: document.getElementById('stopBtn'),
            downloadAllBtn: document.getElementById('downloadAllBtn')
        };

        this.modelNames = {
            'claude-opus-5-thinking': 'Claude Opus 5 Thinking',
            'claude-sonnet-5': 'Claude Sonnet 5',
            'claude-haiku-4-5': 'Claude Haiku 4.5',
            'gpt-4o': 'GPT-4o'
        };

        this.STORAGE_KEY = 'ai_chat_conversations';

        this.init();
    }

    init() {
        this.bindEvents();
        this.adjustTextareaHeight();
        this.updateSendButton();
        this.loadConversations();
        this.renderConversationsList();
    }

    bindEvents() {
        this.elements.menuToggle.addEventListener('click', () => this.toggleSidebar());
        this.elements.sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        this.elements.newChatBtn.addEventListener('click', () => this.startNewChat());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());

        this.elements.messageInput.addEventListener('keydown', (e) => this.handleInputKeydown(e));
        this.elements.messageInput.addEventListener('input', () => {
            this.adjustTextareaHeight();
            this.updateSendButton();
        });

        this.elements.modelSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleModelDropdown();
        });

        document.querySelectorAll('.model-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectModel(option.dataset.model);
            });
        });

        document.addEventListener('click', () => this.closeModelDropdown());

        this.elements.suggestionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.messageInput.value = btn.dataset.prompt;
                this.adjustTextareaHeight();
                this.updateSendButton();
                this.sendMessage();
            });
        });

        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => this.stopGeneration());
        }

        if (this.elements.downloadAllBtn) {
            this.elements.downloadAllBtn.addEventListener('click', () => this.downloadFullConversation());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeSidebar();
        });

        window.addEventListener('beforeunload', () => {
            if (this.state.abortController) this.state.abortController.abort();
        });

        // Delegated events for dynamic buttons
        this.elements.messagesContainer.addEventListener('click', (e) => {
            const copyCodeBtn = e.target.closest('.copy-code-btn');
            if (copyCodeBtn) {
                const codeBlock = copyCodeBtn.closest('.code-block-wrapper');
                const code = codeBlock?.querySelector('code')?.textContent || '';
                this.copyToClipboard(code, copyCodeBtn);
                return;
            }

            const copyMsgBtn = e.target.closest('.copy-message-btn');
            if (copyMsgBtn) {
                const messageEl = copyMsgBtn.closest('.message');
                const textEl = messageEl?.querySelector('.message-text');
                this.copyToClipboard(textEl?.textContent || '', copyMsgBtn);
                return;
            }

            const downloadBtn = e.target.closest('.download-message-btn');
            if (downloadBtn) {
                const messageEl = downloadBtn.closest('.message');
                const textEl = messageEl?.querySelector('.message-text');
                this.downloadMessage(textEl?.textContent || '');
                return;
            }

            const regenBtn = e.target.closest('.regenerate-btn');
            if (regenBtn) {
                this.regenerateResponse();
                return;
            }
        });

        // Delegated events for conversation list
        this.elements.conversationsList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.conv-delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                const id = deleteBtn.closest('.conversation-item')?.dataset.id;
                if (id) this.deleteConversation(id);
                return;
            }

            const item = e.target.closest('.conversation-item');
            if (item) {
                this.openConversation(item.dataset.id);
            }
        });
    }

    // ============================================
    // Sidebar
    // ============================================
    toggleSidebar() {
        this.elements.sidebar.classList.contains('open') ? this.closeSidebar() : this.openSidebar();
    }
    openSidebar() {
        this.elements.sidebar.classList.add('open');
        this.elements.sidebarOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    closeSidebar() {
        this.elements.sidebar.classList.remove('open');
        this.elements.sidebarOverlay.classList.remove('show');
        document.body.style.overflow = '';
    }

    // ============================================
    // Model Selector
    // ============================================
    toggleModelDropdown() {
        this.elements.modelDropdown.classList.contains('show') ? this.closeModelDropdown() : this.openModelDropdown();
    }
    openModelDropdown() {
        this.elements.modelDropdown.classList.add('show');
        this.elements.modelSelectorBtn.classList.add('active');
    }
    closeModelDropdown() {
        this.elements.modelDropdown.classList.remove('show');
        this.elements.modelSelectorBtn.classList.remove('active');
    }
    selectModel(model) {
        this.state.currentModel = model;
        this.elements.selectedModelName.textContent = this.modelNames[model] || model;
        document.querySelectorAll('.model-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.model === model);
        });
        this.closeModelDropdown();
    }

    // ============================================
    // Input
    // ============================================
    handleInputKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }
    adjustTextareaHeight() {
        const t = this.elements.messageInput;
        t.style.height = 'auto';
        t.style.height = Math.min(t.scrollHeight, 200) + 'px';
    }
    updateSendButton() {
        const hasContent = this.elements.messageInput.value.trim().length > 0;
        this.elements.sendBtn.classList.toggle('has-content', hasContent);
    }

    // ============================================
    // Send / Streaming
    // ============================================
    async sendMessage() {
        const content = this.elements.messageInput.value.trim();
        if (!content || this.state.isProcessing) return;

        this.state.lastUserMessage = content;

        this.elements.welcomeScreen.style.display = 'none';
        this.elements.messagesContainer.style.display = 'flex';

        this.state.messages.push({ role: 'user', content });
        this.renderMessage('user', content);

        this.elements.messageInput.value = '';
        this.adjustTextareaHeight();
        this.updateSendButton();

        await this.startStreaming();
        this.saveCurrentConversation();
    }

    async startStreaming() {
        this.state.isProcessing = true;
        this.updateSendButton();
        this.showStopButton();

        const typingEl = this.showTypingIndicator();
        this.state.abortController = new AbortController();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: this.state.messages,
                    model: this.state.currentModel,
                    providerId: window.settingsManager ? window.settingsManager.getSelectedProviderId() : 'auto'
                }),
                signal: this.state.abortController.signal
            });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch { errorData = { message: `HTTP Error ${response.status}: ${response.statusText}` }; }
                throw new Error(errorData.message || errorData.error || 'Unknown error');
            }

            this.removeTypingIndicator(typingEl);

            const assistantMessageEl = this.createAssistantBubble();
            let fullContent = '';
            let hasReceivedContent = false;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    const dataStr = trimmedLine.slice(6);
                    if (dataStr === '[DONE]') break;

                    try {
                        const data = JSON.parse(dataStr);
                        if (data._debug) continue;
                        if (data.error) throw new Error(data.message || 'Stream error');

                        if (data.content) {
                            fullContent += data.content;
                            hasReceivedContent = true;
                            this.updateAssistantBubbleStreaming(assistantMessageEl, fullContent);
                        }
                    } catch (parseError) {
                        console.warn('[Stream] Parse warning:', parseError.message);
                    }
                }
            }

            if (hasReceivedContent) {
                this.updateAssistantBubbleFinal(assistantMessageEl, fullContent);
            } else {
                this.updateAssistantBubbleFinal(assistantMessageEl, '⚠️ لم يتم استلام أي رد. يرجى المحاولة مرة أخرى.');
            }

            this.state.messages.push({ role: 'assistant', content: fullContent || '⚠️ لم يتم استلام رد.' });
            this.addMessageActions(assistantMessageEl);

        } catch (error) {
            console.error('[Chat] Error:', error);
            this.removeTypingIndicator(typingEl);

            let errorMessage = '';
            if (error.name === 'AbortError') {
                errorMessage = '⏹️ تم إيقاف التوليد.';
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = '⚠️ فشل الاتصال بالخادم. تأكد من اتصالك بالإنترنت وأن الخادم يعمل.';
            } else if (error.message.includes('401') || error.message.includes('Invalid API key')) {
                errorMessage = '⚠️ خطأ في المصادقة. يرجى التحقق من مفتاح API الخاص بـ gorouter.app.';
            } else if (error.message.includes('429') || error.message.includes('Rate limit')) {
                errorMessage = '⚠️ تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار قليلاً ثم المحاولة.';
            } else if (error.message.includes('502') || error.message.includes('503')) {
                errorMessage = '⚠️ خدمة الذكاء الاصطناعي غير متاحة حالياً. يرجى المحاولة لاحقاً.';
            } else {
                errorMessage = `⚠️ حدث خطأ: ${error.message}`;
            }

            this.renderMessage('assistant', errorMessage, true);
            this.state.messages.push({ role: 'assistant', content: errorMessage });

        } finally {
            this.state.isProcessing = false;
            this.state.abortController = null;
            this.updateSendButton();
            this.hideStopButton();
            this.scrollToBottom();
        }
    }

    stopGeneration() {
        if (this.state.abortController) {
            this.state.abortController.abort();
            this.state.abortController = null;
        }
    }

    async regenerateResponse() {
        if (this.state.isProcessing || !this.state.lastUserMessage) return;

        const lastMessage = this.state.messages[this.state.messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            this.state.messages.pop();
        }

        const assistantMessages = this.elements.messagesContainer.querySelectorAll('.message.assistant');
        const lastAssistantEl = assistantMessages[assistantMessages.length - 1];
        if (lastAssistantEl) {
            const nextEl = lastAssistantEl.nextElementSibling;
            if (nextEl?.classList.contains('message-actions')) nextEl.remove();
            lastAssistantEl.remove();
        }

        await this.startStreaming();
        this.saveCurrentConversation();
    }

    // ============================================
    // Rendering
    // ============================================
    createAssistantBubble() {
        const messageEl = document.createElement('div');
        messageEl.className = 'message assistant';
        messageEl.innerHTML = `
            <div class="message-avatar">AI</div>
            <div class="message-content">
                <div class="message-text"></div>
                <div class="message-time">${this.getCurrentTime()}</div>
            </div>
        `;
        this.elements.messagesContainer.appendChild(messageEl);
        return messageEl;
    }

    updateAssistantBubbleStreaming(messageEl, rawContent) {
        const textEl = messageEl.querySelector('.message-text');
        textEl.innerHTML = this.formatStreamingContent(rawContent);
        this.scrollToBottom();
    }

    updateAssistantBubbleFinal(messageEl, fullContent) {
        const textEl = messageEl.querySelector('.message-text');
        textEl.innerHTML = this.renderMarkdown(fullContent);
        this.highlightCodeBlocks(textEl);
        this.addCopyCodeButtons(textEl);
        textEl.querySelectorAll('a').forEach(link => {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
        });
        this.scrollToBottom();
    }

    renderMessage(role, content, isError = false) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${role}${isError ? ' error' : ''}`;

        const avatarLetter = role === 'user' ? 'م' : 'AI';
        const time = this.getCurrentTime();
        const formattedContent = role === 'user'
            ? this.escapeHtml(content).replace(/\n/g, '<br>')
            : this.renderMarkdown(content);

        messageEl.innerHTML = `
            <div class="message-avatar">${avatarLetter}</div>
            <div class="message-content">
                <div class="message-text">${formattedContent}</div>
                <div class="message-time">${time}</div>
            </div>
        `;

        this.elements.messagesContainer.appendChild(messageEl);

        if (role === 'assistant' && !isError) {
            this.highlightCodeBlocks(messageEl);
            this.addCopyCodeButtons(messageEl);
            this.addMessageActions(messageEl);
            messageEl.querySelectorAll('a').forEach(link => {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            });
        }

        this.scrollToBottom();
        return messageEl;
    }

    renderMarkdown(content) {
        if (!content) return '';
        if (typeof marked === 'undefined') return this.escapeHtml(content).replace(/\n/g, '<br>');
        try {
            return marked.parse(content);
        } catch (e) {
            console.warn('Markdown parsing error:', e);
            return this.escapeHtml(content).replace(/\n/g, '<br>');
        }
    }

    formatStreamingContent(content) {
        let formatted = this.escapeHtml(content);
        formatted = formatted.replace(/\n/g, '<br>');
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        return formatted;
    }

    highlightCodeBlocks(container) {
        if (typeof hljs === 'undefined') return;
        container.querySelectorAll('pre code').forEach((block) => {
            if (!block.dataset.highlighted) {
                hljs.highlightElement(block);
                block.dataset.highlighted = 'true';
            }
        });
    }

    addCopyCodeButtons(container) {
        container.querySelectorAll('pre').forEach((pre) => {
            if (pre.parentElement?.classList.contains('code-block-wrapper')) return;
            if (pre.querySelector('.copy-code-btn')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            const codeEl = pre.querySelector('code');
            let lang = '';
            if (codeEl) {
                const classes = codeEl.className.split(' ');
                for (const cls of classes) {
                    if (cls.startsWith('language-')) { lang = cls.replace('language-', ''); break; }
                }
            }

            const header = document.createElement('div');
            header.className = 'code-block-header';
            header.innerHTML = `
                <span class="code-lang">${lang || 'code'}</span>
                <button class="copy-code-btn" title="نسخ الكود">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>نسخ</span>
                </button>
            `;
            wrapper.insertBefore(header, pre);
        });
    }

    addMessageActions(messageEl) {
        const existingActions = messageEl.nextElementSibling;
        if (existingActions?.classList.contains('message-actions')) return;

        const allAssistantMessages = this.elements.messagesContainer.querySelectorAll('.message.assistant');
        const isLastAssistant = messageEl === allAssistantMessages[allAssistantMessages.length - 1];
        if (!isLastAssistant) return;

        const actionsEl = document.createElement('div');
        actionsEl.className = 'message-actions';
        actionsEl.innerHTML = `
            <button class="copy-message-btn" title="نسخ الرد">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>نسخ الرد</span>
            </button>
            <button class="download-message-btn" title="تحميل الرد">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>تحميل</span>
            </button>
            <button class="regenerate-btn" title="إعادة التوليد">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                <span>إعادة توليد</span>
            </button>
        `;

        messageEl.insertAdjacentElement('afterend', actionsEl);
    }

    // ============================================
    // Copy to Clipboard
    // ============================================
    async copyToClipboard(text, buttonEl) {
        try {
            await navigator.clipboard.writeText(text);
            const originalHTML = buttonEl.innerHTML;
            buttonEl.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>تم النسخ</span>
            `;
            buttonEl.classList.add('copied');
            setTimeout(() => {
                buttonEl.innerHTML = originalHTML;
                buttonEl.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Copy failed:', err);
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                buttonEl.classList.add('copied');
                setTimeout(() => buttonEl.classList.remove('copied'), 2000);
            } catch (e) {
                console.error('Fallback copy failed:', e);
            }
            document.body.removeChild(textarea);
        }
    }

    // ============================================
    // Download (Message / Full Conversation)
    // ============================================
    downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadMessage(text) {
        const dateStr = new Date().toISOString().slice(0, 10);
        this.downloadFile(text, `رد-${dateStr}.md`);
    }

    downloadFullConversation() {
        if (this.state.messages.length === 0) return;

        const dateStr = new Date().toISOString().slice(0, 10);
        let md = `# محادثة AI Chat - ${dateStr}\n\n`;

        this.state.messages.forEach((msg) => {
            const label = msg.role === 'user' ? '## أنت' : '## المساعد';
            md += `${label}\n\n${msg.content}\n\n---\n\n`;
        });

        this.downloadFile(md, `chat-${dateStr}.md`);
    }

    // ============================================
    // Typing Indicator
    // ============================================
    showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message assistant';
        indicator.id = 'typingIndicator';
        indicator.innerHTML = `
            <div class="message-avatar">AI</div>
            <div class="message-content">
                <div class="typing-indicator"><span></span><span></span><span></span></div>
            </div>
        `;
        this.elements.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
        return indicator;
    }

    removeTypingIndicator(indicator) {
        if (indicator && indicator.parentNode) indicator.remove();
        const orphan = document.getElementById('typingIndicator');
        if (orphan) orphan.remove();
    }

    showStopButton() { this.elements.stopBtn?.classList.add('visible'); }
    hideStopButton() { this.elements.stopBtn?.classList.remove('visible'); }

    // ============================================
    // Conversations (localStorage)
    // ============================================
    loadConversations() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            this.state.conversations = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Failed to load conversations:', e);
            this.state.conversations = [];
        }
    }

    persistConversations() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state.conversations));
        } catch (e) {
            console.error('Failed to save conversations:', e);
        }
    }

    saveCurrentConversation() {
        if (this.state.messages.length === 0) return;

        if (!this.state.currentConversationId) {
            this.state.currentConversationId = 'conv_' + Date.now();
        }

        const title = this.state.messages[0]?.content?.slice(0, 30) || 'محادثة جديدة';
        const existingIndex = this.state.conversations.findIndex(c => c.id === this.state.currentConversationId);

        const conversationData = {
            id: this.state.currentConversationId,
            title,
            messages: this.state.messages,
            model: this.state.currentModel,
            updatedAt: Date.now()
        };

        if (existingIndex >= 0) {
            this.state.conversations[existingIndex] = conversationData;
        } else {
            this.state.conversations.unshift(conversationData);
        }

        this.persistConversations();
        this.renderConversationsList();
    }

    renderConversationsList() {
        const list = this.elements.conversationsList;
        const items = list.querySelectorAll('.conversation-item');
        items.forEach(el => el.remove());

        const sorted = [...this.state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);

        if (sorted.length === 0) {
            this.elements.noConversations.style.display = 'flex';
            return;
        }
        this.elements.noConversations.style.display = 'none';

        sorted.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            if (conv.id === this.state.currentConversationId) item.classList.add('active');
            item.dataset.id = conv.id;
            item.innerHTML = `
                <svg class="conv-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="conv-title">${this.escapeHtml(conv.title)}</span>
                <div class="conv-actions">
                    <button class="conv-delete-btn" title="حذف">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;
            this.elements.conversationsList.appendChild(item);
        });
    }

    openConversation(id) {
        const conv = this.state.conversations.find(c => c.id === id);
        if (!conv) return;

        if (this.state.abortController) this.state.abortController.abort();

        this.state.currentConversationId = conv.id;
        this.state.messages = [...conv.messages];
        this.state.currentModel = conv.model || this.state.currentModel;
        this.selectModel(this.state.currentModel);

        this.elements.messagesContainer.innerHTML = '';
        this.elements.welcomeScreen.style.display = 'none';
        this.elements.messagesContainer.style.display = 'flex';

        this.state.messages.forEach((msg, index) => {
            const el = this.renderMessage(msg.role, msg.content);
            if (msg.role === 'assistant' && index === this.state.messages.length - 1) {
                this.addMessageActions(el);
            }
        });

        this.renderConversationsList();
        this.closeSidebar();
    }

    deleteConversation(id) {
        if (!confirm('هل تريد حذف هذه المحادثة؟')) return;

        this.state.conversations = this.state.conversations.filter(c => c.id !== id);
        this.persistConversations();

        if (this.state.currentConversationId === id) {
            this.startNewChat();
        } else {
            this.renderConversationsList();
        }
    }

    // ============================================
    // Utility
    // ============================================
    startNewChat() {
        if (this.state.abortController) this.state.abortController.abort();

        this.state.messages = [];
        this.state.isProcessing = false;
        this.state.abortController = null;
        this.state.lastUserMessage = null;
        this.state.currentConversationId = null;

        this.elements.messagesContainer.innerHTML = '';
        this.elements.welcomeScreen.style.display = 'flex';
        this.elements.messagesContainer.style.display = 'none';

        this.updateSendButton();
        this.hideStopButton();
        this.renderConversationsList();
        this.closeSidebar();
    }

    getCurrentTime() {
        return new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.elements.messagesArea.scrollTop = this.elements.messagesArea.scrollHeight;
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});
