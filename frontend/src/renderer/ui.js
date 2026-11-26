const htmlEntities = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) => htmlEntities[character],
  );
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function statusBadge(status) {
  const colors = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    subscribed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    unsubscribed: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    bounced: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    blocked: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  };
  const label = status ? status[0].toUpperCase() + status.slice(1) : 'Unknown';
  return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${colors[status] || colors.pending}">${escapeHtml(label)}</span>`;
}

export function showToast(root, message, type = 'success') {
  const container =
    root.querySelector('#toast-container') ||
    document.querySelector('#toast-container');
  if (!container) return;
  container.textContent = message;
  container.className =
    type === 'error'
      ? 'fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium text-rose-700 shadow-xl'
      : 'fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-700 shadow-xl';
  container.hidden = false;
  clearTimeout(container.hideTimer);
  container.hideTimer = setTimeout(() => {
    container.hidden = true;
  }, 4000);
}
