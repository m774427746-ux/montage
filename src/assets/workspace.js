// Shared team presets and session-only comparison snapshots. No credentials are stored here.
(() => {
  const tools = { sheets: 'sh', stickers: 'st', acrylic: 'ac' };
  let favorites = [];
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const button = (text, fn) => { const b = el('button', text, 'btn'); b.type = 'button'; b.addEventListener('click', fn); return b; };
  async function request(method = 'GET', body) {
    const r = await fetch('/api/favorites', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || (r.status === 401 ? 'انتهت الجلسة. سجّل الدخول مجددًا.' : 'تعذّر حفظ المفضلة. حاول مرة أخرى.'));
    return data;
  }
  const views = [];
  for (const [tab, prefix] of Object.entries(tools)) {
    const root = document.getElementById('tab-' + tab);
    const side = root.querySelector('.side');
    const main = root.querySelector('.main');
    const fields = () => [...side.querySelectorAll('input[id],select[id]')].filter(n => n.id !== prefix + '-favorite-name' && n.id !== 'sale-search');
    const segments = () => [...side.querySelectorAll('.seg[id]')];
    const capture = () => {
      const data = Object.fromEntries(fields().map(n => [n.id, n.type === 'checkbox' ? n.checked : n.value]));
      for (const group of segments()) data[group.id] = group.querySelector('[aria-pressed="true"]')?.dataset.v;
      return data;
    };
    function restore(data) {
      for (const group of segments()) {
        const b = [...group.querySelectorAll('button')].find(n => n.dataset.v === data[group.id]);
        if (b) b.click();
      }
      for (const n of fields()) {
        if (!(n.id in data)) continue;
        if (n.type === 'checkbox') n.checked = data[n.id] === true;
        else if (n.tagName !== 'SELECT' || [...n.options].some(o => o.value === data[n.id])) n.value = data[n.id];
      }
      // Material selection refreshes its reference price; reapply a saved per-job rate afterwards.
      const material = document.getElementById('sale-material');
      if (tab === 'acrylic') { material.dispatchEvent(new Event('change', { bubbles: true })); if ('sale-rate' in data) document.getElementById('sale-rate').value = data['sale-rate']; }
      fields()[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
    const box = el('section', undefined, 'saved-workspace');
    box.setAttribute('aria-label', 'المقاسات المفضلة');
    box.append(el('h3', 'المقاسات المفضلة'), el('p', 'محفوظة للفريق ومشتركة بين الأجهزة.', 'hint'));
    const label = el('label', 'اسم المقاس');
    const name = el('input'); name.id = prefix + '-favorite-name'; name.maxLength = 60; name.placeholder = 'مثال: بطاقات العميل'; label.htmlFor = name.id;
    const status = el('p'); status.setAttribute('role', 'status');
    const list = el('div', undefined, 'favorite-list');
    const valid = () => !document.getElementById(prefix + '-dl').disabled;
    const save = button('حفظ المقاس الحالي', async () => {
      if (!valid()) { status.textContent = 'صحّح المدخلات قبل الحفظ.'; return; }
      if (!name.value.trim()) { status.textContent = 'اكتب اسمًا للمقاس.'; name.focus(); return; }
      save.disabled = true;
      try {
        const data = await request('POST', { id: crypto.randomUUID(), tab, name: name.value.trim(), fields: capture() });
        favorites.push(data.item); views.forEach(v => v.render()); status.textContent = 'تم الحفظ للفريق.'; name.value = '';
      } catch (e) { status.textContent = e.message; }
      finally { save.disabled = false; }
    });
    const refresh = button('تحديث المفضلة', () => load());
    box.append(label, name, save, refresh, status, list); side.append(box);
    function render() {
      list.replaceChildren();
      const items = favorites.filter(x => x.tab === tab);
      if (!items.length) list.append(el('p', 'لا توجد مقاسات محفوظة بعد.', 'hint'));
      for (const item of items) {
        const row = el('div', undefined, 'favorite-row');
        const remove = button('حذف', async () => {
          if (!confirm('حذف هذا المقاس من مفضلة الفريق؟')) return;
          remove.disabled = true;
          try { await request('DELETE', { id: item.id }); favorites = favorites.filter(x => x.id !== item.id); views.forEach(v => v.render()); status.textContent = 'تم الحذف.'; }
          catch (e) { status.textContent = e.message; remove.disabled = false; }
        });
        remove.setAttribute('aria-label', 'حذف ' + item.name);
        row.append(button(item.name, () => { restore(item.fields); status.textContent = 'تم تطبيق المقاس.'; }), remove); list.append(row);
      }
    }
    views.push({ render, status });

    const comparison = el('section', undefined, 'saved-workspace');
    comparison.setAttribute('aria-label', 'مقارنة التوزيع');
    comparison.append(el('h3', 'مقارنة التوزيع'), el('p', 'ثبّت النتيجة ثم غيّر المقاس أو الاتجاه وأضف توزيعًا آخر. حتى 3 توزيعات؛ المقارنة مؤقتة لهذه الصفحة. راجع الكمية والسعر في كل توزيع.', 'hint'));
    const notice = el('p'); notice.setAttribute('role', 'status');
    const cards = el('div', undefined, 'distribution-cards');
    let count = 0;
    const add = button('إضافة التوزيع الحالي للمقارنة', () => {
      if (!valid()) { notice.textContent = 'صحّح المدخلات قبل المقارنة.'; return; }
      if (count >= 3) { notice.textContent = 'يمكن مقارنة ثلاثة توزيعات. احذف أحدها لإضافة آخر.'; return; }
      count++;
      const card = el('article', undefined, 'distribution-card');
      const state = capture();
      card.append(el('h4', document.getElementById(prefix + '-cap').textContent));
      const summary = el('dl');
      for (const group of segments()) summary.append(el('dt', group.getAttribute('aria-label') || 'الخيار'), el('dd', group.querySelector('[aria-pressed="true"]')?.textContent || ''));
      for (const n of fields().filter(n => !n.closest('[hidden]') && !n.disabled)) {
        const caption = root.querySelector('label[for="' + n.id + '"]')?.textContent;
        if (!caption) continue;
        const value = n.type === 'checkbox' ? (n.checked ? 'نعم' : 'لا') : n.tagName === 'SELECT' ? n.selectedOptions[0]?.textContent : n.value || 'غير محدد';
        summary.append(el('dt', caption), el('dd', value));
      }
      card.append(summary);
      // Cloned output is generated by our calculator, never by stored user content.
      for (const suffix of ['kpis', 'stage']) {
        const clone = document.getElementById(prefix + '-' + suffix).cloneNode(true);
        clone.removeAttribute('id'); clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        card.append(clone);
      }
      card.append(button('تطبيق هذا التوزيع', () => restore(state)), button('إزالة من المقارنة', () => { card.remove(); count--; notice.textContent = ''; }));
      cards.append(card); notice.textContent = 'أُضيف التوزيع. يمكنك تعديل المدخلات لإضافة بديل.';
    });
    comparison.append(add, notice, cards); main.append(comparison);
  }
  async function load() {
    views.forEach(v => { v.status.textContent = 'جارٍ تحميل المفضلة…'; });
    try { favorites = (await request()).items; views.forEach(v => { v.render(); v.status.textContent = ''; }); }
    catch (e) { views.forEach(v => { v.status.textContent = e.message; }); }
  }
  load();
})();
