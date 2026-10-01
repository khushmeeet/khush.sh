// Sets <html data-season="…"> so style.css can pick that season's colors.
// Preview any season with ?season=winter, spring, summer or autumn.

(() => {
  const seasons = ['winter', 'spring', 'summer', 'autumn'];

  // Northern-hemisphere meteorological seasons:
  // Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn.
  const month = new Date().getMonth(); // 0 is January
  const byDate = seasons[Math.floor(((month + 1) % 12) / 3)];

  const asked = new URLSearchParams(location.search).get('season');
  document.documentElement.dataset.season = seasons.includes(asked) ? asked : byDate;
})();
