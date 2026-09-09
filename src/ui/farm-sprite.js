import { farmArtwork } from "./farm-artwork.js";

export function createFarmSprite(key, slot, eager = false) {
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
