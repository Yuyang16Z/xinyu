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
let activeAction = null;
let timerId = null;
let remaining = 0;
let timerRunning = false;
let lastTick = 0;
let actionStartedAt = null;
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
function currentEntries() { return (demo ? demoEntries() : entries).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function currentActions() { return demo ? [] : actions; }
function moodInfo(value) { return MOODS.find(m => m.value === Number(value)) || MOODS[2]; }
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
    mood.parentElement.querySelectorAll('[data-mood]').forEach(el => { const yes = el === mood; el.classList.toggle('selected', yes); el.setAttribute('aria-pressed', yes); });
    if (mood.parentElement.id === 'mood-options') $('entry-extra').classList.remove('hidden');
    return;
  }
  const chip = event.target.closest('[data-value]');
  if (chip) { chip.classList.toggle('selected'); chip.setAttribute('aria-pressed', chip.classList.contains('selected')); }
}
function resetForm() {
  moodButtons('mood-options'); chipButtons('feeling-tags', FEELINGS); chipButtons('event-tags', EVENTS);
  $('entry-note').value = ''; $('entry-extra').classList.add('hidden'); $('saved-panel').classList.add('hidden'); $('entry-form').classList.remove('hidden');
}
function saveEntry(event) {
  event.preventDefault();
  if (demo) { exitDemo(); return; }
  const mood = selectedMood('mood-options');
  if (!mood) { $('mood-options').focus(); alert('先选一个最接近的心情就好。'); return; }
  const note = $('entry-note').value.trim();
  const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), mood, feelings: selectedChips('feeling-tags'), events: selectedChips('event-tags'), note, createdAt: new Date().toISOString() };
  const next = [entry, ...entries];
  if (!writeStore(KEYS.entries, next)) return;
  entries = next; $('entry-form').classList.add('hidden'); $('saved-panel').classList.remove('hidden');
  updateAll();
  if (needsSupport(note)) { $('saved-care').classList.add('hidden'); $('support-dialog').showModal(); }
  else $('saved-care').classList.remove('hidden');
}
function needsSupport(text) { return /自杀|自残|结束生命|不想活|伤害自己|伤害我自己|想去死|活不下去/.test(text); }
function entryCard(entry) {
  const m = moodInfo(entry.mood);
  const tags = [...(entry.feelings || []), ...(entry.events || [])];
  return `<button class="entry-card" type="button" data-entry-id="${escapeHTML(entry.id)}"><div class="entry-top"><span class="entry-mood"><span class="face" aria-hidden="true">${m.face}</span>${m.label}</span><span class="entry-date">${escapeHTML(dateLabel(entry.createdAt))}</span></div>${entry.note ? `<p class="entry-note">${escapeHTML(entry.note)}</p>` : ''}<div class="entry-tags">${tags.map(t => `<span>${escapeHTML(t)}</span>`).join('')}</div></button>`;
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
    const matches = list.filter(e => dayKey(e.createdAt) === dayKey(d));
    const avg = matches.length ? matches.reduce((s, e) => s + Number(e.mood), 0) / matches.length : null;
    return `<div class="trend-column"><span class="trend-value">${avg === null ? '' : avg.toFixed(1).replace('.0', '')}</span><div class="trend-bar${avg === null ? ' empty' : ''}" style="height:${avg === null ? 5 : Math.round(avg * 30)}px" title="${escapeHTML(dayKey(d))}：${avg === null ? '无记录' : `平均 ${avg.toFixed(1)}`}" role="img" aria-label="${escapeHTML(dayKey(d))}：${avg === null ? '无记录' : `平均 ${avg.toFixed(1)}`}"></div><span class="trend-label">${d.getMonth() + 1}/${d.getDate()}</span></div>`;
  }).join('');
  const counts = Object.fromEntries(EVENTS.map(t => [t, 0]));
  list.forEach(e => (e.events || []).forEach(t => { if (counts[t] !== undefined) counts[t]++; }));
  const popular = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  $('trigger-list').innerHTML = popular.length ? popular.map(([tag, n]) => `<div class="trigger-row"><button type="button" data-filter="${escapeHTML(tag)}">${escapeHTML(tag)} ↗</button><span>${n} 条记录</span></div>`).join('') : '<div class="empty-state"><strong>还没有事件标签。</strong><p>你可以在下次记录时选一个；“说不清”也可以。</p></div>';
  const reflection = $('reflection-content');
  if (list.length < 3 || !popular.length) { reflection.innerHTML = '<p>再记录几次，我们可以一起回顾。这里不会猜测你尚未写下的经历。</p>'; return; }
  const [tag, n] = popular[0];
  const low = list.filter(e => e.mood <= 2);
  const lowWithTag = low.filter(e => (e.events || []).includes(tag)).length;
  let message = `你有 ${n} 条记录提到了“${tag}”。可以回看这些时刻，留意当时发生了什么。`;
  if (low.length >= 2 && lowWithTag >= 2) message = `最近 ${low.length} 条较低落的记录中，有 ${lowWithTag} 条同时标记了“${tag}”。这只是记录中的关联，可以回看看具体发生了什么。`;
  reflection.innerHTML = `<p>${escapeHTML(message)}</p><button class="text-link" type="button" data-filter="${escapeHTML(tag)}">查看相关记录 ↗</button>`;
}
function recommendedAction() { const latest = currentEntries()[0]; return latest && latest.mood >= 4 ? 'movement' : 'breathing'; }
function renderCare() {
  $('care-cards').innerHTML = Object.entries(CARE).map(([key, action]) => `<article class="care-card"><span class="care-icon" aria-hidden="true">${action.icon}</span><h2>${action.title}</h2><p>${action.description}</p><button class="button ${key === 'breathing' ? 'primary' : 'outline'}" type="button" data-action="${key}">开始 · 约 ${Math.round(action.duration / 60)} 分钟 ↗</button></article>`).join('');
  const recent = currentActions().slice().sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt)).slice(0, 5);
  $('action-history').innerHTML = recent.length ? recent.map(a => `<div class="history-row"><strong>${escapeHTML(CARE[a.type]?.short || '关怀行动')}</strong> · ${escapeHTML(a.feedback || '暂时不想回答')} <span>— ${escapeHTML(dateLabel(a.endedAt))}</span></div>`).join('') : '<p class="small-muted">还没有行动记录。任何时候开始都可以。</p>';
}
function updateAll() { renderHome(); renderJournal(); renderInsights(); renderCare(); $('demo-banner').classList.toggle('hidden', !demo); }
function showPage() {
  const page = ['now', 'journal', 'insights', 'care'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'now';
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== `page-${page}`));
  document.querySelectorAll('[data-nav]').forEach(el => { const active = el.dataset.nav === page; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
}
function go(page) { location.hash = page; showPage(); }
function openEntry(id) {
  const entry = currentEntries().find(e => e.id === id); if (!entry) return;
  editingId = id; $('edit-date').textContent = dateLabel(entry.createdAt, true);
  moodButtons('edit-moods', entry.mood); chipButtons('edit-feelings', FEELINGS, entry.feelings || []); chipButtons('edit-events', EVENTS, entry.events || []); $('edit-note').value = entry.note || '';
  $('edit-form').querySelectorAll('button[data-mood],button[data-value],textarea').forEach(el => el.disabled = demo);
  $('delete-entry').classList.toggle('hidden', demo);
  $('edit-form').querySelector('button[type="submit"]').classList.toggle('hidden', demo);
  $('entry-dialog').showModal();
}
function updateEntry(event) {
  event.preventDefault(); if (demo || !editingId) return;
  const index = entries.findIndex(e => e.id === editingId); if (index < 0) return;
  const mood = selectedMood('edit-moods'); if (!mood) return;
  const next = entries.slice(); next[index] = { ...next[index], mood, feelings: selectedChips('edit-feelings'), events: selectedChips('edit-events'), note: $('edit-note').value.trim(), updatedAt: new Date().toISOString() };
  if (!writeStore(KEYS.entries, next)) return;
  entries = next; $('entry-dialog').close(); updateAll();
  if (needsSupport(next[index].note)) $('support-dialog').showModal();
}
function deleteEntry() {
  if (demo || !editingId || !confirm('确定删除这条记录吗？删除后无法恢复。')) return;
  const next = entries.filter(e => e.id !== editingId);
  if (!writeStore(KEYS.entries, next)) return;
  entries = next; $('entry-dialog').close(); updateAll();
}
function enterDemo() { demo = true; sessionStorage.setItem(KEYS.demo, '1'); filterTag = null; resetForm(); updateAll(); go('now'); }
function exitDemo() { demo = false; sessionStorage.removeItem(KEYS.demo); filterTag = null; resetForm(); updateAll(); go('now'); }

function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; timerRunning = false; }
function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function updateTimerUI() { const el = $('timer-display'); if (el) el.textContent = formatTime(remaining); const orb = $('breath-orb'); if (orb) orb.classList.toggle('running', timerRunning && !reducedMotion); const toggle = $('timer-toggle'); if (toggle) toggle.textContent = timerRunning ? '暂停' : remaining < CARE[activeAction].duration ? '继续' : '开始'; }
function tick() { const now = Date.now(); const elapsed = Math.floor((now - lastTick) / 1000); if (elapsed < 1) return; lastTick += elapsed * 1000; remaining = Math.max(0, remaining - elapsed); updateTimerUI(); if (remaining === 0) finishAction(); }
function toggleTimer() { if (!activeAction) return; if (timerRunning) stopTimer(); else { lastTick = Date.now(); timerRunning = true; timerId = setInterval(tick, 250); } updateTimerUI(); }
function openAction(type) {
  if (!CARE[type]) return;
  stopTimer(); activeAction = type; remaining = CARE[type].duration; actionStartedAt = new Date().toISOString();
  $('action-title').textContent = CARE[type].title;
  $('action-feedback').classList.add('hidden'); $('feedback-done').classList.add('hidden'); $('feedback-options').classList.remove('hidden');
  $('action-experience').classList.remove('hidden');
  $('action-experience').innerHTML = type === 'breathing'
    ? '<p class="small-muted">按自己舒服的节奏呼吸，不必勉强跟上动画。</p><div id="breath-orb" class="breath-orb">慢慢呼吸</div><div id="timer-display" class="timer">02:00</div><div class="action-controls"><button id="timer-toggle" class="button primary" type="button">开始</button><button id="timer-end" class="button subtle" type="button">结束行动</button></div>'
    : '<p class="small-muted">选择舒服的幅度，不舒服时就停下。</p><ol class="steps"><li>缓缓站起，活动肩颈。</li><li>在房间里走几步，或轻轻伸展。</li><li>感觉脚踩在地面上，慢慢回到当下。</li></ol><div id="timer-display" class="timer">03:00</div><div class="action-controls"><button id="timer-toggle" class="button primary" type="button">开始</button><button id="timer-end" class="button subtle" type="button">结束行动</button><button id="swap-action" class="button outline" type="button">现在不方便，换一个</button></div>';
  $('action-dialog').showModal();
}
function finishAction() {
  stopTimer(); if (!activeAction) return;
  $('action-experience').classList.add('hidden'); $('action-feedback').classList.remove('hidden');
  $('feedback-options').innerHTML = ['轻松了一点', '差不多', '更不舒服', '暂时不想回答'].map(v => `<button type="button" data-feedback="${v}">${v}</button>`).join('');
}
function saveFeedback(response) {
  if (!activeAction) return;
  if (!demo) {
    const next = [{ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), type: activeAction, startedAt: actionStartedAt, endedAt: new Date().toISOString(), feedback: response }, ...actions];
    if (!writeStore(KEYS.actions, next)) return;
    actions = next;
  }
  $('feedback-options').classList.add('hidden'); $('feedback-done').classList.remove('hidden'); renderCare();
}
function closeAction() { stopTimer(); activeAction = null; $('action-dialog').close(); }

