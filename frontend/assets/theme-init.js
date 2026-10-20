// Restore the palette before styles paint, without depending on storage availability.
(function restoreTheme() {
  const colors = {night:'#111317',day:'#EBEEF2',wuling:'#10171A'};
  let theme = 'night';
  try {
    const stored = localStorage.getItem('ef_blog_theme_mode');
    if (Object.hasOwn(colors, stored)) theme = stored;
  } catch (_) { /* Restricted storage still permits in-page theme switching. */ }
  document.documentElement.dataset.theme = theme;
  document.getElementById('js-meta-theme-color').content = colors[theme];
})();
