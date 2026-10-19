(() => {
  let family = 'all';
  const groups = [...document.querySelectorAll('.gallery-group')];
  const bodyFilter = document.querySelector('#body-filter');
  function filter() {
    let count = 0, visibleGroups = 0;
    for (const group of groups) {
      group.hidden = (family !== 'all' && group.dataset.family !== family) || (bodyFilter.value !== 'all' && group.dataset.group !== bodyFilter.value);
      if (!group.hidden) { count += group.querySelectorAll('video').length; visibleGroups++; }
      else group.querySelectorAll('video').forEach(v => v.pause());
    }
    document.querySelector('#video-count').textContent = `${count} / 45 samples · ${visibleGroups} ${visibleGroups === 1 ? 'group' : 'groups'}`;
  }
  document.querySelectorAll('[data-family-filter]').forEach(button => button.addEventListener('click', () => {
    family = button.dataset.familyFilter; bodyFilter.value = 'all';
    document.querySelectorAll('[data-family-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    filter();
  }));
  bodyFilter.addEventListener('change', () => {
    family = 'all';
    document.querySelectorAll('[data-family-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.familyFilter === 'all')));
    filter();
  });
  groups.forEach(group => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const panels = [...group.querySelectorAll('[role="tabpanel"]')];
    function selectSample(index, focus = false) {
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
        if (!selected) panels[i].querySelector('video').pause();
      });
      const video = panels[index].querySelector('video');
      if (video.dataset.poster) {
        video.poster = video.dataset.poster;
        delete video.dataset.poster;
      }
      if (focus) tabs[index].focus();
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectSample(index));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); selectSample(next, true); }
      });
    });
  });
  document.querySelectorAll('.video-card').forEach(card => {
    const video = card.querySelector('video');
    video.addEventListener('play', () => document.querySelectorAll('video').forEach(v => { if (v !== video) v.pause(); }));
    card.querySelector('[data-speed]').addEventListener('change', e => { video.playbackRate = Number(e.target.value); });
    card.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
      video.pause();
      const move = () => { video.currentTime = Math.max(0, Math.min(video.duration - 0.5 / Number(video.dataset.fps), video.currentTime + Number(button.dataset.step) / Number(video.dataset.fps))); };
      if (video.readyState < 1) { video.addEventListener('loadedmetadata', move, { once: true }); video.load(); }
      else move();
    }));
  });
  const sections = [...document.querySelectorAll('.article-body > section')];
  const sectionButtons = [...document.querySelectorAll('[data-section]')];
  function showSection(id) {
    sections.forEach(section => {
      section.hidden = section.id !== id;
      if (section.hidden) section.querySelectorAll('video').forEach(video => video.pause());
    });
    sectionButtons.forEach(button => button.setAttribute('aria-expanded', String(button.dataset.section === id)));
  }
  sectionButtons.forEach(button => button.addEventListener('click', () => {
    const id = button.getAttribute('aria-expanded') === 'true' ? '' : button.dataset.section;
    showSection(id);
    history.replaceState(null, '', location.pathname + location.search + (id ? '#' + id : ''));
  }));
  function revealHash() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    const section = target && target.closest('.content-panel');
    if (!section) return;
    showSection(section.id);
    if (target.classList.contains('gallery-group')) {
      family = 'all'; bodyFilter.value = 'all';
      document.querySelectorAll('[data-family-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.familyFilter === 'all')));
      filter();
    }
    target.scrollIntoView();
  }
  // Repeated links to the current fragment must also reopen a collapsed panel.
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    if (link.getAttribute('href') === location.hash) revealHash();
  }));
  window.addEventListener('hashchange', revealHash); revealHash();
  // Load preview covers only when they approach the viewport.
  const covers = [...document.querySelectorAll('video[data-poster]')];
  const loadCover = video => { if (video.dataset.poster) { video.poster = video.dataset.poster; delete video.dataset.poster; } };
  if ('IntersectionObserver' in window) {
    const coverObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { loadCover(entry.target); coverObserver.unobserve(entry.target); } });
    }, { rootMargin: '600px 0px' });
    covers.forEach(video => coverObserver.observe(video));
  } else covers.forEach(loadCover);
})();
