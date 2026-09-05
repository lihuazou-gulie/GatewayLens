export function initAmbientEffects() {
  const field = document.querySelector(".particle-field");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (field && !reduceMotion) {
    const palette = ["#c7f36b", "#65e6b4", "#62dce7"];
    for (let index = 0; index < 26; index += 1) {
      const particle = document.createElement("span");
      particle.className = "particle";
      particle.style.setProperty("--particle-size", `${index % 5 === 0 ? 3 : 2}px`);
      particle.style.setProperty("--particle-color", palette[index % palette.length]);
      particle.style.setProperty("--particle-duration", `${8 + (index % 6) * 1.8}s`);
      particle.style.setProperty("--particle-delay", `${-(index % 8) * 1.4}s`);
      particle.style.setProperty("--particle-drift", `${(index % 2 ? 1 : -1) * (12 + (index % 5) * 8)}px`);
      particle.style.left = `${4 + ((index * 37) % 92)}%`;
      particle.style.top = `${10 + ((index * 53) % 82)}%`;
      field.appendChild(particle);
    }
  }

  document.querySelectorAll(".panel").forEach((panel) => {
    panel.addEventListener("pointermove", (event) => {
      const rect = panel.getBoundingClientRect();
      panel.style.setProperty("--spot-x", `${event.clientX - rect.left - 105}px`);
      panel.style.setProperty("--spot-y", `${event.clientY - rect.top - 105}px`);
      if (!reduceMotion && event.pointerType === "mouse") {
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        panel.style.transform = `perspective(900px) translateY(-3px) rotateX(${y * -1.5}deg) rotateY(${x * 1.5}deg)`;
      }
    });
    panel.addEventListener("pointerleave", () => {
      panel.style.removeProperty("--spot-x");
      panel.style.removeProperty("--spot-y");
      panel.style.removeProperty("transform");
    });
  });
}

export function animateNumber(element, target, formatter, { durationMs = 900, decimals = 0 } = {}) {
  if (!element) return;
  const value = Number(target);
  if (!Number.isFinite(value)) {
    element.textContent = formatter(null);
    element._motionValue = null;
    element._motionTarget = null;
    return;
  }

  if (element._motionTarget === value) {
    // A store can render once while a request is loading and again when it
    // settles. Keep an in-flight count-up alive when its target did not move.
    if (element._motionFrame) return;
    element.textContent = formatter(value);
    return;
  }

  const previous = Number.isFinite(element._motionValue) ? element._motionValue : 0;
  if (element._motionFrame) cancelAnimationFrame(element._motionFrame);
  if (Math.abs(previous - value) < 0.001) {
    element._motionTarget = value;
    element.textContent = formatter(value);
    return;
  }

  element._motionTarget = value;
  const startedAt = performance.now();
  element.classList.remove("is-counting");
  void element.offsetWidth;
  element.classList.add("is-counting");
  window.setTimeout(() => element.classList.remove("is-counting"), durationMs + 80);
  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = previous + (value - previous) * eased;
    element._motionValue = current;
    element.textContent = formatter(decimals ? Number(current.toFixed(decimals)) : Math.round(current));
    if (progress < 1) element._motionFrame = requestAnimationFrame(step);
    else element._motionFrame = null;
  };
  element._motionFrame = requestAnimationFrame(step);
}
