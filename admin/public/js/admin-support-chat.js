(() => {
  const list = document.getElementById('support-conversations');
  const messages = document.getElementById('support-messages');
  const name = document.getElementById('support-name');
  const draft = document.getElementById('support-draft');
  const send = document.getElementById('support-send');
  const error = document.getElementById('support-error');
  const form = document.getElementById('support-form');
  let selectedId = '';

  async function json(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không kết nối được máy chủ.');
    return data;
  }

  function showError(cause) { error.textContent = cause.message || 'Có lỗi xảy ra.'; }

  async function loadConversations() {
    try {
      const conversations = await json('/api/admin/support/conversations');
      list.replaceChildren();
      if (!conversations.length) list.textContent = 'Chưa có yêu cầu hỗ trợ.';
      for (const item of conversations) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'w-full text-left rounded-xl p-3 hover:bg-slate-100 dark:hover:bg-slate-800 ' +
          (item.customerId === selectedId ? 'bg-amber-100 dark:bg-amber-900' : '');
        const title = document.createElement('div');
        title.className = 'font-semibold truncate';
        title.textContent = item.name + (item.status === 'pending' ? ' · Chờ tư vấn' : '') + (item.unreadCount ? ` (${item.unreadCount})` : '');
        const preview = document.createElement('div');
        preview.className = 'text-xs text-slate-500 truncate';
        preview.textContent = item.lastMessage;
        button.append(title, preview);
        button.addEventListener('click', () => {
          selectedId = item.customerId;
          name.textContent = item.name;
          draft.disabled = send.disabled = false;
          error.textContent = '';
          void loadConversations();
          void loadMessages();
        });
        list.append(button);
      }
    } catch (cause) { showError(cause); }
  }

  async function loadMessages() {
    if (!selectedId) return;
    const customerId = selectedId;
    try {
      const result = await json(`/api/admin/support/messages/${customerId}`);
      if (customerId !== selectedId) return;
      messages.replaceChildren();
      for (const item of result.messages) {
        const bubble = document.createElement('div');
        bubble.className = 'max-w-[80%] w-fit rounded-xl p-3 text-sm whitespace-pre-wrap break-words ' +
          (item.sender === 'admin' ? 'ml-auto bg-amber-100' : 'bg-slate-100 dark:bg-slate-800');
        bubble.textContent = item.content || (item.images?.length ? 'Khách hàng đã gửi hình ảnh' : '');
        messages.append(bubble);
      }
      messages.scrollTop = messages.scrollHeight;
    } catch (cause) { showError(cause); }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const content = draft.value.trim();
    if (!selectedId || !content) return;
    send.disabled = true;
    error.textContent = '';
    try {
      await json(`/api/admin/support/messages/${selectedId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content })
      });
      draft.value = '';
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (cause) { showError(cause); }
    finally { send.disabled = false; }
  });

  void loadConversations();
  setInterval(() => { void loadConversations(); void loadMessages(); }, 10000);
})();
