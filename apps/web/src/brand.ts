/*
 * The brand mark: a Bible cover filling the tile, gilt page edges down the right, a ribbon from
 * the top, and a cross drawn as a git commit graph (a hollow commit at each end). Iron gall
 * palette, drawn on a 100×100 grid, full-bleed. The cross sits well inside the middle 80% circle,
 * so the same art is safe as a maskable icon.
 *
 * Source and alternatives: prototype/logos-app.html (A3, paper colourway).
 */
const MARK = `<defs><linearGradient id="a0t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#33497d"/><stop offset="1" stop-color="#22335a"/></linearGradient><linearGradient id="a0c" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#33497d"/><stop offset="1" stop-color="#22335a"/></linearGradient><filter id="a0s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter></defs><rect width="100" height="100" fill="url(#a0t)"/><rect x="88" y="0" width="12" height="100" fill="#f7f1e4"/><line x1="90.5" y1="0" x2="90.5" y2="100" stroke="#22335a" stroke-width=".4" opacity=".3"/><line x1="93" y1="0" x2="93" y2="100" stroke="#22335a" stroke-width=".4" opacity=".3"/><line x1="95.5" y1="0" x2="95.5" y2="100" stroke="#22335a" stroke-width=".4" opacity=".3"/><line x1="98" y1="0" x2="98" y2="100" stroke="#22335a" stroke-width=".4" opacity=".3"/><rect x="0" y="0" width="88" height="100" fill="url(#a0c)"/><rect x="86.6" y="0" width="1.4" height="100" fill="#000" opacity=".25"/><line x1="12" y1="0" x2="12" y2="100" stroke="#000" stroke-width="2" opacity=".28"/><line x1="14" y1="0" x2="14" y2="100" stroke="#fff" stroke-width=".8" opacity=".1"/><path d="M66.5 0 H73.5 V22 L70 18.4 L66.5 22 Z" fill="#7f98d1" stroke="#7f98d1" stroke-width="1" stroke-linejoin="round"/><mask id="a0x" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/><circle cx="48" cy="26" r="4.6" fill="#000"/><circle cx="48" cy="74" r="4.6" fill="#000"/><circle cx="33" cy="40" r="4.6" fill="#000"/><circle cx="63" cy="40" r="4.6" fill="#000"/></mask><g mask="url(#a0x)" stroke="#efe4c9" stroke-width="4.2" stroke-linecap="round"><line x1="48" y1="26" x2="48" y2="74"/><line x1="33" y1="40" x2="63" y2="40"/></g><circle cx="48" cy="26" r="4.6" fill="none" stroke="#efe4c9" stroke-width="4.2"/><circle cx="48" cy="74" r="4.6" fill="none" stroke="#efe4c9" stroke-width="4.2"/><circle cx="33" cy="40" r="4.6" fill="none" stroke="#efe4c9" stroke-width="4.2"/><circle cx="63" cy="40" r="4.6" fill="none" stroke="#efe4c9" stroke-width="4.2"/>`;

/** The mark as an SVG document. `rounded` clips it to an app-icon rounded square, for places
 *  that show the icon as-is (purpose "any", the header); maskable icons stay full-bleed. */
export function iconSvg({ rounded = false }: { rounded?: boolean } = {}) {
  const inner = rounded
    ? `<clipPath id="round"><rect width="100" height="100" rx="22.5"/></clipPath><g clip-path="url(#round)">${MARK}</g>`
    : MARK;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`;
}
