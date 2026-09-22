/* 心屿首版：所有真实记录只存于当前浏览器。示例记录仅在内存中生成。 */
const KEYS = { entries: 'xinyu.entries.v1', actions: 'xinyu.actions.v1', motion: 'xinyu.reduceMotion.v1', demo: 'xinyu.demo.v1' };
const MOODS = [
  { value: 1, label: '很低落', face: '☁' },
  { value: 2, label: '不太好', face: '◡' },
  { value: 3, label: '平静', face: '◌' },
  { value: 4, label: '不错', face: '☺' },
  { value: 5, label: '很愉快', face: '✷' }
];
const FEELINGS = ['焦虑', '疲惫', '委屈', '孤独', '放松', '期待', '满足'];
const EVENTS = ['学业', '工作', '求职', '人际', '家庭', '身体状态', '日常生活', '说不清'];
const CARE = {
  breathing: { title: '慢慢呼吸两分钟', short: '呼吸跟随', icon: '◌', duration: 120, description: '跟着温和的节奏，把注意力放回当下。不必勉强跟上动画。' },
  movement: { title: '活动一下', short: '轻轻活动', icon: '✳', duration: 180, description: '起身、舒展、走几步。按自己舒服的方式来，随时可以停下。' }
};
const $ = (id) => document.getElementById(id);
let entries = readStore(KEYS.entries, []);
let actions = readStore(KEYS.actions, []);
let demo = sessionStorage.getItem(KEYS.demo) === '1';
let filterTag = null;
let editingId = null;
let lastSavedEntryId = null;
let activeAction = null;
let activeEntryId = null;
let timerId = null;
let remaining = 0;
let timerRunning = false;
let lastTick = 0;
let actionStartedAt = null;
let actionHasStarted = false;
let reducedMotion = localStorage.getItem(KEYS.motion) === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;

function readStore(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; }
  catch { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { alert('浏览器未能保存记录。请检查浏览器存储设置或可用空间。'); return false; }
}
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function dayKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function relativeDay(offset) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - offset); return d.toISOString(); }
function demoEntries() { return [
  { id: 'demo-1', mood: 2, feelings: ['焦虑', '疲惫'], events: ['求职'], note: '等面试反馈的时候，总忍不住反复看邮箱。', createdAt: relativeDay(0) },
  { id: 'demo-2', mood: 3, feelings: ['期待'], events: ['求职'], note: '准备了明天的面试，还是有些紧张。', createdAt: relativeDay(1) },
  { id: 'demo-3', mood: 4, feelings: ['放松'], events: ['日常生活'], note: '傍晚散步，给自己留了半小时。', createdAt: relativeDay(2) },
  { id: 'demo-4', mood: 2, feelings: ['焦虑'], events: ['求职'], note: '投完简历后有点担心自己做得不够。', createdAt: relativeDay(4) },
  { id: 'demo-5', mood: 3, feelings: ['疲惫'], events: ['学业'], note: '事情有点多，决定先做一件。', createdAt: relativeDay(6) }
]; }
function demoActions() { return [
  { id: 'demo-action-1', entryId: 'demo-1', type: 'breathing', afterMood: 2, feedback: '差不多', endedAt: relativeDay(0) },
  { id: 'demo-action-2', entryId: 'demo-3', type: 'movement', afterMood: 5, feedback: '轻松了一点', endedAt: relativeDay(2) }
]; }
function currentEntries() { return (demo ? demoEntries() : entries).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function currentActions() { return demo ? demoActions() : actions; }
function moodInfo(value) { return MOODS.find(m => m.value === Number(value)) || { value: null, label: '未选心情', face: '·' }; }
function dateLabel(date, long = false) { return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: long ? 'long' : undefined, hour: long ? '2-digit' : undefined, minute: long ? '2-digit' : undefined }).format(new Date(date)); }

