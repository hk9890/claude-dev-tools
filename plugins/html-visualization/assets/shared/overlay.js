/* overlay.js — fills a diagram's zoom panel on demand.
 *
 * The panel itself is pure `popover`; this exists only so the author writes each
 * diagram ONCE. A second hand-authored copy inside the panel would have to stay
 * byte-identical to the first — and Mermaid source that drifts by a character
 * stops parsing, so the copy would silently render an error graphic.
 *
 * Contract: a `.hv-zoom-btn` whose `popovertarget` names a `.hv-popover-wide`
 * containing an empty `.hv-popover-body`. On open, the button's own diagram
 * container is cloned into that body. Cloning the RENDERED node, not the source,
 * means Mermaid never runs twice and the panel cannot disagree with the page.
 *
 * Loaded by ask mode via a <script> tag; visualize-template.html inlines a
 * verbatim copy to stay self-contained for file:// use.
 */

(function () {
  'use strict';

  function fill(btn) {
    var panel = document.getElementById(btn.getAttribute('popovertarget'));
    if (!panel) return;
    var body = panel.querySelector('.hv-popover-body');
    var source = btn.closest('.vis-mermaid-wrap');
    if (!body || !source) return;

    var copy = source.cloneNode(true);
    // Drop only the opener — the clone would otherwise carry a second button
    // pointing at the panel it now lives inside.
    copy.querySelectorAll('.hv-zoom-btn').forEach(function (el) { el.remove(); });
    // The `id` attributes stay. Mermaid emits a <style> INSIDE the <svg> whose
    // every rule is scoped to that svg's own id, so stripping ids to keep the
    // document unique would leave the clone unstyled: black default node fills
    // and labels clipped out of their boxes. Duplicate ids are harmless here —
    // nothing looks a diagram up by id, and the scoped rules matching both
    // copies is exactly what makes the panel render like the page.
    body.replaceChildren(copy);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.hv-zoom-btn');
    if (btn) fill(btn);
  });
})();
