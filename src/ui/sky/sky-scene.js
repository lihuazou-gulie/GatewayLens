import { localHour, skyAtHour } from "./day-cycle.js";
import { cloudArt, hillsArt, houseArt, moonArt, stars, sunArt } from "./pixel-art.js";

function layer(document, className, art) {
  const node = document.createElement("div");
  node.className = className;
  if (art) node.innerHTML = art;
  return node;
}

export function createSkyScene(scene) {
  const document = scene.ownerDocument;
  const window = document.defaultView;
  const sky = layer(document, "pixel-sky");
  sky.setAttribute("aria-hidden", "true");
  const starField = layer(document, "sky-stars");
  for (const [i, [x, y]] of stars.entries()) {
    const star = layer(document, "sky-star" + (i % 4 === 0 ? " sky-star--cross" : ""));
    star.style.left = `${x}%`;
    star.style.top = `${y}%`;
    starField.append(star);
  }
  sky.append(
    starField,
    layer(document, "sky-orb sky-sun", sunArt),
    layer(document, "sky-orb sky-moon", moonArt),
  );
  for (let i = 0; i < 5; i++) {
    // Repeated copies trade places beyond the clipped scene edge for a seamless loop.
    const cloud = layer(document, "sky-cloud", cloudArt(i) + cloudArt(i));
    cloud.style.setProperty("--cloud-top", `${[12, 36, 8, 48, 24][i]}%`);
    cloud.style.setProperty("--cloud-width", `${[130, 94, 168, 114, 146][i]}px`);
    cloud.style.setProperty("--cloud-duration", `${[103, 149, 181, 127, 163][i]}s`);
    cloud.style.setProperty("--cloud-delay", `${[-16, -63, -119, -101, -153][i]}s`);
    cloud.style.setProperty("--cloud-rest-left", `${[-5, 18, 42, 68, 89][i]}%`);
    sky.append(cloud);
  }
  sky.append(layer(document, "sky-hills", hillsArt), layer(document, "sky-house", houseArt));
  scene.prepend(sky);

  let timer;
  let disposed = false;
  const update = () => {
    const state = skyAtHour(localHour());
    scene.dataset.skyPhase = state.phase;
    for (const [name, value] of Object.entries(state.colors))
      scene.style.setProperty(`--sky-${name}`, value);
    for (const key of ["daylight", "stars", "windowLight"])
      scene.style.setProperty(`--sky-${key}`, String(state[key]));
    for (const name of ["sun", "moon"]) {
      for (const [key, value] of Object.entries(state[name]))
        scene.style.setProperty(
          `--${name}-${key}`,
          key === "opacity" ? String(value) : `${value}%`,
        );
    }
  };
  const pause = () => {
    window.clearTimeout(timer);
    timer = undefined;
    scene.dataset.skyRunning = "false";
  };
  const tick = () => {
    update();
    // Minute cadence is independent of monitoring refreshes and does not rebuild the scene.
    timer = window.setTimeout(tick, 60000 - (Date.now() % 60000));
  };
  const sync = () => {
    pause();
    if (
      disposed ||
      document.visibilityState === "hidden" ||
      document.documentElement.dataset.theme !== "stardew"
    )
      return;
    update();
    scene.dataset.skyRunning = "true";
    timer = window.setTimeout(tick, 60000 - (Date.now() % 60000));
  };
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("kanban-theme-change", sync);
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", sync);
  sync();
  return () => {
    disposed = true;
    pause();
    document.removeEventListener("visibilitychange", sync);
    document.removeEventListener("kanban-theme-change", sync);
    window.removeEventListener("pagehide", pause);
    window.removeEventListener("pageshow", sync);
  };
}
