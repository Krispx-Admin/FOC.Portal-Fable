// ── Module: Schedule — embeds the standalone weekly staff scheduler unmodified ──
export function scheduleView() {
  let root;

  return {
    mount(container) {
      root = container;
      root.classList.add('schedule-embed');
      root.innerHTML = `<iframe class="schedule-frame" src="finland-optical-scheduler.html" title="Weekly staff scheduler"></iframe>`;
    },
    onChange() {},
    unmount() { root?.classList.remove('schedule-embed'); },
  };
}
