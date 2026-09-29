<script>
  // Cerchio a matita attorno a "oggi". Il tratto varia un poco da giorno a giorno.
  let { seme = 1 } = $props();
  const v = (n) => ((Math.sin(seme * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  const d = $derived(`M${40 + v(1) * 4} ${5 + v(2) * 3} C ${10 + v(3) * 4} ${3 + v(4) * 3}, ${2 + v(5) * 3} ${26 + v(6) * 4}, ${8 + v(7) * 3} ${41 + v(8) * 3} C ${16 + v(9) * 4} ${57 + v(10) * 2}, ${56 + v(11) * 4} ${58 + v(12) * 2}, ${67 + v(13) * 3} ${38 + v(14) * 3} C ${75 + v(15) * 2} ${20 + v(16) * 3}, ${60 + v(17) * 3} ${4 + v(18) * 2}, ${33 + v(19) * 4} ${7 + v(20) * 3}`);
</script>

<svg class="cerchio" viewBox="0 0 78 62" aria-hidden="true"><path d={d} /></svg>

<style>
  .cerchio { position: absolute; pointer-events: none; overflow: visible; }
  path { fill: none; stroke: var(--spot); stroke-width: 2; stroke-linecap: round; }
</style>
