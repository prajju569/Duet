/* Duet service worker: shows push notifications and opens the right room on tap. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Duet", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Duet";
  const url = data.url || "/";
  event.waitUntil(
    (async () => {
      // Already looking at this room? Then stay quiet.
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const watching = wins.some((c) => c.visibilityState === "visible" && new URL(c.url).pathname === url);
      if (watching) {
        // Safari (iPhone, iPad, Mac) insists every push shows *something* — show it and take it straight down.
        const ua = self.navigator.userAgent || "";
        const safari = /iPhone|iPad|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/.test(ua));
        if (!safari) return;
        await self.registration.showNotification(title, { body: data.body || "", tag: data.tag || "duet", silent: true, data: { url } });
        const shown = await self.registration.getNotifications({ tag: data.tag || "duet" });
        shown.forEach((n) => n.close());
        return;
      }
      await self.registration.showNotification(title, {
        body: data.body || "",
        tag: data.tag || "duet",
        renotify: true,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of wins) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (wins[0] && "navigate" in wins[0]) {
        await wins[0].navigate(url);
        return wins[0].focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
