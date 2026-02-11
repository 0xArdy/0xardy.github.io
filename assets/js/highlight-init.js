(() => {
  if (!window.hljs) return;

  document.querySelectorAll("pre code").forEach((code) => {
    const pre = code.parentElement;
    if (!pre) return;

    // Strip Rouge-generated spans (unstyled) so highlight.js can re-process.
    if (code.querySelector("span")) {
      code.textContent = code.textContent;
    }

    // Kramdown/Rouge may set the language class on a wrapper div or <pre>
    // instead of <code>. Propagate it so highlight.js picks it up.
    const wrapper = pre.closest(".highlighter-rouge");
    const langSource = wrapper || pre;
    const langClass = Array.from(langSource.classList).find((cls) =>
      cls.startsWith("language-")
    );
    if (langClass && !code.classList.contains(langClass)) {
      code.classList.add(langClass);
    }

    window.hljs.highlightElement(code);
  });
})();
