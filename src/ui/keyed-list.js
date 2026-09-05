// Components own their DOM. Refreshes preserve nodes, focus and animations;
// only membership/order changes insert, move or remove a component.
export function createKeyedList(container, keyOf, create) {
  const entries = new Map();
  return {
    update(items) {
      const keys = items.map(keyOf);
      if (new Set(keys).size !== keys.length) throw new Error("Duplicate list key");
      const active = new Set(keys);
      for (const [key, component] of entries) {
        if (!active.has(key)) { component.node.remove(); entries.delete(key); }
      }
      let cursor = container.firstChild;
      items.forEach((item, index) => {
        const key = keys[index];
        let component = entries.get(key);
        if (!component) { component = create(item); entries.set(key, component); }
        component.update(item);
        if (component.node !== cursor) container.insertBefore(component.node, cursor);
        cursor = component.node.nextSibling;
      });
    },
    clear() {
      for (const component of entries.values()) component.node.remove();
      entries.clear();
    },
  };
}
