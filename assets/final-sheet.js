(() => {
  const overviewTabs = [...document.querySelectorAll('.overview-tabs [role="tab"]')];
  const overviewPanels = [...document.querySelectorAll('.overview-panel')];
  function selectOverview(index, focus = false) {
    overviewTabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      overviewPanels[i].hidden = i !== index;
    });
    if (focus) overviewTabs[index].focus();
  }
  overviewTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectOverview(index));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % overviewTabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + overviewTabs.length) % overviewTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = overviewTabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectOverview(next, true); }
    });
  });
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
    document.querySelector('#video-count').textContent = `${count} / ${document.querySelectorAll(".gallery-group video").length} samples · ${visibleGroups} ${visibleGroups === 1 ? 'group' : 'groups'}`;
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
  function revealHash() {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target && target.classList.contains('gallery-group')) {
      family = 'all'; bodyFilter.value = 'all';
      document.querySelectorAll('[data-family-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.familyFilter === 'all')));
      filter(); target.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', revealHash); revealHash();
  // Load preview covers only when they approach the viewport.
  const covers = [...document.querySelectorAll('video[data-poster]')];
  const loadCover = video => { if (video.dataset.poster) { video.poster = video.dataset.poster; delete video.dataset.poster; } };
  if ('IntersectionObserver' in window) {
    const coverObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { loadCover(entry.target); coverObserver.unobserve(entry.target); } });
    }, { rootMargin: '600px 0px' });
    covers.forEach(video => coverObserver.observe(video));
    const tocLinks = [...document.querySelectorAll('aside a[href^="#"]')];
    const tocObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      const id = visible[0].target.id;
      tocLinks.forEach(link => {
        const active = link.getAttribute('href') === '#' + id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-8% 0px -65% 0px' });
    document.querySelectorAll('.article-body > section').forEach(section => tocObserver.observe(section));
  } else covers.forEach(loadCover);
})();
