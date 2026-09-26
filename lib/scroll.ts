/**
 * Centre `el` inside its own scrolling list, touching nothing else.
 * (`scrollIntoView` also scrolls every clipped ancestor and the page itself,
 * which on iPhone slides the whole room up and leaves a gap at the bottom.)
 */
export function centerIn(container: HTMLElement | null | undefined, el: HTMLElement | null | undefined, smooth = true) {
  if (!container || !el) return;
  const box = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  container.scrollBy({ top: r.top - box.top - (box.height - r.height) / 2, behavior: smooth ? "smooth" : "auto" });
}
