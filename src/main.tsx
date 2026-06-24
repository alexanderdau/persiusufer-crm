import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// After a new deploy, the service worker may replace its pre-cache while
// the page still holds old chunk references. A reload picks up the new
// HTML + new SW cache. A sessionStorage guard prevents infinite loops.
// See https://vite.dev/guide/build.html#load-error-handling
window.addEventListener("vite:preloadError", () => {
  const key = "chunk-reload";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

// Service-Worker-Auto-Update: vite-plugin-pwa läuft im autoUpdate-Modus, der
// einen neuen SW nach einem Deploy via skipWaiting/clientsClaim sofort aktiviert.
// Die bereits geladene Seite läuft aber mit dem ALTEN Bundle weiter, bis man
// neu lädt — deshalb hier ein einmaliger Auto-Reload, sobald der neue SW die
// Kontrolle übernimmt. Zusätzlich ein periodischer Update-Check, damit auch
// offene Tabs einen Deploy von selbst (binnen ~1 Min) einspielen.
if ("serviceWorker" in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker.ready
    .then((reg) => {
      setInterval(() => {
        reg.update().catch(() => {});
      }, 60_000);
    })
    .catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
