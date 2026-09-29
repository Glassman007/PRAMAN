/* The card is a sparse 2D projection of the evidenceGraph metadata in the bundled GLB. */
(() => {
  const canvas = document.getElementById('evidenceCardCanvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const selected = new Set([
    'survey', 'cadastre', 'spatial_join', 'municipal', 'record_join',
    'quality_check', 'boundary_a', 'disagreement', 'human_review',
    'evidence_hub', 'evidence'
  ]);
  const palette = {
    corroborated: '#56cfa2', uncertain: '#ed9b55', conditional: '#ed9b55',
    conflict: '#e66772', review: '#f0af72', integrated: '#84bbce', result: '#ead29a'
  };
  let graph = window.PRAMAN_EVIDENCE_GRAPH;

  function star(x, y, outer, color, opacity) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? outer * .46 : outer;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!graph) return;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const nodes = graph.nodes.filter(node => selected.has(node.id));
    const lookup = Object.fromEntries(nodes.map(node => [node.id, node]));
    const scale = Math.min((width - 42) / 4.85, (height - 46) / 2.65);
    const point = node => [21 + (node.x + 2.84) * scale, 22 + (1.45 - node.y) * scale];
    ctx.lineCap = 'round';
    graph.edges.forEach(edge => {
      const a = lookup[edge.source], b = lookup[edge.target];
      if (!a || !b) return;
      const [x1,y1] = point(a), [x2,y2] = point(b);
      const length = Math.hypot(x2-x1,y2-y1);
      const pad1 = a.id === 'evidence_hub' ? 8 : 5;
      const pad2 = b.id === 'evidence' ? 11 : b.id === 'evidence_hub' ? 8 : 5;
      const sx=x1+(x2-x1)*pad1/length, sy=y1+(y2-y1)*pad1/length;
      const ex=x2-(x2-x1)*pad2/length, ey=y2-(y2-y1)*pad2/length;
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);
      ctx.setLineDash(edge.kind === 'conflict' || edge.kind === 'conditional' ? [3,4] : []);
      ctx.strokeStyle=palette[edge.kind];ctx.globalAlpha=edge.kind === 'conflict' ? .36 : .32;
      ctx.lineWidth=1;ctx.stroke();ctx.globalAlpha=1;
    });
    ctx.setLineDash([]);
    nodes.forEach(node => {
      const [x,y] = point(node);
      const size = node.id === 'evidence' ? 11 : node.id === 'evidence_hub' ? 8 : 4.7;
      star(x,y,size,palette[node.kind],node.id === 'evidence' ? .9 : .73);
    });
  }

  async function load() {
    if (location.protocol !== 'file:') {
      try {
        const response = await fetch('assets/interconnected_microstructure_star.glb');
        if (response.ok) {
          const bytes = await response.arrayBuffer();
          const view = new DataView(bytes);
          if (view.getUint32(0,true) === 0x46546c67 && view.getUint32(4,true) === 2) {
            const jsonSize = view.getUint32(12,true);
            const document = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonSize)));
            graph = document.scenes[document.scene || 0].extras.evidenceGraph;
          }
        }
      } catch (error) { /* The bundled snapshot also supports direct file opening. */ }
    }
    draw();
  }
  new ResizeObserver(draw).observe(canvas);
  load();
})();
