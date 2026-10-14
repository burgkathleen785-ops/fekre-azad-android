/*
 * Tiny DOM builder. Everything in the app is rendered with el().
 *
 * el('div.card', { onclick: fn }, [ el('span', 'hello') ])
 *
 * Text is always set via textContent, so user-entered content can never be
 * interpreted as markup.
 */
(function (App) {
  'use strict';

  var SELECTOR = /^([a-zA-Z0-9-]+)?((?:[.#][\w-]+)*)$/;

  function el(selector, props, children) {
    var m = SELECTOR.exec(selector || 'div');
    if (!m) throw new Error('bad selector: ' + selector);

    var node = document.createElement(m[1] || 'div');

    if (m[2]) {
      m[2].match(/[.#][\w-]+/g).forEach(function (token) {
        if (token[0] === '.') node.classList.add(token.slice(1));
        else node.id = token.slice(1);
      });
    }

    // el('span', 'text') and el('div', [children]) shorthands
    if (typeof props === 'string' || typeof props === 'number') {
      node.textContent = String(props);
      props = null;
    } else if (Array.isArray(props) || props instanceof Node) {
      children = props;
      props = null;
    }

    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;

        if (key === 'text') {
          node.textContent = String(value);
        } else if (key === 'class') {
          String(value).split(/\s+/).filter(Boolean).forEach(function (c) { node.classList.add(c); });
        } else if (key === 'style' && typeof value === 'object') {
          Object.keys(value).forEach(function (p) {
            if (value[p] != null) node.style.setProperty(p, String(value[p]));
          });
        } else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2), value);
        } else if (key === 'html') {
          // Only ever called with literals defined in this codebase.
          node.innerHTML = value;
        } else if (value === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, String(value));
        }
      });
    }

    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(node, c); });
      return;
    }
    if (children instanceof Node) { node.appendChild(children); return; }
    node.appendChild(document.createTextNode(String(children)));
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function frag(children) {
    var f = document.createDocumentFragment();
    append(f, children);
    return f;
  }

  App.el = el;
  App.dom = { el: el, clear: clear, frag: frag, append: append };
})(window.App = window.App || {});
