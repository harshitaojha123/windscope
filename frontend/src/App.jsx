import { useEffect, useMemo, useState } from "react";

const API_BASE = "https://windscope-1.onrender.com";

const styles = {
  app: { display: "flex", minHeight: "100vh", background: "#f3f6fb", color: "#14243b", fontFamily: "Inter, Arial, sans-serif" },
  sidebar: { width: 245, background: "#101b2e", color: "#fff", padding: "28px 20px", boxSizing: "border-box", flexShrink: 0 },
  main: { flex: 1, minWidth: 0, padding: "32px 36px", overflowX: "hidden" },
  muted: { color: "#73839c", fontSize: 13 },
  card: { background: "#fff", border: "1px solid #e1e8f2", borderRadius: 14, padding: 22, boxSizing: "border-box" },
  button: { background: "#078779", color: "#fff", border: 0, borderRadius: 9, padding: "12px 17px", fontWeight: 600, cursor: "pointer" },
  input: { padding: "11px", border: "1px solid #dce4ef", borderRadius: 8, background: "#fff", color: "#172a45" },
};

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-GB", { maximumFractionDigits: digits });
}

function downloadCsv(rows) {
  const columns = ["startTime", "publishTime", "actualMW", "forecastMW", "errorMW", "absoluteErrorMW"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => quote(row[column])).join(",")),
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "windscope-january-2026.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function LineChart({ rows }) {
  const valid = rows.filter(
    (row) => row.actualMW != null && row.forecastMW != null
  );

  if (!valid.length) {
    return (
      <div style={{ padding: 36, textAlign: "center", color: "#73839c" }}>
        No matched actual and forecast intervals are available yet.
      </div>
    );
  }

  const width = 900;
  const height = 300;
  const padding = 42;
  const values = valid.flatMap((row) => [row.actualMW, row.forecastMW]);
  const min = Math.min(0, ...values);
  const max = Math.max(...values) * 1.05 || 1;

  const point = (value, index) => {
    const x = padding + (index / Math.max(1, valid.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / (max - min || 1)) * (height - padding * 2);
    return `${x},${y}`;
  };

  const actualPoints = valid.map((row, index) => point(row.actualMW, index)).join(" ");
  const forecastPoints = valid.map((row, index) => point(row.forecastMW, index)).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 520, display: "block" }} role="img" aria-label="Actual versus forecast wind generation">
        {[0, 1, 2, 3, 4].map((step) => {
          const y = padding + step * ((height - padding * 2) / 4);
          const value = max - step * (max - min) / 4;
          return (
            <g key={step}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e5ebf4" strokeDasharray="4 4" />
              <text x={padding - 8} y={y + 4} fontSize="11" fill="#73839c" textAnchor="end">{Math.round(value / 1000)}k</text>
            </g>
          );
        })}
        <polyline points={actualPoints} fill="none" stroke="#287be0" strokeWidth="2.4" />
        <polyline points={forecastPoints} fill="none" stroke="#e49b37" strokeWidth="2.4" />
      </svg>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", fontSize: 13 }}>
        <span style={{ color: "#287be0" }}>● Actual generation</span>
        <span style={{ color: "#e49b37" }}>● Forecast generation</span>
      </div>
    </div>
  );
}

