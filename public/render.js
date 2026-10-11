// Fills the page from content.js, using the <template>s in index.html.

(() => {
  const site = window.SITE;
  if (!site) return;

  const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
  const clone = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

  // A row: a date or a name on the left, text on the right.
  function row(item) {
    const el = clone('row');
    const label = el.querySelector('.label');
    label.textContent = item.date || item.name || '';
    label.classList.add(item.date ? 'date' : 'name');
    el.querySelector('.text').textContent = item.text || '';
    return el;
  }

  function paragraph(text) {
    const p = document.createElement('p');
    p.className = 'prose';
    p.textContent = text;
    return p;
  }

  function section(data) {
    const sec = clone('section');
    const heading = sec.querySelector('h2');
    heading.id = `sec-${slug(data.title)}`;
    heading.textContent = data.title;
    sec.setAttribute('aria-labelledby', heading.id);
    if (data.rows) sec.append(...data.rows.map(row));
    if (data.paragraphs) sec.append(...data.paragraphs.map(paragraph));
    return sec;
  }

  slot('name').textContent = site.name;
  slot('intro').textContent = site.intro;
  slot('links').append(...site.links.map(link));
  slot('sections').append(...site.sections.map(section));
  slot('colophon').textContent = site.colophon;
})();
