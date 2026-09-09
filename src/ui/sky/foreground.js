import { createFarmSprite } from "../farm-sprite.js";

// Positions are relative to each planting, keeping overlapping groups intact on narrow screens.
// Each entry is [artwork, horizontal center %, width px, ground offset px, depth, mirror].
const plantings = {
  woodland: [
    ["tree", 76, 58, 19, 1],
    ["tree", 46, 72, 17, 1, -1],
    ["tree", 14, 92, 12, 2],
    ["fence", 83, 66, 12, 1],
    ["grass", 33, 70, 10, 2],
    ["flowers", 66, 58, 11, 2],
    ["rocks", 91, 28, 12, 2],
  ],
  garden: [
    ["fence", 24, 72, 12, 1],
    ["fence", 48, 70, 12, 1, -1],
    ["fence", 72, 68, 12, 1],
    ["berries", 10, 57, 11, 2],
    ["grass", 36, 62, 11, 2],
    ["flowers", 63, 46, 11, 2],
    ["grass", 87, 56, 10, 2, -1],
  ],
  edge: [
    ["tree", 18, 58, 20, 1],
    ["tree", 53, 80, 16, 1, -1],
    ["tree", 88, 94, 10, 2],
    ["fence", 8, 60, 12, 1],
    ["berries", 32, 58, 10, 2],
    ["grass", 70, 67, 10, 2],
  ],
  understory: [
    ["grass", 1, 62, 8, 2],
    ["grass", 8, 68, 10, 2, -1],
    ["flowers", 15, 42, 10, 2],
    ["grass", 22, 60, 9, 2],
    ["grass", 29, 72, 8, 2, -1],
    ["rocks", 34, 26, 12, 2],
    ["grass", 39, 55, 10, 2],
    ["grass", 47, 66, 8, 2],
    ["flowers", 54, 38, 11, 2],
    ["grass", 60, 62, 8, 2, -1],
    ["grass", 67, 68, 9, 2],
    ["rocks", 73, 30, 11, 2],
    ["grass", 79, 56, 9, 2],
    ["grass", 86, 66, 8, 2, -1],
    ["flowers", 92, 44, 10, 2],
    ["grass", 99, 70, 9, 2],
  ],
};

export function createHeaderForeground() {
  const foreground = document.createElement("div");
  foreground.className = "header-foreground";
  for (const [name, props] of Object.entries(plantings)) {
    const cluster = document.createElement("div");
    cluster.className = `foreground-cluster foreground-cluster--${name}`;
    for (const [key, x, size, bottom, depth, mirror = 1] of props) {
      const prop = createFarmSprite(key, key, true);
      prop.style.setProperty("--plant-x", `${x}%`);
      prop.style.setProperty("--plant-size", `${size}px`);
      prop.style.setProperty("--plant-bottom", `${bottom}px`);
      prop.style.setProperty("--plant-depth", depth);
      prop.style.setProperty("--plant-mirror", mirror);
      cluster.append(prop);
    }
    foreground.append(cluster);
  }
  return foreground;
}
