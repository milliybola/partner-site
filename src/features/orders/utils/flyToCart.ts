/**
 * Mahsulot bosilganda uning rasmi savat tomon uchib boradi (Kassa va Stol oynasi uchun umumiy).
 * Savat ko'rinmasa (telefonda yashirin, kengligi 0) yoki «kamroq harakat» yoqilgan bo'lsa — animatsiya yo'q.
 */
export const flyToCart = (card: HTMLElement, cart: Element | null | undefined) => {
  const target = cart?.getBoundingClientRect();
  const src = (card.querySelector('img') ?? card.firstElementChild) as HTMLElement | null;
  if (!target || target.width === 0 || !src) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const from = src.getBoundingClientRect();
  const size = 56;
  const ghost = document.createElement('div');
  Object.assign(ghost.style, {
    position: 'fixed',
    left: from.left + from.width / 2 - size / 2 + 'px',
    top: from.top + from.height / 2 - size / 2 + 'px',
    width: size + 'px',
    height: size + 'px',
    borderRadius: '16px',
    overflow: 'hidden',
    zIndex: '200',
    pointerEvents: 'none',
    boxShadow: '0 8px 24px rgba(0,0,0,.25)',
    background: 'rgb(var(--color-brand))',
  });
  if (src instanceof HTMLImageElement && src.src) {
    const img = document.createElement('img');
    img.src = src.src;
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover' });
    ghost.appendChild(img);
  }
  document.body.appendChild(ghost);
  const dx = target.left + target.width / 2 - (from.left + from.width / 2);
  const dy = target.top + Math.min(90, target.height / 3) - (from.top + from.height / 2);
  const anim = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 40}px) scale(0.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.35 },
    ],
    { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)' },
  );
  anim.onfinish = anim.oncancel = () => ghost.remove();
};
