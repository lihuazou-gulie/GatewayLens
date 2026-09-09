import { DEFAULT_DISPLAY } from "../modules/configuration/domain/display.mjs";
import { DEFAULT_PROBE } from "../modules/probing/domain/policy.mjs";
import { JsonStateStore } from "../shared/infrastructure/persistence/json-store.mjs";
import { FileVault } from "../shared/infrastructure/crypto/vault.mjs";
const initialProbe = () => ({
  config: structuredClone(DEFAULT_PROBE),
  secret: null,
  generation: "initial",
});
export function initialSettings() {
  return {
    version: 2,
    admin: null,
    connection: null,
    display: structuredClone(DEFAULT_DISPLAY),
    probe: initialProbe(),
  };
}
export function migrateSettings(input) {
  const state = structuredClone(input);
  if (state.version === 1) {
    state.version = 2;
    state.probe = initialProbe();
  } else if (state.version !== 2) throw new Error("Unsupported settings version");
  if (
    !state.display ||
    !Array.isArray(state.display.groups) ||
    !state.probe ||
    typeof state.probe !== "object"
  )
    throw new Error("Invalid settings document");
  state.probe = {
    config: { ...structuredClone(DEFAULT_PROBE), ...state.probe.config },
    secret: state.probe.secret || null,
    generation: state.probe.generation || "initial",
  };
  return state;
}
export async function openPersistence(dir) {
  const vault = await new FileVault(dir).init();
  const store = await new JsonStateStore({
    dir,
    initialState: initialSettings,
    migrate: migrateSettings,
  }).init();
  return { store, vault };
}
