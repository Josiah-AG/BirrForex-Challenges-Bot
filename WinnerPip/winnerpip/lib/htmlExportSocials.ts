/** Shared footer for downloaded HTML documents, for both admin and host exports. */
export function withWinnerPipSocials(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const pages = Array.from(document.querySelectorAll('.page'));
  const containers = pages.length ? pages : [document.body];
  for (const container of containers) {
    if (container.querySelector('[data-winnerpip-socials]')) continue;
    const footer = document.createElement('div');
    footer.setAttribute('data-winnerpip-socials', '');
    footer.style.cssText = 'position:relative;z-index:1;display:flex;flex-wrap:wrap;justify-content:center;gap:8px 24px;margin-top:14px;font:500 14px/1.6 Inter,Arial,sans-serif;text-align:center;';
    for (const [label, handle, url] of [
      ['TikTok', '@winnerpip', 'https://www.tiktok.com/@winnerpip'],
      ['Instagram', '@winner_pip', 'https://www.instagram.com/winner_pip/'],
    ]) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = 'color:#3b82f6;text-decoration:underline;text-underline-offset:3px;white-space:nowrap;';
      link.textContent = `${label}: ${handle}`;
      footer.appendChild(link);
    }
    (container.querySelector('.footer') || container).appendChild(footer);
  }
  return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
}
