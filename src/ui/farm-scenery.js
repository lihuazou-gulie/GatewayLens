import { farmArtwork } from "./farm-artwork.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const scenes = [
  {
    host: ".topbar, .settings-topbar",
    name: "header",
    props: [
      ["tree", "tree"],
      ["tree", "tree-far"],
      ["fence", "fence"],
      ["barrel", "barrel"],
      ["flowers", "flowers"],
      ["berries", "berries"],
      ["chicken", "chicken"],
    ],
  },
  {
    host: "#overview-panels",
    name: "meadow",
    props: [
      ["fence", "fence"],
      ["flowers", "flowers"],
      ["berries", "berries"],
      ["grass", "grass"],
      ["rocks", "rocks"],
      ["mushrooms", "mushrooms"],
      ["stump", "stump"],
      ["sign", "sign"],
      ["cow", "cow"],
      ["sheep", "sheep"],
    ],
  },
  {
    host: "footer",
    name: "footer",
    props: [
      ["tree", "tree"],
      ["cave", "cave"],
      ["mushrooms", "mushrooms"],
      ["pond", "pond"],
      ["bridge", "bridge"],
      ["flowers", "flowers"],
      ["stump", "stump"],
      ["fence", "fence"],
      ["crate", "crate"],
      ["barrel", "barrel"],
      ["coins", "coins"],
      ["campfire", "campfire"],
      ["berries", "berries"],
      ["duck", "duck"],
      ["cat", "cat"],
      ["dog", "dog"],
    ],
  },
];

function sprite(key, slot, eager) {
  const art = farmArtwork[key],
    [left, top, width, height] = art.bounds;
  const node = document.createElement("span");
  node.className = `farm-prop farm-prop--${slot}`;
  node.style.aspectRatio = `${width} / ${height}`;
  node.style.setProperty("--art-width", `${(art.size[0] / width) * 100}%`);
  node.style.setProperty("--art-left", `${(-left / width) * 100}%`);
  node.style.setProperty("--art-top", `${(-top / height) * 100}%`);
  const image = document.createElement("img");
  image.src = art.src;
  image.alt = "";
  image.width = art.size[0];
  image.height = art.size[1];
  image.loading = eager ? "eager" : "lazy";
  image.decoding = "async";
  image.draggable = false;
  node.append(image);
  return node;
}

function terrain(name) {
  const art = farmArtwork.soil;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "farm-ground");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "32");
  const defs = document.createElementNS(SVG_NS, "defs");
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.id = `farm-ground-${name}`;
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", "128");
  pattern.setAttribute("height", String((128 * art.bounds[3]) / art.bounds[2]));
  pattern.setAttribute("viewBox", art.bounds.join(" "));
  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("href", art.src);
  image.setAttribute("width", String(art.size[0]));
  image.setAttribute("height", String(art.size[1]));
  pattern.append(image);
  defs.append(pattern);
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", `url(#${pattern.id})`);
  svg.append(defs, rect);
  return svg;
}

let initialized = false;
export function initFarmScenery() {
  if (initialized) return;
  initialized = true;
  const mount = () => {
    if (document.documentElement.dataset.theme !== "stardew") return;
    for (const scene of scenes) {
      const host = document.querySelector(scene.host);
      if (!host || host.querySelector(":scope > .farm-scene")) continue;
      const node = document.createElement("div");
      node.className = `farm-scene farm-scene--${scene.name}`;
      node.setAttribute("aria-hidden", "true");
      node.append(
        ...scene.props.map(([key, slot]) => sprite(key, slot, scene.name === "header")),
        terrain(scene.name),
      );
      scene.name === "footer" ? host.prepend(node) : host.append(node);
    }
  };
  mount();
  document.addEventListener("kanban-theme-change", mount);
}
