import "./style.css";
import { createCharacterControllerPrototype } from "./game/character-controller-prototype.js";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="app-shell">
    <div class="scene-host" data-scene></div>

    <div class="title-pill">Third-Person Controller Prototype</div>

    <aside class="hud-panel">
      <p class="hud-eyebrow">Movement prototype</p>
      <p class="hud-copy" data-status>Loading character...</p>
      <p class="hud-meta" data-asset>Asset: cyberpunk_character.glb | Clips: inspecting...</p>
      <p class="hud-error" data-error hidden></p>

      <div class="control-grid">
        <div class="control-card">
          <span class="control-label">Move</span>
          <span>WASD</span>
        </div>
        <div class="control-card">
          <span class="control-label">Run</span>
          <span>Hold Shift</span>
        </div>
        <div class="control-card">
          <span class="control-label">Jump</span>
          <span>Space</span>
        </div>
        <div class="control-card">
          <span class="control-label">Look</span>
          <span>Mouse</span>
        </div>
      </div>

      <div class="state-row">
        <span class="control-label">State</span>
        <span class="state-value" data-state>loading</span>
      </div>
    </aside>

    <div class="capture-prompt" data-prompt>
      <div class="capture-card">
        <p class="capture-title">Click to capture the mouse</p>
        <p class="capture-copy">
          Spawn into the test map, use WASD to move, hold Shift to run, and
          press Space to jump.
        </p>
      </div>
    </div>
  </main>
`;

const prototype = createCharacterControllerPrototype({
  assetText: app.querySelector("[data-asset]"),
  container: app.querySelector("[data-scene]"),
  errorText: app.querySelector("[data-error]"),
  prompt: app.querySelector("[data-prompt]"),
  stateText: app.querySelector("[data-state]"),
  statusText: app.querySelector("[data-status]"),
});

window.addEventListener("beforeunload", () => {
  prototype.dispose();
});
