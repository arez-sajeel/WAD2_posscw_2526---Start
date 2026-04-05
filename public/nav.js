const rootDocument = globalThis.document;
const rootWindow = globalThis.window;

if (rootDocument && rootWindow) {
  rootDocument.querySelectorAll("[data-mobile-nav]").forEach((header) => {
  const button = header.querySelector(".nav-toggle");
  const panel = header.querySelector(".site-header__panel");

  if (!button || !panel) {
    return;
  }

  const closeMenu = () => {
    header.classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
  };

  button.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
  });

  header.querySelectorAll(".site-nav__link").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  rootDocument.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  rootWindow.addEventListener("resize", () => {
    if (rootWindow.innerWidth >= 1024) {
      closeMenu();
    }
  });
  });
}