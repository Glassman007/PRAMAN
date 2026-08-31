(() => {
  const adapter = window.PARCEL_ADAPTER;
  const $ = (id) => document.getElementById(id);
  const navigationTargets = {
  map: '../layer2/index.html',

  conflicts: 'http://localhost:5174/',

  reconciliation: 'http://localhost:5173/',

  disaster: '../layer2/index.html?layers=flood&impact=1',

  timeline: 'http://localhost:5175/timeline/',

  'field-survey': `http://localhost:3606/?returnTo=${encodeURIComponent(window.location.href)}`
};

  const SYSTEM_HEALTH = [
    { label: 'API', status: 'Operational' },
    { label: 'Dataset Adapter', status: 'Operational' },
    { label: 'Geometry Engine', status: 'Operational' },
    { label: 'Reconciliation Service', status: 'Operational' },
    { label: 'Timeline Service', status: 'Operational' },
    { label: 'Overall', status: 'Healthy', overall: true }
  ];

  const PRIMARY_DATA_SOURCES = [
    { key: 'revenue', label: 'Revenue / Land Records' },
    { key: 'registration', label: 'Registration & Stamps' },
    { key: 'survey', label: 'Survey / Cadastral' },
    { key: 'ulb', label: 'Urban Local Body (MCD)' },
    { key: 'planning', label: 'Urban Planning (DDA)' }
  ];

  const els = {
    datasetState: $('datasetState'),
    datasetStateText: $('datasetStateText'),
    search: $('searchInput'),
    filterToggle: $('filterToggle'),
    filterPanel: $('filterPanel'),
    country: $('countryFilter'),
    state: $('stateFilter'),
    area: $('areaFilter'),
    harmonization: $('harmonizationFilter'),
    clear: $('clearFilters'),
    total: $('totalParcels'),
    integrated: $('integratedParcels'),
    conflicts: $('conflictParcels'),
    review: $('reviewParcels'),
    reviewed: $('reviewedParcels'),
    cleared: $('clearedParcels'),
    conflictBreakdown: $('conflictBreakdown'),
    clock: $('localTime'),
    high: $('highConfidence'),
    medium: $('mediumConfidence'),
    low: $('lowConfidence'),
    sources: {
      revenue: $('srcRevenue'),
      survey: $('srcSurvey'),
      registration: $('srcRegistration'),
      ulb: $('srcUlb'),
      planning: $('srcPlanning')
    }
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
    const options = adapter?.filterOptions || { countries: [], states: [], areas: [], hasHarmonizationDates: false };

    setSelectOptions(els.country, options.countries, 'All countries', 'Not recorded in dataset');
    setSelectOptions(els.state, options.states, 'All states', 'Not recorded in dataset');
    setSelectOptions(els.area, options.areas, 'All areas', 'No area values');

    if (!options.hasHarmonizationDates) {
      els.harmonization.innerHTML = '<option value="">No timestamp in dataset</option>';
      els.harmonization.disabled = true;
    }
  }

  function parcelMatches(parcel) {
    const query = normalize(els.search.value);
    if (query && !parcel.searchText.includes(query)) return false;
    if (els.country.value && parcel.country !== els.country.value) return false;
    if (els.state.value && parcel.state !== els.state.value) return false;
    if (els.area.value && parcel.area !== els.area.value) return false;

    if (els.harmonization.value) {
      if (!parcel.lastHarmonization) return false;
      const date = new Date(parcel.lastHarmonization);
      if (Number.isNaN(date.getTime())) return false;
      const ageMs = Date.now() - date.getTime();
      if (ageMs < 0 || ageMs > Number(els.harmonization.value) * 86400000) return false;
    }

    return true;
  }

  function renderSourceCoverage(parcels) {
    adapter.requiredSources.forEach((source) => {
      const count = parcels.filter((parcel) => parcel.sources.includes(source)).length;
      els.sources[source].textContent = count.toLocaleString();

      const quality = adapter.sourceQuality[source];
      if (!quality) return;
      const verified = quality.field_verified_or_doc_verified;
      const records = quality.records;
      els.sources[source].title = Number.isFinite(verified)
        ? `${verified}/${records} source records verified in the supplied dataset`
        : `${records} source records in the supplied dataset`;
    });
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
    createStatusRows($('systemHealthRows'), SYSTEM_HEALTH);

    const availableSources = new Set(adapter?.requiredSources || []);
    createStatusRows($('dataSourceRows'), PRIMARY_DATA_SOURCES.map((source) => ({
      label: source.label,
      status: availableSources.has(source.key) ? 'Connected' : 'Unavailable'
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

  function mountNavigationVisuals() {
    if (!window.React || !window.ReactDOM) return;

    const { createElement: h } = window.React;

    function VisualFrame({ type }) {
      const common = {
        className: `nav-visual-svg nav-visual-${type}`,
        viewBox: '0 0 120 58',
        preserveAspectRatio: 'xMidYMid meet',
        focusable: 'false',
        'aria-hidden': 'true'
      };

      const line = (key, x1, y1, x2, y2, className = 'visual-line') => h('line', { key, x1, y1, x2, y2, className });
      const polygon = (key, points, className = 'visual-shape') => h('polygon', { key, points, className });
      const circle = (key, cx, cy, r, className = 'visual-node') => h('circle', { key, cx, cy, r, className });

      if (type === 'map') {
        return h('svg', common,
          h('g', { className: 'visual-grid' }, [
            line('g1', 18, 8, 18, 50), line('g2', 42, 8, 42, 50), line('g3', 66, 8, 66, 50), line('g4', 90, 8, 90, 50),
            line('g5', 8, 18, 112, 18), line('g6', 8, 34, 112, 34)
          ]),
          polygon('p1', '14,12 40,10 43,31 18,34', 'visual-shape visual-shape-soft'),
          polygon('p2', '45,11 73,13 68,33 43,31', 'visual-shape'),
          polygon('p3', '70,34 103,30 108,48 74,50', 'visual-shape visual-shape-highlight'),
          h('path', { d: 'M20 42 C39 35, 52 45, 66 38 S93 38, 104 20', className: 'visual-route' })
        );
      }

      if (type === 'conflicts') {
        return h('svg', common,
          polygon('base', '18,12 70,10 78,42 26,46', 'visual-shape visual-shape-soft'),
          polygon('conflict', '48,18 98,14 104,42 56,48', 'visual-shape visual-conflict-shape'),
          h('path', { d: 'M53 19 L72 17 L77 42 L58 45 Z', className: 'visual-conflict-zone' }),
          circle('n1', 72, 30, 3.2, 'visual-node visual-node-alert'),
          line('c1', 72, 23, 72, 30, 'visual-alert-line')
        );
      }

      if (type === 'reconciliation') {
        return h('svg', common,
          polygon('left', '10,14 42,11 45,43 13,46', 'visual-shape visual-shape-soft'),
          polygon('right', '78,12 110,15 106,45 76,42', 'visual-shape visual-shape-soft'),
          polygon('mid', '48,16 73,16 75,42 47,42', 'visual-shape visual-shape-highlight'),
          h('path', { d: 'M39 28 H51 M47 24 L52 28 L47 32', className: 'visual-route' }),
          h('path', { d: 'M82 28 H70 M74 24 L69 28 L74 32', className: 'visual-route' }),
          circle('ok', 61, 29, 7, 'visual-node visual-node-core'),
          h('path', { d: 'M57 29 L60 32 L65 26', className: 'visual-check' })
        );
      }

      if (type === 'disaster') {
        return h('svg', common,
          polygon('parcel', '16,10 103,12 106,47 20,49', 'visual-shape visual-shape-soft'),
          h('path', { d: 'M8 34 C22 25 34 42 49 33 S78 25 92 35 S108 39 116 32 L116 56 L8 56 Z', className: 'visual-flood' }),
          circle('risk1', 36, 24, 4, 'visual-node visual-node-alert'),
          circle('risk2', 82, 22, 3, 'visual-node visual-node-alert'),
          h('path', { d: 'M34 24 l2 -6 l2 6 z', className: 'visual-alert-triangle' })
        );
      }

      if (type === 'field-survey') {
        return h('svg', common,
          polygon('parcel', '18,13 91,10 105,39 72,49 24,43', 'visual-shape visual-shape-soft'),
          h('path', { d: 'M25 39 L34 20 L59 16 L91 23 L98 38 L72 45 Z', className: 'visual-field-boundary' }),
          circle('fp1', 34, 20, 2.7, 'visual-field-point'),
          circle('fp2', 59, 16, 2.7, 'visual-field-point'),
          circle('fp3', 91, 23, 2.7, 'visual-field-point'),
          circle('fp4', 98, 38, 2.7, 'visual-field-point'),
          circle('fp5', 72, 45, 2.7, 'visual-field-point'),
          circle('surveyor', 52, 31, 5.4, 'visual-surveyor'),
          h('path', { d: 'M52 25 L52 18 M48 22 L52 18 L56 22', className: 'visual-route' })
        );
      }

      return h('svg', common,
        line('timeline', 10, 29, 110, 29, 'visual-route'),
        circle('t1', 18, 29, 4, 'visual-node'),
        circle('t2', 45, 29, 4, 'visual-node'),
        circle('t3', 74, 29, 4, 'visual-node'),
        circle('t4', 103, 29, 5, 'visual-node visual-node-core'),
        polygon('s1', '11,10 28,9 30,21 13,22', 'visual-shape visual-shape-soft'),
        polygon('s2', '38,38 51,36 55,49 40,50', 'visual-shape visual-shape-soft'),
        polygon('s3', '67,9 82,11 81,22 65,21', 'visual-shape visual-shape-highlight'),
        h('path', { d: 'M98 11 L103 7 L108 11', className: 'visual-route' })
      );
    }

    document.querySelectorAll('.nav-visual-root').forEach((mount) => {
      const type = mount.dataset.visual;
      if (!type) return;
      window.ReactDOM.createRoot(mount).render(h(VisualFrame, { type }));
    });
  }

  function mountIndiaMap() {
    const mount = $('india-map-root');
    if (!mount || !window.React || !window.ReactDOM) {
      if (mount) mount.textContent = 'India boundary unavailable';
      return;
    }

    const { createElement: h, useEffect, useMemo, useRef, useState } = window.React;
    const VIEW_WIDTH = 320;
    const VIEW_HEIGHT = 190;
    const DELHI = [77.2090, 28.6139];
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
      const [geoJson, setGeoJson] = useState(null);
      const [failed, setFailed] = useState(false);
      const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
      const dragRef = useRef(null);

      useEffect(() => {
        const controller = new AbortController();
        fetch('assets/india-states-simplified.geojson', { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`India boundary request failed (${response.status})`);
            return response.json();
          })
          .then(setGeoJson)
          .catch((error) => {
            if (error.name !== 'AbortError') {
              console.error('[Layer 1 map]', error);
              setFailed(true);
            }
          });
        return () => controller.abort();
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
          delhi: project(DELHI)
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

      const focusDelhi = () => {
        if (!scene) return;
        const targetScale = 3.4;
        setTransform(clampTransform({
          scale: targetScale,
          x: VIEW_WIDTH / 2 - scene.delhi[0] * targetScale,
          y: VIEW_HEIGHT / 2 - scene.delhi[1] * targetScale
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
      const [delhiX, delhiY] = scene.delhi;

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
          h('desc', { id: 'indiaMapDescription' }, 'Drag the map after zooming, use the zoom controls or mouse wheel, and select the Delhi triangle to focus Delhi.'),
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
              'aria-label': 'Delhi — focus map',
              onClick: (event) => { event.stopPropagation(); focusDelhi(); },
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  focusDelhi();
                }
              }
            },
              h('circle', { cx: delhiX, cy: delhiY, r: 8 / transform.scale, className: 'delhi-marker-hit' }),
              h('polygon', {
                points: `${delhiX},${delhiY - markerHeight} ${delhiX - markerSize},${delhiY + markerSize} ${delhiX + markerSize},${delhiY + markerSize}`,
                className: 'delhi-marker-triangle',
                vectorEffect: 'non-scaling-stroke'
              }),
              h('text', {
                x: delhiX + 8 / transform.scale,
                y: delhiY - 3 / transform.scale,
                className: 'delhi-marker-label',
                style: { fontSize: `${labelSize}px` }
              }, 'Delhi')
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
    if (!adapter || !adapter.parcels.length) {
      els.datasetState.classList.remove('ready');
      els.datasetState.classList.add('empty');
      els.datasetStateText.textContent = 'Dataset not mounted';
      return;
    }

    const visible = adapter.parcels.filter(parcelMatches);
    const confidenceCounts = { high: 0, medium: 0, low: 0 };
    visible.forEach((parcel) => {
      if (parcel.confidence) confidenceCounts[parcel.confidence] += 1;
    });

    const dashboardMetrics = adapter.calculateDashboardMetrics(visible);
    const autoReconcilableCount = visible.filter((parcel) => parcel.autoReconcilable).length;

    els.datasetState.classList.remove('empty');
    els.datasetState.classList.add('ready');
    els.datasetStateText.textContent = `${adapter.rawCount.toLocaleString()} source records • ${adapter.parcels.length.toLocaleString()} canonical parcels`;

    els.total.textContent = dashboardMetrics.totalParcels.toLocaleString();
    els.conflicts.textContent = dashboardMetrics.conflictedParcels.toLocaleString();
    els.integrated.textContent = dashboardMetrics.integrated.toLocaleString();
    els.review.textContent = dashboardMetrics.needsReview.toLocaleString();
    els.reviewed.textContent = dashboardMetrics.reviewed.toLocaleString();
    els.cleared.textContent = dashboardMetrics.cleared.toLocaleString();
    els.conflictBreakdown.textContent = dashboardMetrics.conflictedParcels
      ? `${autoReconcilableCount.toLocaleString()} recommendation-ready • ${dashboardMetrics.needsReview.toLocaleString()} expert review`
      : 'No cross-source discrepancies in the current view';

    els.high.textContent = confidenceCounts.high.toLocaleString();
    els.medium.textContent = confidenceCounts.medium.toLocaleString();
    els.low.textContent = confidenceCounts.low.toLocaleString();

    renderSourceCoverage(visible);
  }

  els.filterToggle.addEventListener('click', () => {
    const collapsed = els.filterPanel.classList.toggle('collapsed');
    els.filterToggle.setAttribute('aria-expanded', String(!collapsed));
  });

  [els.search, els.country, els.state, els.area, els.harmonization].forEach((control) => {
    control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render);
  });

  els.clear.addEventListener('click', () => {
    els.search.value = '';
    [els.country, els.state, els.area, els.harmonization].forEach((select) => {
      select.value = '';
    });
    render();
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const target = navigationTargets[item.dataset.page];
      if (target) {
        window.location.href = target;
        return;
      }

      document.querySelectorAll('.nav-item').forEach((navItem) => navItem.classList.remove('active'));
      item.classList.add('active');
    });
  });

  initializeFilters();
  initializeFooterMenus();
  initializeClock();
  mountNavigationVisuals();
  mountIndiaMap();
  render();
})();
