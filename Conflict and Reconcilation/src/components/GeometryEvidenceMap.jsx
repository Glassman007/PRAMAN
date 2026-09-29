import { computeGeometryViewport } from '../data/geometryViewport.js';

const WIDTH = 1000;
const HEIGHT = 560;

function ringPath(ring, project) {
  if (!ring?.length) return '';
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ') + ' Z';
}

function geometryPath(geometry, project) {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) => ringPath(ring, project)).join(' ');
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => ringPath(ring, project))).join(' ');
  }
  return '';
}

function segmentPath(segment, project) {
  if (!segment?.start || !segment?.end) return '';
  const [x1, y1] = project(segment.start);
  const [x2, y2] = project(segment.end);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function GeometryEvidenceMap({ entries, compact = false, discrepancy = null, sharedSegments = [] }) {
  const viewport = computeGeometryViewport(entries, WIDTH, HEIGHT);
  if (!viewport || !entries.length) return null;
  const { project } = viewport;
  const discrepancySegments = discrepancy?.highlightedSegments ?? [];

  return (
    <div className={`geometry-view${compact ? ' geometry-view--compact' : ''}`}>
      <div className="geometry-canvas" aria-label="Dataset geometry overlay">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Overlay of selected conflict geometries using normalized dataset coordinates">
          <rect className="geometry-map-bg" x="0" y="0" width={WIDTH} height={HEIGHT} />
          {entries.map((entry) => (
            <path
              key={entry.key}
              className={`geometry-shape geometry-shape--${entry.role}`}
              d={geometryPath(entry.geometry, project)}
              vectorEffect="non-scaling-stroke"
              fillRule="evenodd"
            />
          ))}
          {sharedSegments.map((segment, index) => (
            <path
              key={`shared:${segment.neighbourParcelId ?? 'parcel'}:${index}`}
              className="geometry-shared-edge"
              d={segmentPath(segment, project)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {discrepancySegments.map((segment, index) => (
            <path
              key={`discrepancy:${segment.geometryId ?? segment.role}:${index}`}
              className={`geometry-discrepancy-edge geometry-discrepancy-edge--${segment.role}`}
              d={segmentPath(segment, project)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      {(discrepancySegments.length > 0 || sharedSegments.length > 0) && (
        <div className="geometry-analysis-legend">
          {discrepancySegments.length > 0 && <span><i className="geometry-analysis-swatch geometry-analysis-swatch--discrepancy" />Largest source-edge separation indicator</span>}
          {sharedSegments.length > 0 && <span><i className="geometry-analysis-swatch geometry-analysis-swatch--shared" />Authoritative shared boundary</span>}
        </div>
      )}
      <div className="geometry-legend" aria-label="Displayed geometry legend">
        {entries.map((entry) => (
          <div className="geometry-legend-item" key={`legend:${entry.key}`}>
            <span className={`geometry-legend-swatch geometry-legend-swatch--${entry.role}`} />
            <div>
              <strong>{entry.label}</strong>
              <span>{entry.geometryId}{entry.crs ? ` · ${entry.crs}` : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
