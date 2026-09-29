/* Orthographic line renderer for the bundled GLB; no external 3D library. */
(() => {
  const canvas = document.getElementById('cityModelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const asset = 'assets/city_wireframe_line_art.glb';
  const groups = [[], [], [], [], [], []];
  let limits = null;

  function parse(buffer) {
    const data = new DataView(buffer);
    if (data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2 ||
        data.getUint32(8, true) !== buffer.byteLength) throw new Error('Invalid GLB');
    const length = data.getUint32(12, true);
    const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
    const binary = 28 + length;
    const [position, color] = document.accessors;
    if (position.type !== 'VEC3' || position.componentType !== 5126 ||
        color.type !== 'VEC3' || color.componentType !== 5121 ||
        position.count !== color.count || position.count % 2) throw new Error('Unsupported line data');
    const positionOffset = binary + document.bufferViews[position.bufferView].byteOffset + (position.byteOffset || 0);
    const colorOffset = binary + document.bufferViews[color.bufferView].byteOffset + (color.byteOffset || 0);
    const projected = [];
    limits = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let vertex = 0; vertex < position.count; vertex++) {
      const index = positionOffset + vertex * 12;
      const x = data.getFloat32(index, true);
      const height = data.getFloat32(index + 4, true);
      const depth = data.getFloat32(index + 8, true);
      const y = .809016994 * height - .587785252 * depth;
      projected.push([x, y, height]);
      limits.minX = Math.min(limits.minX, x);
      limits.maxX = Math.max(limits.maxX, x);
      limits.minY = Math.min(limits.minY, y);
      limits.maxY = Math.max(limits.maxY, y);
    }
    for (let vertex = 0; vertex < position.count; vertex += 2) {
      const shade = data.getUint8(colorOffset + vertex * 3);
      const onGround = Math.max(projected[vertex][2], projected[vertex + 1][2]) < .12;
      groups[(shade > 140 ? 2 : shade > 55 ? 1 : 0) + (onGround ? 3 : 0)]
        .push([projected[vertex], projected[vertex + 1]]);
    }
    draw();
  }

  function draw() {
    if (!limits) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * ratio);
    canvas.height = Math.round(bounds.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    // Prioritize the skyline and building bases; allow the foreground streets to run off the card.
    const desktop = bounds.width > 620;
    const scale = Math.min((bounds.width * (desktop ? .74 : .97)) / (limits.maxX - limits.minX),
                           (bounds.height * .70) / limits.maxY);
    const centerX = (bounds.width - (limits.maxX - limits.minX) * scale) / 2
      - (desktop ? bounds.width * .075 : bounds.width * .035);
    const groundY = bounds.height * .76;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const colors = ['rgba(221,240,250,.99)', 'rgba(157,205,232,.9)', 'rgba(89,195,241,.88)',
                    'rgba(124,174,202,.41)', 'rgba(87,135,166,.35)', 'rgba(58,137,183,.43)'];
    groups.forEach((lines, group) => {
      ctx.strokeStyle = colors[group];
      ctx.lineWidth = group === 0 ? 1.1 : .8;
      ctx.beginPath();
      for (const [start, end] of lines) {
        const x0 = centerX + (start[0] - limits.minX) * scale;
        const y0 = groundY - start[1] * scale;
        const x1 = centerX + (end[0] - limits.minX) * scale;
        const y1 = groundY - end[1] * scale;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    });
  }

  async function load() {
    try {
      let buffer;
      if (location.protocol === 'file:') {
        const bytes = atob(window.PRAMAN_CITY_GLB_BASE64);
        const array = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
        buffer = array.buffer;
      } else {
        const response = await fetch(asset);
        if (!response.ok) throw new Error('Cannot load city model');
        buffer = await response.arrayBuffer();
      }
      parse(buffer);
    } catch (error) {
      console.error('City model could not be displayed:', error);
    }
  }
  new ResizeObserver(draw).observe(canvas);
  load();
})();
