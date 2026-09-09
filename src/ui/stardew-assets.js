const root = "/assets/stardew-generated";

export const stardewAssets = Object.freeze({
  headerBackground: `${root}/farm-horizon-bg.png`,
  panelFrame: `${root}/panel-nine-slice-v3.png`,
  metricIcons: Object.freeze({
    quality: `${root}/icon-sprout.png`,
    requests: `${root}/icon-clipboard.png`,
    capacity: `${root}/icon-backpack.png`,
    pool: `${root}/icon-barrel.png`,
  }),
});

export function metricIconFor(key) {
  return stardewAssets.metricIcons[key] || "";
}