export default function App() {
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-02-01");
  const [mode, setMode] = useState("elexon");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const url = new URL(`${API_BASE}/api/dashboard`);
      url.searchParams.set("start", start);
      url.searchParams.set("end", end);
      url.searchParams.set("mode", mode);

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || `Request failed (${response.status})`);
      }

      setData(result);
    } catch (err) {
      setError(`${err.message}. Check that the FastAPI backend is running on ${API_BASE}.`);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const rows = data?.rows || [];
  const validRows = useMemo(
    () => rows.filter((row) => row.actualMW != null && row.forecastMW != null),
    [rows]
  );

  const meanActual = validRows.length
    ? validRows.reduce((sum, row) => sum + row.actualMW, 0) / validRows.length
    : null;

  const coverage = rows.length ? (validRows.length / rows.length) * 100 : 0;
  const m = data?.metrics || {};

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <div style={{ fontSize: 23, fontWeight: 800, marginBottom: 5 }}>〰 WindScope</div>
        <div style={{ color: "#8fa3c0", fontSize: 10, letterSpacing: 2 }}>FORECAST INTELLIGENCE</div>
        <div style={{ marginTop: 45, color: "#8fa3c0", fontSize: 11, letterSpacing: 2 }}>WORKSPACE</div>
        <div style={{ marginTop: 18, padding: 14, background: "#20334c", borderRadius: 9 }}>Overview</div>
        <div style={{ marginTop: 10, padding: 14, color: "#b7c5d8" }}>Forecast analysis</div>
        <div style={{ marginTop: 40, color: "#8fa3c0", fontSize: 12 }}>UK NATIONAL VIEW</div>
      </aside>

      <main style={styles.main}>
        <div style={{ ...styles.muted, marginBottom: 28 }}>Workspace　/　Wind generation</div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ color: "#078779", fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>DAY-AHEAD PROCUREMENT · UK</div>
            <h1 style={{ fontSize: "clamp(27px, 3vw, 38px)", margin: "14px 0" }}>Wind generation overview</h1>
            <p style={{ color: "#73839c", lineHeight: 1.6 }}>Evaluate forecast accuracy, identify large errors, and understand potential implications for day-ahead procurement.</p>
          </div>
          <button style={styles.button} onClick={() => downloadCsv(rows)} disabled={!rows.length}>Export CSV</button>
        </div>

        {data?.notice && (
          <div style={{ margin: "24px 0", background: "#eefaf7", border: "1px solid #c9eae1", borderRadius: 10, padding: 16, color: "#236f68", fontSize: 13, lineHeight: 1.6 }}>
            {data.notice}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            loadDashboard();
          }}
          style={{ ...styles.card, display: "flex", flexWrap: "wrap", gap: 15, alignItems: "center", marginBottom: 22 }}
        >
          <strong style={{ marginRight: "auto" }}>Analysis period</strong>
          <label style={{ ...styles.muted, display: "grid", gap: 5 }}>
            From
            <input style={styles.input} type="date" value={start} min="2026-01-01" max="2026-01-31" onChange={(event) => setStart(event.target.value)} />
          </label>
          <label style={{ ...styles.muted, display: "grid", gap: 5 }}>
            To (exclusive)
            <input style={styles.input} type="date" value={end} min="2026-01-02" max="2026-02-01" onChange={(event) => setEnd(event.target.value)} />
          </label>
          <label style={{ ...styles.muted, display: "grid", gap: 5 }}>
            Data source
            <select style={styles.input} value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="elexon">Elexon API</option>
              <option value="demo">Demo data</option>
            </select>
          </label>
          <button style={styles.button} type="submit" disabled={loading}>{loading ? "Loading..." : "Apply filters"}</button>
        </form>

        {error && (
          <div role="alert" style={{ ...styles.card, marginBottom: 20, color: "#a52c2c", borderColor: "#efcaca" }}>
            {error}
          </div>
        )}

        {loading && <p style={styles.muted}>Loading generation data...</p>}

        {data && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 18, marginBottom: 22 }}>
              {[
                ["Mean actual generation", meanActual, "MW"],
                ["Mean absolute error", m.maeMW, "MW"],
                ["Root mean square error", m.rmseMW, "MW"],
                ["Forecast coverage", coverage, "%"],
              ].map(([label, value, unit]) => (
                <div key={label} style={styles.card}>
                  <div style={{ ...styles.muted, marginBottom: 18 }}>{label}</div>
                  <div style={{ fontSize: 30, fontWeight: 750 }}>
                    {value == null ? "—" : formatNumber(value)}<span style={{ fontSize: 13, color: "#73839c" }}> {unit}</span>
                  </div>
                  <div style={{ ...styles.muted, marginTop: 12 }}>
                    {label === "Forecast coverage"
                      ? `${validRows.length} of ${rows.length} intervals matched`
                      : "Across matched intervals"}
                  </div>
                </div>
              ))}
            </div>

            {mode === "elexon" && coverage === 0 && (
              <div style={{ ...styles.card, marginBottom: 22, color: "#9a5a0a", background: "#fff9ed" }}>
                Forecast coverage is zero. The backend returned no matched forecast intervals. Do not interpret missing metrics as zero error; inspect the backend record counts.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 350px), 1fr))", gap: 20, marginBottom: 22 }}>
              <section style={styles.card}>
                <h3 style={{ marginTop: 0 }}>Generation and forecast errors</h3>
                <p style={styles.muted}>January 2026 · Times displayed in UTC</p>
                <LineChart rows={rows} />
              </section>
              <section style={styles.card}>
                <h3 style={{ marginTop: 0 }}>Forecast quality</h3>
                <p style={styles.muted}>Forecast minus actual</p>
                <div style={{ fontSize: 29, fontWeight: 750, margin: "24px 0 6px" }}>{formatNumber(m.meanErrorMW)} MW</div>
                <div style={styles.muted}>Mean signed error</div>
                <hr style={{ border: 0, borderTop: "1px solid #e5ebf4", margin: "20px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                  <span style={styles.muted}>Mean absolute percentage error</span>
                  <strong>{m.mapePercent == null ? "—" : `${formatNumber(m.mapePercent)}%`}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                  <span style={styles.muted}>Over-forecast intervals</span>
                  <strong>{validRows.filter((r) => r.forecastMW > r.actualMW).length}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={styles.muted}>Under-forecast intervals</span>
                  <strong>{validRows.filter((r) => r.forecastMW < r.actualMW).length}</strong>
                </div>
              </section>
            </div>

            <section style={{ ...styles.card, overflowX: "auto" }}>
              <h3 style={{ marginTop: 0 }}>Generation intervals</h3>
              <p style={styles.muted}>Showing up to 100 records</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "#f5f8fc" }}>
                    {["Target time (UTC)", "Published (UTC)", "Actual MW", "Forecast MW", "Error MW"].map((heading) => (
                      <th key={heading} style={{ padding: 12, borderBottom: "1px solid #e1e8f2", whiteSpace: "nowrap" }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row, index) => (
                    <tr key={`${row.startTime}-${index}`}>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf1f6", whiteSpace: "nowrap" }}>{row.startTime}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf1f6", whiteSpace: "nowrap" }}>{row.publishTime || "—"}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf1f6" }}>{formatNumber(row.actualMW)}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf1f6" }}>{formatNumber(row.forecastMW)}</td>
                      <td style={{ padding: 12, borderBottom: "1px solid #edf1f6" }}>{formatNumber(row.errorMW)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  );
}