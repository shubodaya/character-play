export function createInput() {
  const keys = new Set();

  const onDown = (event) => keys.add(event.code);
  const onUp = (event) => keys.delete(event.code);

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  return {
    isDown(code) {
      return keys.has(code);
    },
    dispose() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    }
  };
}
