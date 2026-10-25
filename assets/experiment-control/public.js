'use strict';
const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const active = new Set(['running','starting','stopping','queued','retry_wait']);
let current = null;
let config = null;
let detailId = null;
const date = value => value ? new Date(value * 1000).toLocaleString() : '—';
const number = value => Number.isFinite(value) ? value.toLocaleString() : '—';
const eta = value => Number.isFinite(value) ? `~${Math.max(1, Math.ceil(value / 60))} min left` : 'ETA unknown';
const badge = state => `<span class="badge ${esc(state)}">${esc(state)}</span>`;
const latest = experiment => experiment.attempts.at(-1);
const groupName = id => current.groups.find(g => g.id === id)?.name ?? id;
const progressText = progress => progress ? `${number(progress.completed)} / ${number(progress.total)}` : 'Waiting for progress';
function lossText(progress) {
  const metrics = progress?.metrics ?? {};
  const loss = metrics['train/loss'] ?? metrics.loss;
  return Number.isFinite(loss) ? loss.toFixed(6) : '—';
}
function safeSwanLab(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'swanlab.cn' ? parsed.href : null; }
  catch { return null; }
}
function trackingLink(attempt) {
  const url = safeSwanLab(attempt?.swanlab_url);
  return url ? `<a href="${esc(url)}" rel="noopener" target="_blank">SwanLab ↗</a>` : '—';
}
function renderQueue() {
  if (!current) return;
  const group = byId('group-filter').value;
  const filter = byId('state-filter').value;
  const experiments = current.experiments.filter(e => (!group || e.group_id === group) &&
    (!filter || (filter === 'active' ? active.has(e.state) : e.state === filter)));
  byId('experiments').innerHTML = experiments.map(e => `<tr>
    <td><button class="name-button" data-detail="${esc(e.id)}">${esc(e.name)}</button><small>${esc(e.id)}</small></td>
    <td>${esc(groupName(e.group_id))}</td><td>${badge(e.state)}</td>
    <td class="progress-cell">${esc(progressText(e.progress))}<small>${active.has(e.state) ? esc(eta(e.eta_seconds)) : ''}</small></td>
    <td>${lossText(e.progress)}</td><td>${number(e.attempt_count)}</td><td>${trackingLink(latest(e))}</td></tr>`).join('');
  byId('queue-empty').hidden = experiments.length > 0;
}
function renderDetails() {
  if (!detailId || !current) return;
  const e = current.experiments.find(item => item.id === detailId);
  if (!e) return;
  byId('detail-title').textContent = e.name;
  byId('detail-body').innerHTML = `<dl class="detail-grid"><dt>Group</dt><dd>${esc(groupName(e.group_id))}</dd>
    <dt>State</dt><dd>${badge(e.state)}</dd><dt>Progress</dt><dd>${esc(progressText(e.progress))}</dd>
    <dt>Latest loss</dt><dd>${lossText(e.progress)}</dd></dl><h3>Attempt history</h3>` + e.attempts.map(a =>
    `<div class="attempt">Attempt ${number(a.number)} / GPU ${esc(a.gpus.join(', '))} / ${badge(a.state)}
    <p class="muted">Started ${esc(date(a.started))}${a.ended ? ` / Ended ${esc(date(a.ended))}` : ''}</p>
    <p>${trackingLink(a)}</p></div>`).join('');
}
function renderStatus(value) {
  current = value;
  const stale = value.stale || !value.as_of || Date.now() / 1000 - value.as_of > 25;
  byId('connection').textContent = stale ? 'Stale snapshot' : 'Live / read only';
  byId('connection').style.color = stale ? '#e4cb82' : '';
  const counts = value.counts;
  byId('running-count').textContent = (counts.running ?? 0) + (counts.starting ?? 0) + (counts.stopping ?? 0);
  byId('queued-count').textContent = (counts.queued ?? 0) + (counts.retry_wait ?? 0);
  byId('completed-count').textContent = counts.completed ?? 0;
  byId('failed-count').textContent = (counts.failed ?? 0) + (counts.blocked ?? 0);
  byId('gpu-count').textContent = value.inventory.devices.length;
  byId('observed').textContent = `Observed ${date(value.inventory.observed_at)}`;
  byId('gpus').innerHTML = value.inventory.devices.map(g => {
    const experiment = value.experiments.find(e => active.has(e.state) && latest(e)?.gpus.includes(g.index));
    const state = experiment?.state ?? (g.external_process_count ? 'unmanaged' : 'available');
    const p = experiment?.progress;
    const percent = p?.total ? Math.min(100, Math.max(0, 100 * p.completed / p.total)) : 0;
    return `<article class="gpu"><div class="gpu-top"><div><div class="gpu-id">GPU ${g.index}</div><div class="gpu-model">${esc(g.name)}</div></div>${badge(state)}</div>
      <div class="gpu-title">${esc(experiment?.name ?? (g.external_process_count ? 'External workload' : 'Ready for work'))}</div>
      <div class="gpu-subtitle">${esc(experiment ? groupName(experiment.group_id) : (g.external_process_count ? 'Outside the shared queue' : 'Waiting for an eligible experiment'))}</div>
      <progress aria-label="GPU ${g.index} experiment progress" value="${percent}" max="100"></progress>
      <div class="progress-label"><span>${esc(p ? progressText(p) : '—')}</span><span>${experiment ? esc(eta(experiment.eta_seconds)) : ''}</span></div>
      <div class="gpu-stats"><span>UTIL ${number(g.utilization)}%</span><span>VRAM ${(g.memory_used_mib / 1024).toFixed(1)} / ${(g.memory_total_mib / 1024).toFixed(0)} GB</span></div></article>`;
  }).join('');
  byId('group-list').innerHTML = value.groups.map(g => {
    const jobs = value.experiments.filter(e => e.group_id === g.id);
    const states = [...new Set(jobs.map(e => e.state))].map(s => `${jobs.filter(e => e.state === s).length} ${s}`).join(', ');
    return `<article class="group"><div>${esc(g.name)}<p>${esc(states)}${g.paused ? ' / Dispatch paused' : ''}</p></div></article>`;
  }).join('') || '<p class="muted">No registered experiment groups.</p>';
  const selected = byId('group-filter').value;
  byId('group-filter').innerHTML = '<option value="">All groups</option>' + value.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  byId('group-filter').value = selected;
  byId('updated').textContent = `Server snapshot ${date(value.as_of)}`;
  renderQueue(); renderDetails();
  return stale;
}
async function refresh() {
  try {
    const response = await fetch(config.endpoint, {cache:'no-store', credentials:'omit', signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error(`Status HTTP ${response.status}`);
    const value = await response.json();
    if (value.schema_version !== 1 || value.read_only !== true) throw new Error('Unsupported public status schema');
    const stale = renderStatus(value);
    byId('error').hidden = !stale;
    byId('error').textContent = stale ? 'The server snapshot is stale. Values below are not current.' : '';
  } catch {
    byId('connection').textContent = 'Disconnected';
    byId('connection').style.color = '#e4cb82';
    byId('error').hidden = false;
    byId('error').textContent = 'The live status endpoint is unavailable. Any displayed values are from the last received snapshot.';
  }
}
byId('group-filter').addEventListener('change', renderQueue);
byId('state-filter').addEventListener('change', renderQueue);
byId('experiments').addEventListener('click', event => {
  const button = event.target.closest('[data-detail]');
  if (!button) return;
  detailId = button.dataset.detail; renderDetails(); byId('details').showModal();
});
byId('close-details').addEventListener('click', () => { byId('details').close(); detailId = null; });
(async () => {
  try {
    const response = await fetch('data/experiment-control/config.json', {cache:'no-store'});
    if (!response.ok) throw new Error('Missing endpoint configuration');
    config = await response.json();
    byId('transport-note').textContent = config.temporary ? 'Preview transport: temporary HTTPS hostname. A fixed domain is needed for a permanent endpoint.' : '';
    await refresh();
    setInterval(refresh, 10000);
  } catch {
    byId('connection').textContent = 'Not connected';
    byId('error').hidden = false;
    byId('error').textContent = 'The public status endpoint has not been configured.';
  }
})();
