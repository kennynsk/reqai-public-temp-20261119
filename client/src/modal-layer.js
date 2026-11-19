// Body portals share one isolation stack. Restoring snapshots independently
// breaks nested dialogs when their parents unmount before their children.
const layers = [];
const originals = new Map();
let observer;
let overflow;
function update() {
  const top = layers.at(-1);
  for (const child of document.body.children) {
    if (!originals.has(child)) originals.set(child, child.hasAttribute('inert'));
    child.toggleAttribute('inert', top ? !child.contains(top) : originals.get(child));
  }
}
export function isolateModal(node) {
  if (!layers.length) {
    overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true });
  }
  layers.push(node);
  update();
  return () => {
    const index = layers.indexOf(node);
    if (index !== -1) layers.splice(index, 1);
    update();
    if (!layers.length) {
      observer?.disconnect();
      for (const [element, inert] of originals) element.toggleAttribute('inert', inert);
      originals.clear();
      document.body.style.overflow = overflow;
    }
  };
}
