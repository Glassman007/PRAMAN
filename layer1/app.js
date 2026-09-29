(() => {
  let adapter = null;
  const $ = (id) => document.getElementById(id);

  const els = {
    search: $('searchInput'),
    filterToggle: $('filterToggle'),
    filterPanel: $('filterPanel'),
    cell: $('cellFilter'),
    landUse: $('landUseFilter'),
    area: $('areaFilter'),
    clear: $('clearFilters'),
    total: $('totalParcels'),
    integrated: $('integratedParcels'),
    conflicts: $('conflictParcels'),
    review: $('reviewParcels'),
    reviewed: $('reviewedParcels'),
    cleared: $('clearedParcels'),
    clock: $('localTime'),
    sourceItems: $('sourceItems'),
    datasetStatus: $('datasetStatus')
  };

  const normalize = (value) => String(value ?? '').trim().toLowerCase();

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function setSelectOptions(select, values, allLabel, unavailableLabel) {
    if (!values.length) {
      select.innerHTML = `<option value="">${unavailableLabel}</option>`;
      select.disabled = true;
      return;
    }

    select.disabled = false;
    select.innerHTML = `<option value="">${allLabel}</option>` + values
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join('');
  }

  function initializeFilters() {
    const options = adapter?.filterOptions || { cells: [], landUses: [], areas: [] };

    setSelectOptions(els.cell, options.cells, 'All cells', 'No cell values');
    setSelectOptions(els.landUse, options.landUses, 'All land uses', 'No land-use values');
    setSelectOptions(els.area, options.areas, 'All localities', 'No locality values');
  }

  function parcelMatches(parcel) {
    const query = normalize(els.search.value);
    if (query && !parcel.searchText.includes(query)) return false;
    if (els.cell.value && parcel.cell !== els.cell.value) return false;
    if (els.landUse.value && parcel.landUse !== els.landUse.value) return false;
    if (els.area.value && parcel.area !== els.area.value) return false;

    return true;
  }

  function renderSourceCoverage(parcels) {
    if (!els.sourceItems || !adapter) return;
    const fragment = document.createDocumentFragment();
    const visibleIds = new Set(parcels.map((parcel) => parcel.parcelId));

    adapter.sources.forEach((source) => {
      const item = document.createElement('div');
      item.className = 'source-item';
      const dot = document.createElement('span');
      dot.className = 'source-dot';
      const label = document.createElement('span');
      label.textContent = source.label;
      const count = document.createElement('strong');
      const visibleCount = parcels.filter((parcel) => parcel.sources.includes(source.key)).length;
      count.textContent = visibleCount.toLocaleString();
      item.title = `${source.recordCount.toLocaleString()} observations/records in PRAMAN_DATA`;
      item.append(dot, label, count);
      fragment.append(item);
    });

    els.sourceItems.replaceChildren(fragment);
  }

  function createStatusRows(container, rows) {
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => {
      const item = document.createElement('div');
      item.className = `status-row${row.overall ? ' status-row-overall' : ''}`;

      const label = document.createElement('span');
      label.textContent = row.label;
      const status = document.createElement('span');
      status.className = 'status-value';
      status.textContent = row.status;

      item.append(label, status);
      fragment.append(item);
    });
    container.replaceChildren(fragment);
  }

  function initializeFooterMenus() {
    createStatusRows($('dataSourceRows'), (adapter?.sources || []).map((source) => ({
      label: source.label,
      status: `${source.activeParcelCount.toLocaleString()} active parcels`
    })));

    document.querySelectorAll('.status-menu-wrapper').forEach((wrapper) => {
      const trigger = wrapper.querySelector('[aria-expanded]');
      const setOpen = (open) => {
        wrapper.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
      };

      wrapper.addEventListener('pointerenter', () => setOpen(true));
      wrapper.addEventListener('pointerleave', () => setOpen(false));
      wrapper.addEventListener('focusin', () => setOpen(true));
      wrapper.addEventListener('focusout', (event) => {
        if (!wrapper.contains(event.relatedTarget)) setOpen(false);
      });
      wrapper.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        setOpen(false);
        trigger.blur();
      });
    });
  }

  function initializeClock() {
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const updateClock = () => {
      const now = new Date();
      els.clock.textContent = formatter.format(now);
      els.clock.dateTime = now.toISOString();
    };

    updateClock();
    const timerId = window.setInterval(updateClock, 1000);
    window.addEventListener('pagehide', () => window.clearInterval(timerId), { once: true });
  }

  function mountIndiaMap() {
    const mount = $('india-map-root');
    if (!mount || !window.React || !window.ReactDOM) {
      if (mount) mount.textContent = 'India boundary unavailable';
      return;
    }

    const { createElement: h, useEffect, useMemo, useRef, useState } = window.React;
    const VIEW_WIDTH = 320;
    const VIEW_HEIGHT = 350;
    const datasetMarker = Array.isArray(adapter?.mapCenter) ? adapter.mapCenter : null;
    const datasetMarkerLabel = adapter?.mapLabel || 'PRAMAN dataset';
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 5;

    function geometryRings(geometry) {
      if (geometry?.type === 'Polygon') return geometry.coordinates;
      if (geometry?.type === 'MultiPolygon') return geometry.coordinates.flat();
      return [];
    }

    function clampTransform(next) {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.scale));
      const minX = VIEW_WIDTH * (1 - scale);
      const minY = VIEW_HEIGHT * (1 - scale);
      return {
        scale,
        x: Math.min(0, Math.max(minX, next.x)),
        y: Math.min(0, Math.max(minY, next.y))
      };
    }

    function IndiaMap() {
      const [geoJson, setGeoJson] = useState(window.INDIA_STATES || null);
      const [failed, setFailed] = useState(false);
      const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
      const dragRef = useRef(null);

      useEffect(() => {
        if (!window.INDIA_STATES) setFailed(true);
      }, []);

      const scene = useMemo(() => {
        const features = geoJson?.features || [];
        const rings = features.flatMap((feature) => geometryRings(feature.geometry));
        const points = rings.flat();
        if (!points.length) return null;

        const longitudes = points.map(([longitude]) => longitude);
        const latitudes = points.map(([, latitude]) => latitude);
        const bounds = {
          minX: Math.min(...longitudes),
          maxX: Math.max(...longitudes),
          minY: Math.min(...latitudes),
          maxY: Math.max(...latitudes)
        };
        const padding = 8;
        const scale = Math.min(
          (VIEW_WIDTH - padding * 2) / (bounds.maxX - bounds.minX),
          (VIEW_HEIGHT - padding * 2) / (bounds.maxY - bounds.minY)
        );
        const offsetX = (VIEW_WIDTH - (bounds.maxX - bounds.minX) * scale) / 2;
        const offsetY = (VIEW_HEIGHT - (bounds.maxY - bounds.minY) * scale) / 2;

        const project = ([longitude, latitude]) => [
          offsetX + (longitude - bounds.minX) * scale,
          offsetY + (bounds.maxY - latitude) * scale
        ];
        const ringPath = (ring) => ring.map((point, index) => {
          const [x, y] = project(point);
          return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(' ') + ' Z';

        return {
          paths: features.map((feature, index) => ({
            key: feature.properties?.ST_NM || feature.properties?.name || index,
            path: geometryRings(feature.geometry).map(ringPath).join(' ')
          })),
          datasetPoint: datasetMarker ? project(datasetMarker) : null
        };
      }, [geoJson]);

      const zoomAt = (factor, anchor = { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 }) => {
        setTransform((current) => {
          const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor));
          if (nextScale === current.scale) return current;
          const ratio = nextScale / current.scale;
          return clampTransform({
            scale: nextScale,
            x: anchor.x - (anchor.x - current.x) * ratio,
            y: anchor.y - (anchor.y - current.y) * ratio
          });
        });
      };

      const resetView = () => setTransform({ scale: 1, x: 0, y: 0 });

      const focusDataset = () => {
        if (!scene) return;
        const targetScale = 3.4;
        setTransform(clampTransform({
          scale: targetScale,
          x: scene.datasetPoint ? VIEW_WIDTH / 2 - scene.datasetPoint[0] * targetScale : 0,
          y: scene.datasetPoint ? VIEW_HEIGHT / 2 - scene.datasetPoint[1] * targetScale : 0
        }));
      };

      const onWheel = (event) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const anchor = {
          x: ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH,
          y: ((event.clientY - rect.top) / rect.height) * VIEW_HEIGHT
        };
        zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, anchor);
      };

      const onPointerDown = (event) => {
        if (transform.scale <= 1) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          x: transform.x,
          y: transform.y
        };
      };

      const onPointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = (event.clientX - drag.clientX) * VIEW_WIDTH / rect.width;
        const dy = (event.clientY - drag.clientY) * VIEW_HEIGHT / rect.height;
        setTransform(clampTransform({ scale: transform.scale, x: drag.x + dx, y: drag.y + dy }));
      };

      const endDrag = (event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      };

      const onKeyDown = (event) => {
        if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          zoomAt(1.22);
        } else if (event.key === '-') {
          event.preventDefault();
          zoomAt(1 / 1.22);
        } else if (event.key === '0' || event.key === 'Escape') {
          event.preventDefault();
          resetView();
        }
      };

      if (failed) return h('div', { className: 'map-message' }, 'India boundary unavailable');
      if (!scene) return h('div', { className: 'map-message' }, 'Loading India boundary…');

      const markerSize = 5.5 / transform.scale;
      const markerHeight = 9 / transform.scale;
      const labelSize = 8.5 / transform.scale;
      const [markerX, markerY] = scene.datasetPoint || [null, null];

      return h('div', { className: 'india-map-interactive' },
        h('svg', {
          className: `india-map-svg${dragRef.current ? ' is-dragging' : ''}`,
          viewBox: `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`,
          preserveAspectRatio: 'xMidYMid meet',
          role: 'img',
          tabIndex: 0,
          'aria-labelledby': 'indiaMapTitle indiaMapDescription',
          onWheel,
          onPointerDown,
          onPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onKeyDown
        },
          h('title', { id: 'indiaMapTitle' }, 'Interactive administrative map of India'),
          h('desc', { id: 'indiaMapDescription' }, 'Drag the map after zooming, use the zoom controls or mouse wheel, and select the dataset marker to focus the dataset area.'),
          h('g', { transform: `translate(${transform.x} ${transform.y}) scale(${transform.scale})` },
            h('g', { className: 'india-map-geography' }, scene.paths.map((item) => h('path', {
              key: item.key,
              d: item.path,
              vectorEffect: 'non-scaling-stroke'
            }))),
            h('g', {
              className: 'delhi-marker',
              role: 'button',
              tabIndex: 0,
              'aria-label': `${datasetMarkerLabel} — focus map`,
              onClick: (event) => { event.stopPropagation(); focusDataset(); },
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  focusDataset();
                }
              }
            },
              scene.datasetPoint ? h('circle', { cx: markerX, cy: markerY, r: 8 / transform.scale, className: 'delhi-marker-hit' }) : null,
              scene.datasetPoint ? h('polygon', {
                points: `${markerX},${markerY - markerHeight} ${markerX - markerSize},${markerY + markerSize} ${markerX + markerSize},${markerY + markerSize}`,
                className: 'delhi-marker-triangle',
                vectorEffect: 'non-scaling-stroke'
              }) : null,
              scene.datasetPoint ? h('text', {
                x: markerX + 8 / transform.scale,
                y: markerY - 3 / transform.scale,
                className: 'delhi-marker-label',
                style: { fontSize: `${labelSize}px` }
              }, datasetMarkerLabel) : null
            )
          )
        ),
        h('div', { className: 'map-zoom-controls', 'aria-label': 'Map zoom controls' },
          h('button', { type: 'button', onClick: () => zoomAt(1.24), 'aria-label': 'Zoom in', title: 'Zoom in' }, '+'),
          h('button', { type: 'button', onClick: () => zoomAt(1 / 1.24), 'aria-label': 'Zoom out', title: 'Zoom out' }, '−'),
          h('button', { type: 'button', onClick: resetView, 'aria-label': 'Reset India map', title: 'Reset map' }, '⌂')
        )
      );
    }

    window.ReactDOM.createRoot(mount).render(h(IndiaMap));
  }

  function render() {
    if (!adapter) return;

    const visible = adapter.parcels.filter(parcelMatches);

    const dashboardMetrics = adapter.calculateDashboardMetrics(visible);
    els.total.textContent = dashboardMetrics.totalParcels.toLocaleString();
    els.conflicts.textContent = dashboardMetrics.conflictedParcels.toLocaleString();
    els.integrated.textContent = dashboardMetrics.integrated.toLocaleString();
    els.review.textContent = dashboardMetrics.needsReview.toLocaleString();
    els.reviewed.textContent = dashboardMetrics.reviewed.toLocaleString();
    els.cleared.textContent = dashboardMetrics.cleared.toLocaleString();
    renderSourceCoverage(visible);
  }

  els.filterToggle.addEventListener('click', () => {
    const collapsed = els.filterPanel.classList.toggle('collapsed');
    els.filterToggle.setAttribute('aria-expanded', String(!collapsed));
  });

  [els.search, els.cell, els.landUse, els.area].forEach((control) => {
    control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render);
  });

  els.clear.addEventListener('click', () => {
    els.search.value = '';
    [els.cell, els.landUse, els.area].forEach((select) => {
      select.value = '';
    });
    render();
  });

  const information = {
    contact: ['Contact Us', 'Contact details have not been configured for this project.'],
    terms: ['Terms of Use and Service', 'Layer 1 reads its dashboard state from the project PRAMAN_DATA directory at runtime. Project-specific legal terms have not been supplied.']
  };
  function showInfo(key) {
    const [title, body] = information[key];
    $('infoTitle').textContent = title;
    $('infoBody').textContent = body;
    $('infoDialog').showModal();
  }
  document.querySelectorAll('[data-info]').forEach(button => button.addEventListener('click', () => showInfo(button.dataset.info)));
  document.querySelector('.dialog-close').addEventListener('click', () => $('infoDialog').close());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') document.querySelector('.architecture-menu').open = false; });
  document.addEventListener('click', event => { if (!event.target.closest('.architecture-menu')) document.querySelector('.architecture-menu').open = false; });
  initializeClock();
  els.datasetStatus.textContent = 'Loading PRAMAN_DATA…';

  window.PRAMAN_DATA_READY.then((loadedAdapter) => {
    adapter = loadedAdapter;
    window.PARCEL_ADAPTER = loadedAdapter;
    initializeFilters();
    initializeFooterMenus();
    mountIndiaMap();
    render();
    els.datasetStatus.textContent = `Live dataset: ${loadedAdapter.counts.activeCanonical.toLocaleString()} active canonical parcels`;
    els.datasetStatus.classList.add('is-ready');
  }).catch((error) => {
    console.error(error);
    els.datasetStatus.textContent = 'PRAMAN_DATA could not be loaded. Start Layer 1 from the project root (the folder that contains both layer1 and PRAMAN_DATA).';
    els.datasetStatus.classList.add('is-error');
    [els.total, els.conflicts, els.integrated, els.review, els.reviewed, els.cleared].forEach((node) => { node.textContent = '—'; });
    mountIndiaMap();
  });
})();