function moodButtons(container, selected = null) {
  $(container).innerHTML = MOODS.map(m => `<button class="mood-option${m.value === selected ? ' selected' : ''}" type="button" data-mood="${m.value}" aria-pressed="${m.value === selected}"><span class="face" aria-hidden="true">${m.face}</span><span>${m.label}</span></button>`).join('');
}
function chipButtons(container, values, selected = []) {
  $(container).innerHTML = values.map(v => `<button class="chip${selected.includes(v) ? ' selected' : ''}" type="button" data-value="${escapeHTML(v)}" aria-pressed="${selected.includes(v)}">${escapeHTML(v)}</button>`).join('');
}
function selectedMood(container) { return Number($(container).querySelector('.mood-option.selected')?.dataset.mood || 0); }
function selectedChips(container) { return [...$(container).querySelectorAll('.chip.selected')].map(el => el.dataset.value); }
function toggleChoice(event) {
  const mood = event.target.closest('[data-mood]');
  if (mood) {
    const wasSelected = mood.classList.contains('selected');
    mood.parentElement.querySelectorAll('[data-mood]').forEach(el => { const yes = el === mood && !wasSelected; el.classList.toggle('selected', yes); el.setAttribute('aria-pressed', yes); });
    if (mood.parentElement.id === 'mood-options') { $('entry-extra').classList.remove('hidden'); $('skip-mood').classList.add('hidden'); }
    return;
  }
  const chip = event.target.closest('[data-value]');
  if (chip) { chip.classList.toggle('selected'); chip.setAttribute('aria-pressed', chip.classList.contains('selected')); }
}
function resetForm() {
  lastSavedEntryId = null;
  moodButtons('mood-options'); chipButtons('feeling-tags', FEELINGS); chipButtons('event-tags', EVENTS);
  $('entry-note').value = ''; $('entry-extra').classList.add('hidden'); $('skip-mood').classList.remove('hidden'); $('saved-panel').classList.add('hidden'); $('entry-form').classList.remove('hidden');
}
function saveEntry(event) {
  event.preventDefault();
  if (demo) { exitDemo(); return; }
  const mood = selectedMood('mood-options') || null;
  const note = $('entry-note').value.trim();
  const feelings = selectedChips('feeling-tags');
  const events = selectedChips('event-tags');
  if (!mood && !note && !feelings.length && !events.length) { alert('选一种心情、一个标签，或写一句话就可以保存。'); return; }
  const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), mood, feelings, events, note, createdAt: new Date().toISOString() };
  const next = [entry, ...entries];
  if (!writeStore(KEYS.entries, next)) return;
  entries = next; lastSavedEntryId = entry.id; $('entry-form').classList.add('hidden'); $('saved-panel').classList.remove('hidden');
  updateAll();
  if (needsSupport(note)) { $('saved-care').classList.add('hidden'); $('support-dialog').showModal(); }
  else $('saved-care').classList.remove('hidden');
}
function needsSupport(text) { return /(想|要|准备|打算|计划)(自杀|自残|伤害自己|伤害我自己|结束生命|去死)|不想活了|不想活下去|不想再活|活不下去/.test(text); }
function entryCard(entry) {
  const m = moodInfo(entry.mood);
  const tags = [...(entry.feelings || []), ...(entry.events || [])];
  const latestAction = currentActions().filter(action => action.entryId === entry.id).sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0];
  const care = latestAction ? `<div class="entry-care-teaser">✳ ${escapeHTML(CARE[latestAction.type]?.short || '关怀行动')} · ${escapeHTML(latestAction.feedback || '暂时不想回答')}${moodJourney(latestAction) ? ` · ${escapeHTML(moodJourney(latestAction))}` : ''}</div>` : '';
  return `<button class="entry-card" type="button" data-entry-id="${escapeHTML(entry.id)}"><div class="entry-top"><span class="entry-mood"><span class="face" aria-hidden="true">${m.face}</span>${m.label}</span><span class="entry-date">${escapeHTML(dateLabel(entry.createdAt))}</span></div>${entry.note ? `<p class="entry-note">${escapeHTML(entry.note)}</p>` : ''}<div class="entry-tags">${tags.map(t => `<span>${escapeHTML(t)}</span>`).join('')}</div>${care}</button>`;
}
function renderHome() {
  const list = currentEntries();
  $('home-recent').innerHTML = list.length ? list.slice(0, 2).map(entryCard).join('') : '<div class="empty-state"><strong>这里还没有记录。</strong><p>不需要特别的一天，普通的此刻也值得留下。</p></div>';
  const days = lastSevenDays();
  $('home-week').innerHTML = days.map((d, i) => { const count = list.filter(e => dayKey(e.createdAt) === dayKey(d)).length; return `<div class="week-day">${'日一二三四五六'[d.getDay()]}<div class="week-dot${count ? ' filled' : ''}" aria-label="${count ? `${count}条记录` : '无记录'}">${count ? '●' : '·'}</div></div>`; }).join('');
  $('week-caption').textContent = `最近 7 天留下了 ${list.filter(e => days.some(d => dayKey(d) === dayKey(e.createdAt))).length} 条记录。`;
  $('demo-invite').classList.toggle('hidden', demo);
  const recommendation = recommendedAction();
  $('preview-title').textContent = CARE[recommendation].title;
  $('preview-description').textContent = CARE[recommendation].description;
  $('preview-action').dataset.action = recommendation;
}
function renderJournal() {
  const list = currentEntries().filter(e => !filterTag || (e.events || []).includes(filterTag));
  $('journal-count').textContent = `你的记录 · ${list.length}`;
  $('journal-list').innerHTML = list.length ? list.map(entryCard).join('') : `<div class="empty-state"><strong>${filterTag ? '这个标签下还没有记录。' : '这里还没有记录。'}</strong><p>不需要特别的一天，普通的此刻也值得留下。</p></div>`;
  $('journal-filter').classList.toggle('hidden', !filterTag);
  $('journal-filter').innerHTML = filterTag ? `正在查看与“${escapeHTML(filterTag)}”有关的记录 <button type="button" id="clear-filter">清除筛选</button>` : '';
}
function lastSevenDays() { return Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 6 + i); return d; }); }
function renderInsights() {
  const list = currentEntries();
  $('trend-chart').innerHTML = lastSevenDays().map(d => {
    const dayEntries = list.filter(e => dayKey(e.createdAt) === dayKey(d));
    const matches = dayEntries.filter(e => MOODS.some(m => m.value === Number(e.mood)));
    const avg = matches.length ? matches.reduce((s, e) => s + Number(e.mood), 0) / matches.length : null;
    const description = avg === null ? dayEntries.length ? '未选择心情' : '无记录' : `平均 ${avg.toFixed(1)}`;
    return `<div class="trend-column"><span class="trend-value">${avg === null ? '' : avg.toFixed(1).replace('.0', '')}</span><div class="trend-bar${avg === null ? ' empty' : ''}" style="height:${avg === null ? 5 : Math.round(avg * 30)}px" title="${escapeHTML(dayKey(d))}：${description}" role="img" aria-label="${escapeHTML(dayKey(d))}：${description}"></div><span class="trend-label">${d.getMonth() + 1}/${d.getDate()}</span></div>`;
  }).join('');
  const counts = Object.fromEntries(EVENTS.map(t => [t, 0]));
  list.forEach(e => (e.events || []).forEach(t => { if (counts[t] !== undefined) counts[t]++; }));
  const popular = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  $('trigger-list').innerHTML = popular.length ? popular.map(([tag, n]) => `<div class="trigger-row"><button type="button" data-filter="${escapeHTML(tag)}">${escapeHTML(tag)} ↗</button><span>${n} 条记录</span></div>`).join('') : '<div class="empty-state"><strong>还没有事件标签。</strong><p>你可以在下次记录时选一个；“说不清”也可以。</p></div>';
  const reflection = $('reflection-content');
  if (list.length < 3 || !popular.length) { reflection.innerHTML = '<p>再记录几次，我们可以一起回顾。这里不会猜测你尚未写下的经历。</p>'; return; }
  const [tag, n] = popular[0];
  const low = list.filter(e => Number(e.mood) >= 1 && Number(e.mood) <= 2);
  const lowWithTag = low.filter(e => (e.events || []).includes(tag)).length;
  let message = `你有 ${n} 条记录提到了“${tag}”。可以回看这些时刻，留意当时发生了什么。`;
  if (low.length >= 2 && lowWithTag >= 2) message = `最近 ${low.length} 条较低落的记录中，有 ${lowWithTag} 条同时标记了“${tag}”。这只是记录中的关联，可以回看看具体发生了什么。`;
  reflection.innerHTML = `<p>${escapeHTML(message)}</p><button class="text-link" type="button" data-filter="${escapeHTML(tag)}">查看相关记录 ↗</button>`;
}
function recommendedAction(entry = currentEntries()[0]) { return entry && entry.mood >= 4 ? 'movement' : 'breathing'; }
function moodJourney(action) {
  const before = Number(action.beforeMood) || null;
  const after = Number(action.afterMood) || null;
  if (before && after) return `${moodInfo(before).label} → ${moodInfo(after).label}`;
  if (after) return `行动后：${moodInfo(after).label}`;
  if (before) return `行动前：${moodInfo(before).label}`;
  return '';
}
function actionSummary(action) {
  const journey = moodJourney(action);
  return `<strong>${escapeHTML(CARE[action.type]?.short || '关怀行动')}</strong> · ${escapeHTML(action.feedback || '暂时不想回答')}${journey ? ` <span class="mood-journey">${escapeHTML(journey)}</span>` : ''} <span class="history-date">— ${escapeHTML(dateLabel(action.endedAt))}</span>`;
}
function renderCare() {
  $('care-cards').innerHTML = Object.entries(CARE).map(([key, action]) => `<article class="care-card"><span class="care-icon" aria-hidden="true">${action.icon}</span><h2>${action.title}</h2><p>${action.description}</p><button class="button ${key === 'breathing' ? 'primary' : 'outline'}" type="button" data-action="${key}">开始 · 约 ${Math.round(action.duration / 60)} 分钟 ↗</button></article>`).join('');
  const recent = currentActions().slice().sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt)).slice(0, 5);
  $('action-history').innerHTML = recent.length ? recent.map(a => {
    const entry = currentEntries().find(e => e.id === a.entryId);
    return `<div class="history-row">${actionSummary(a)}${entry ? ` <button class="history-entry-link" type="button" data-entry-id="${escapeHTML(entry.id)}">查看关联日记 ↗</button>` : ''}</div>`;
  }).join('') : '<p class="small-muted">还没有行动记录。任何时候开始都可以。</p>';
}
function updateAll() { renderHome(); renderJournal(); renderInsights(); renderCare(); $('demo-banner').classList.toggle('hidden', !demo); }
function showPage() {
  const page = ['now', 'journal', 'insights', 'care'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'now';
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== `page-${page}`));
  document.querySelectorAll('[data-nav]').forEach(el => { const active = el.dataset.nav === page; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
}
function go(page) { location.hash = page; showPage(); }
function renderEntryActions(entry) {
  const linked = currentActions().filter(action => action.entryId === entry.id).slice().sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
  $('entry-actions').innerHTML = linked.length
    ? linked.map(action => `<div class="entry-action-row">${actionSummary(action)}</div>`).join('')
    : '<p class="small-muted">这条记录还没有关联的关怀行动。</p>';
  $('entry-start-care').dataset.entryAction = recommendedAction(entry);
}
function openEntry(id) {
  const entry = currentEntries().find(e => e.id === id); if (!entry) return;
  editingId = id; $('edit-date').textContent = dateLabel(entry.createdAt, true);
  moodButtons('edit-moods', entry.mood); chipButtons('edit-feelings', FEELINGS, entry.feelings || []); chipButtons('edit-events', EVENTS, entry.events || []); $('edit-note').value = entry.note || '';
  renderEntryActions(entry);
  $('edit-form').querySelectorAll('button[data-mood],button[data-value],textarea').forEach(el => el.disabled = demo);
  $('delete-entry').classList.toggle('hidden', demo);
  $('edit-form').querySelector('button[type="submit"]').classList.toggle('hidden', demo);
  $('entry-dialog').showModal();
}
function updateEntry(event) {
  event.preventDefault(); if (demo || !editingId) return;
  const index = entries.findIndex(e => e.id === editingId); if (index < 0) return;
  const mood = selectedMood('edit-moods') || null;
  const feelings = selectedChips('edit-feelings');
  const events = selectedChips('edit-events');
  const note = $('edit-note').value.trim();
  if (!mood && !note && !feelings.length && !events.length) { alert('请至少留下一个心情、标签或一句话。'); return; }
  const next = entries.slice(); next[index] = { ...next[index], mood, feelings, events, note, updatedAt: new Date().toISOString() };
  if (!writeStore(KEYS.entries, next)) return;
  entries = next; $('entry-dialog').close(); updateAll();
  if (needsSupport(next[index].note)) $('support-dialog').showModal();
}
function deleteEntry() {
  if (demo || !editingId) return;
  const related = actions.filter(action => action.entryId === editingId).length;
  if (!confirm(related ? `确定删除这条记录及关联的 ${related} 条关怀反馈吗？删除后无法恢复。` : '确定删除这条记录吗？删除后无法恢复。')) return;
  const next = entries.filter(e => e.id !== editingId);
  const remainingActions = actions.filter(action => action.entryId !== editingId);
  if (related && !writeStore(KEYS.actions, remainingActions)) return;
  if (!writeStore(KEYS.entries, next)) { if (related) writeStore(KEYS.actions, actions); return; }
  entries = next; actions = remainingActions; $('entry-dialog').close(); updateAll();
}
function enterDemo() { demo = true; sessionStorage.setItem(KEYS.demo, '1'); filterTag = null; resetForm(); updateAll(); go('now'); }
function exitDemo() { demo = false; sessionStorage.removeItem(KEYS.demo); filterTag = null; resetForm(); updateAll(); go('now'); }

function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; timerRunning = false; }
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function updateTimerUI() { if (!activeAction) return; const el = $('timer-display'); if (el) el.textContent = formatTime(remaining); const orb = $('breath-orb'); if (orb) { orb.classList.toggle('running', actionHasStarted && !reducedMotion); orb.classList.toggle('paused', actionHasStarted && !timerRunning); } const toggle = $('timer-toggle'); if (toggle) toggle.textContent = timerRunning ? '暂停' : remaining < CARE[activeAction].duration ? '继续' : '开始'; }
function tick() { const now = Date.now(); const elapsed = Math.floor((now - lastTick) / 1000); if (elapsed < 1) return; lastTick += elapsed * 1000; remaining = Math.max(0, remaining - elapsed); updateTimerUI(); if (remaining === 0) finishAction(); }
function toggleTimer() {
  if (!activeAction) return;
  if (timerRunning) stopTimer();
  else {
    if (!actionHasStarted) {
      actionStartedAt = new Date().toISOString(); actionHasStarted = true;
      $('action-link-toggle')?.classList.add('hidden');
      $('action-link-picker')?.classList.add('hidden');
      if (!activeEntryId) $('action-link')?.classList.add('hidden');
    }
    lastTick = Date.now(); timerRunning = true; timerId = setInterval(tick, 250);
  }
  updateTimerUI();
}
function openAction(type, entryId = null) {
  if (!CARE[type]) return;
  stopTimer(); activeAction = type; remaining = CARE[type].duration; actionStartedAt = null; actionHasStarted = false;
  const allEntries = currentEntries();
  const linkedEntry = allEntries.find(entry => entry.id === entryId);
  activeEntryId = linkedEntry?.id || null;
  const choices = [...(linkedEntry ? [linkedEntry] : []), ...allEntries.filter(entry => entry.id !== linkedEntry?.id).slice(0, 9)];
  const context = choices.length ? `<div id="action-link" class="action-link"><span id="action-link-summary">${linkedEntry ? escapeHTML(actionLinkLabel(linkedEntry)) : ''}</span><button id="action-link-toggle" type="button">${linkedEntry ? '更换' : '＋ 关联日记'}</button><div id="action-link-picker" class="hidden"><label class="sr-only" for="action-entry">选择关联日记</label><select id="action-entry"><option value="">不关联日记</option>${choices.map(entry => `<option value="${escapeHTML(entry.id)}"${entry.id === activeEntryId ? ' selected' : ''}>${escapeHTML(dateLabel(entry.createdAt))} · ${escapeHTML(entry.note?.slice(0, 18) || moodInfo(entry.mood).label)}</option>`).join('')}</select></div></div>` : '';
  $('action-title').textContent = CARE[type].title;
  $('action-feedback').classList.add('hidden'); $('after-rating').classList.remove('hidden'); $('feedback-done').classList.add('hidden'); $('feedback-options').classList.remove('hidden');
  $('action-experience').classList.remove('hidden');
  $('action-experience').innerHTML = type === 'breathing'
    ? `${context}<p class="small-muted">按自己舒服的节奏呼吸，不必勉强跟上动画。</p><div id="breath-orb" class="breath-orb">慢慢呼吸</div><div id="timer-display" class="timer">02:00</div><div class="action-controls"><button id="timer-toggle" class="button primary" type="button">开始</button><button id="timer-end" class="button subtle" type="button">结束行动</button></div>`
    : `${context}<p class="small-muted">不舒服时就停下。</p><ol class="steps"><li>起身，活动肩颈。</li><li>走几步，或轻轻伸展。</li><li>感觉脚踩在地面上。</li></ol><div id="timer-display" class="timer">03:00</div><div class="action-controls"><button id="timer-toggle" class="button primary" type="button">开始</button><button id="timer-end" class="button subtle" type="button">结束行动</button><button id="swap-action" class="button outline" type="button">换一个</button></div>`;
  $('action-dialog').showModal();
}
function actionLinkLabel(entry) { return `已关联 ${dateLabel(entry.createdAt)}${entry.note ? ` · ${entry.note.slice(0, 10)}` : ''}`; }
function finishAction() {
  stopTimer(); if (!activeAction) return;
  if (!actionHasStarted) { closeAction(); return; }
  $('action-experience').classList.add('hidden'); $('action-feedback').classList.remove('hidden');
  moodButtons('after-moods');
  $('feedback-options').innerHTML = ['轻松了一点', '差不多', '更不舒服', '暂时不想回答'].map(v => `<button type="button" data-feedback="${v}">${v}</button>`).join('');
}
function saveFeedback(response) {
  if (!activeAction) return;
  if (!demo) {
    const next = [{ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type: activeAction, entryId: activeEntryId, startedAt: actionStartedAt, endedAt: new Date().toISOString(), afterMood: selectedMood('after-moods') || null, feedback: response }, ...actions];
    if (!writeStore(KEYS.actions, next)) return;
    actions = next;
  }
  $('feedback-options').classList.add('hidden'); $('after-rating').classList.add('hidden'); $('feedback-done').classList.remove('hidden');
  $('feedback-done-message').textContent = demo ? '这是示例体验，反馈不会保存。' : activeEntryId ? '已记录在这条日记中。任何变化都值得如实留下。' : '已记录在关怀页。谢谢你照顾了此刻的自己。';
  $('feedback-view-entry').classList.toggle('hidden', demo || !activeEntryId);
  updateAll();
}
function closeAction() { stopTimer(); activeAction = null; activeEntryId = null; actionHasStarted = false; $('action-dialog').close(); }

