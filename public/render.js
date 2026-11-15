// Fills the page from content.js, using the <template>s in index.html.

(() => {
  const site = window.SITE;
  if (!site) return;

  const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
  const clone = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);

  // A text link.
  function page(item) {
    const a = document.createElement('a');
    a.href = item.url;
    a.textContent = item.label;
    return a;
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
  slot('intro').textContent = [].concat(site.intro).join('\n');
  slot('pages').append(...(site.pages || []).map(page));
  slot('links').append(...site.links.map(link));
  // No text links: hide their (empty) nav and the divider, leaving just the icons.
  if (!(site.pages || []).length) slot('pages').hidden = slot('pages').nextElementSibling.hidden = true;
})();
