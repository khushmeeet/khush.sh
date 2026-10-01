// Fills the page from content.js, using the <template>s in index.html.

(() => {
  const site = window.SITE;
  if (!site) return;

  const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
  const clone = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);

  // Put text in an element, or drop the element when there's nothing to show.
  const fill = (el, value) => (value ? (el.textContent = value) : el.remove());

  // A dated row: when | title, role, text. Any part can be left out.
  function entry(item) {
    const row = clone('entry');
    fill(row.querySelector('.when'), item.when);
    const heading = row.querySelector('h3');
    if (item.title) {
      fill(heading.querySelector('.title'), item.title);
      fill(heading.querySelector('.role'), item.role);
    } else {
      heading.remove();
    }
    fill(row.querySelector('.text'), item.text);
    return row;
  }

  // A project row: name | text.
  function project(item) {
    const row = clone('project');
    fill(row.querySelector('.title'), item.title);
    fill(row.querySelector('.text'), item.text);
    return row;
  }

  // An icon link.
  function link(item) {
    const a = clone('link');
    a.href = item.url;
    a.title = item.tooltip || item.label;
    a.setAttribute('aria-label', item.label);
    if (item.me) a.rel = 'me';
    a.querySelector('use').setAttribute('href', `#icon-${item.icon}`);
    return a;
  }

  slot('name').textContent = site.name;
  slot('intro').textContent = site.intro;
  slot('links').append(...site.links.map(link));
  slot('now').append(...site.now.map(entry));
  slot('building').append(...site.building.map(project));
  slot('work').append(...site.work.map(entry));
  slot('education').append(...site.education.map(entry));
  slot('colophon').textContent = site.colophon;
})();
