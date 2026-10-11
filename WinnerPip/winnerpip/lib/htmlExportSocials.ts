/** Shared footer for downloaded HTML documents, for both admin and host exports. */
export function withWinnerPipSocials(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const pages = Array.from(document.querySelectorAll('.page'));
  const containers = pages.length ? pages : [document.body];
  for (const container of containers) {
    if (container.querySelector('[data-winnerpip-socials]')) continue;
    const footer = document.createElement('div');
    footer.setAttribute('data-winnerpip-socials', '');
    footer.style.cssText = 'position:relative;z-index:1;display:flex;flex-wrap:wrap;justify-content:center;gap:8px 24px;margin-top:32px;font:500 14px/1.6 Inter,Arial,sans-serif;text-align:center;';
    for (const [label, handle, url, icon] of [
      ['TikTok', '@winnerpip', 'https://www.tiktok.com/@winnerpip', '<path fill="currentColor" d="M16.7 1h-3.8v14.7a3.2 3.2 0 1 1-2.8-3.2V8.6a7 7 0 1 0 6.6 7V8.1A9.2 9.2 0 0 0 22 9.8V6a5.5 5.5 0 0 1-5.3-5Z"/>'],
      ['Instagram', '@winner_pip', 'https://www.instagram.com/winner_pip/', '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>'],
    ]) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = 'display:inline-flex;align-items:center;gap:8px;color:#60a5fa;text-decoration:none;white-space:nowrap;';
      link.setAttribute('aria-label', `${label}: ${handle}`);
      link.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style="flex-shrink:0">${icon}</svg>`;
      link.appendChild(document.createTextNode(handle));
      footer.appendChild(link);
    }
    // Leaderboard containers grow to fill the page; keep links beside their rows.
    const content = container.querySelector('.rules-grid, .lb-container, .grid');
    if (content?.classList.contains('lb-container')) content.appendChild(footer);
    else if (content) content.after(footer);
    else {
      const pageFooter = container.querySelector('.footer');
      if (pageFooter) pageFooter.before(footer);
      else container.appendChild(footer);
    }
  }
  return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
}