document.addEventListener('click', event => {
  if (event.target.closest('[data-mood],[data-value]')) toggleChoice(event);
  const entry = event.target.closest('[data-entry-id]'); if (entry) openEntry(entry.dataset.entryId);
  const filter = event.target.closest('[data-filter]'); if (filter) { filterTag = filter.dataset.filter; renderJournal(); go('journal'); }
  const action = event.target.closest('[data-action]'); if (action) openAction(action.dataset.action);
  if (event.target.closest('#clear-filter')) { filterTag = null; renderJournal(); }
  if (event.target.closest('#timer-toggle')) toggleTimer();
  if (event.target.closest('#timer-end')) finishAction();
  if (event.target.closest('#swap-action')) { closeAction(); openAction('breathing'); }
  const feedback = event.target.closest('[data-feedback]'); if (feedback) saveFeedback(feedback.dataset.feedback);
  if (event.target.closest('.close-dialog')) event.target.closest('dialog').close();
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { if (dialog.id === 'action-dialog') stopTimer(); }));
$('entry-form').addEventListener('submit', saveEntry);
$('edit-form').addEventListener('submit', updateEntry);
$('delete-entry').addEventListener('click', deleteEntry);
$('settings-button').addEventListener('click', () => $('settings-dialog').showModal());
$('new-entry').addEventListener('click', () => { if (demo) exitDemo(); resetForm(); go('now'); });
$('saved-care').addEventListener('click', () => openAction(recommendedAction()));
$('saved-later').addEventListener('click', resetForm);
$('enter-demo').addEventListener('click', enterDemo);
$('exit-demo').addEventListener('click', exitDemo);
$('feedback-close').addEventListener('click', closeAction);
$('reduce-motion').checked = reducedMotion;
$('reduce-motion').addEventListener('change', event => { reducedMotion = event.target.checked; localStorage.setItem(KEYS.motion, reducedMotion ? '1' : '0'); document.body.classList.toggle('reduce-motion', reducedMotion); updateTimerUI(); });
$('clear-data').addEventListener('click', () => { if (!confirm('确定清空此设备中所有心屿记录与关怀反馈吗？此操作无法恢复。')) return; if (!writeStore(KEYS.entries, []) || !writeStore(KEYS.actions, [])) return; entries = []; actions = []; filterTag = null; $('settings-dialog').close(); resetForm(); updateAll(); go('now'); });
window.addEventListener('hashchange', showPage);
document.body.classList.toggle('reduce-motion', reducedMotion);
$('today-label').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
resetForm(); updateAll(); showPage();
