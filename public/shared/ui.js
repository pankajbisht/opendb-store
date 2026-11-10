// Small DOM helpers for the examples. They are not part of opendb-store.

export const $ = (selector) => document.querySelector(selector);

export function show(selector, value) {
  $(selector).textContent =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
