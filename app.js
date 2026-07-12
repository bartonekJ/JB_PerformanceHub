(() => {
  const tiles = document.querySelectorAll('.moduleTile');
  tiles.forEach((tile) => {
    tile.addEventListener('pointerdown', () => tile.classList.add('pressed'));
    tile.addEventListener('pointerup', () => tile.classList.remove('pressed'));
    tile.addEventListener('pointerleave', () => tile.classList.remove('pressed'));
  });
})();