document.addEventListener('click', event => {
  if (event.target.closest('[data-mood],[data-value]')) toggleChoice(event);
  const entry = event.target.closest('[data-entry-id]'); if (entry) openEntry(entry.dataset.entryId);
  const filter = event.target.closest('[data-filter]'); if (filter) { filterTag = filter.dataset.filter; renderJournal(); go('journal'); }
  const action = event.target.closest('[data-action]'); if (action) openAction(action.dataset.action);
  const entryAction = event.target.closest('[data-entry-action]');
  if (entryAction) { const id = editingId; $('entry-dialog').close(); openAction(entryAction.dataset.entryAction, id); }
  if (event.target.closest('#action-link-toggle')) { $('action-link-picker').classList.toggle('hidden'); }
  if (event.target.closest('#clear-filter')) { filterTag = null; renderJournal(); }
  if (event.target.closest('#timer-toggle')) toggleTimer();
  if (event.target.closest('#timer-end')) finishAction();
  if (event.target.closest('#swap-action')) { const id = activeEntryId; closeAction(); openAction('breathing', id); }
  const feedback = event.target.closest('[data-feedback]'); if (feedback) saveFeedback(feedback.dataset.feedback);
  if (event.target.closest('.close-dialog')) event.target.closest('dialog').close();
});
document.addEventListener('change', event => {
  if (event.target.id !== 'action-entry') return;
  activeEntryId = event.target.value || null;
  const entry = currentEntries().find(item => item.id === activeEntryId);
  $('action-link-summary').textContent = entry ? actionLinkLabel(entry) : '';
  $('action-link-toggle').textContent = entry ? '更换' : '＋ 关联日记';
  $('action-link-picker').classList.add('hidden');
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { if (dialog.id === 'action-dialog') { stopTimer(); activeAction = null; activeEntryId = null; actionHasStarted = false; } }));
$('entry-form').addEventListener('submit', saveEntry);
$('edit-form').addEventListener('submit', updateEntry);
$('delete-entry').addEventListener('click', deleteEntry);
$('settings-button').addEventListener('click', () => $('settings-dialog').showModal());
$('new-entry').addEventListener('click', () => { if (demo) exitDemo(); resetForm(); go('now'); });
$('skip-mood').addEventListener('click', () => { $('entry-extra').classList.remove('hidden'); $('skip-mood').classList.add('hidden'); $('entry-note').focus(); });
$('saved-care').addEventListener('click', () => { const entry = entries.find(item => item.id === lastSavedEntryId); openAction(recommendedAction(entry), entry?.id || null); });
$('saved-later').addEventListener('click', resetForm);
$('enter-demo').addEventListener('click', enterDemo);
$('exit-demo').addEventListener('click', exitDemo);
$('feedback-close').addEventListener('click', closeAction);
$('feedback-view-entry').addEventListener('click', () => { const id = activeEntryId; closeAction(); go('journal'); openEntry(id); });
$('reduce-motion').checked = reducedMotion;
$('reduce-motion').addEventListener('change', event => { reducedMotion = event.target.checked; localStorage.setItem(KEYS.motion, reducedMotion ? '1' : '0'); document.body.classList.toggle('reduce-motion', reducedMotion); updateTimerUI(); });
$('clear-data').addEventListener('click', () => { if (!confirm('确定清空此设备中所有心屿记录与关怀反馈吗？此操作无法恢复。')) return; if (!writeStore(KEYS.entries, []) || !writeStore(KEYS.actions, [])) return; entries = []; actions = []; filterTag = null; $('settings-dialog').close(); resetForm(); updateAll(); go('now'); });
window.addEventListener('hashchange', showPage);
document.body.classList.toggle('reduce-motion', reducedMotion);
$('today-label').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
resetForm(); updateAll(); showPage();
