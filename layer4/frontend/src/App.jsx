import ConflictExplorer from "./ConflictExplorer.jsx";

const RECONCILIATION_APP =
  import.meta.env.VITE_RECONCILIATION_URL ||
  "http://localhost:5173";

export default function App() {
  const openReconciliation = (parcelId) => {
    window.location.href =
      `${RECONCILIATION_APP}/?parcel=${encodeURIComponent(parcelId)}`;
  };

  return (
    <ConflictExplorer
      onOpenReconciliation={openReconciliation}
    />
  );
}