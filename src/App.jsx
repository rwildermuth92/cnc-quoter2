import { supabase } from './lib/supabaseClient'
import { useState } from "react";

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        "#0e0f11",
  surface:   "#16181c",
  panel:     "#1d2026",
  border:    "#2a2d35",
  borderHi:  "#3d4149",
  steel:     "#4a5568",
  text:      "#e2e6ed",
  muted:     "#6b7280",
  dim:       "#9ca3af",
  accent:    "#f59e0b",   // amber – machined brass feel
  accentDim: "#92400e",
  green:     "#10b981",
  red:       "#ef4444",
  blue:      "#3b82f6",
};

const font = { mono: "'Courier New', 'Lucida Console', monospace", sans: "'Trebuchet MS', sans-serif" };

// ── Material library ($/lb) ──────────────────────────────────────────────────
const MATERIALS = [
  { id: "al6061",  label: "Aluminum 6061",      pricePerLb: 2.20,  density: 0.098 },
  { id: "al7075",  label: "Aluminum 7075",      pricePerLb: 3.80,  density: 0.102 },
  { id: "ss304",   label: "Stainless 304",       pricePerLb: 4.50,  density: 0.289 },
  { id: "ss316",   label: "Stainless 316",       pricePerLb: 5.80,  density: 0.289 },
  { id: "cr_steel",label: "Chrome-Moly 4140",   pricePerLb: 1.80,  density: 0.284 },
  { id: "mild",    label: "Mild Steel 1018",     pricePerLb: 0.90,  density: 0.284 },
  { id: "ti6al4v", label: "Titanium 6Al-4V",    pricePerLb: 28.00, density: 0.160 },
  { id: "brass",   label: "Brass 360",           pricePerLb: 3.20,  density: 0.307 },
  { id: "delrin",  label: "Delrin / Acetal",     pricePerLb: 3.60,  density: 0.052 },
  { id: "custom",  label: "Custom Material",     pricePerLb: 0,     density: 0.100 },
];

// ── Machine rates ($/hr) ─────────────────────────────────────────────────────
const MACHINES = [
  { id: "mill3",  label: "3-Axis Mill",         rate: 85  },
  { id: "mill4",  label: "4-Axis Mill",         rate: 120 },
  { id: "mill5",  label: "5-Axis Mill",         rate: 165 },
  { id: "lathe",  label: "CNC Lathe",           rate: 75  },
  { id: "turn_m", label: "Turn-Mill / Live",    rate: 130 },
  { id: "swiss",  label: "Swiss Screw",         rate: 150 },
  { id: "custom", label: "Custom Machine",      rate: 0   },
];

const FINISH_OPTS = [
  { id: "none",    label: "As Machined",         cost: 0    },
  { id: "debur",   label: "Deburr & Clean",      cost: 15   },
  { id: "anodize", label: "Anodize (Type II)",   cost: 45   },
  { id: "anodize3",label: "Anodize (Type III)",  cost: 75   },
  { id: "passiv",  label: "Passivation",         cost: 55   },
  { id: "paint",   label: "Powder Coat",         cost: 85   },
  { id: "plate",   label: "Nickel Plate",        cost: 110  },
  { id: "custom",  label: "Custom Finish",       cost: 0    },
];

const TOLERANCE_MULT = { standard: 1.0, precision: 1.25, ultra: 1.6 };
const URGENCY_MULT   = { standard: 1.0, rush: 1.35, hot: 1.75 };
const MARGIN_DEFAULT = 30;

const fmt$ = (n) => `$${(n || 0).toFixed(2)}`;
const fmtTotal = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

let _nextOp = 3;

const defaultOps = () => [
  { id: 1, machine: "mill3", setupHrs: 0.5, cycleMin: 12, type: "hourly" },
  { id: 2, machine: "lathe", setupHrs: 0.25, cycleMin: 8, type: "hourly" },
];

// ═══════════════════════════════════════════════════════════════════════════════
export default function CNCQuoter() {
  // Job info
  const [jobName,  setJobName]  = useState("New Quote");
  const [partNum,  setPartNum]  = useState("");
  const [customer, setCustomer] = useState("");
  const [quoteNum, setQuoteNum] = useState(`Q-${new Date().getFullYear()}-001`);
  const [qty,      setQty]      = useState(10);
  const [pricingMode, setPricingMode] = useState("hourly"); // hourly | perpart

  // Material
  const [matId,     setMatId]     = useState("al6061");
  const [customMat, setCustomMat] = useState({ pricePerLb: 2.0, density: 0.098 });
  const [stockL,    setStockL]    = useState(4);   // inches
  const [stockW,    setStockW]    = useState(3);
  const [stockH,    setStockH]    = useState(2);
  const [matWaste,  setMatWaste]  = useState(30);  // % waste/scrap

  // Custom material library
  const [savedMats, setSavedMats] = useState([]);
  const [newMat, setNewMat] = useState({ label: "", pricePerLb: "", density: "" });
  const [matSaved, setMatSaved] = useState(false);

 // Save quote to Supabase
const saveQuote = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('quotes').insert({
    user_id: user.id,
    quote_number: quoteNum,
    customer_name: customer,
    job_name: jobName,
    part_number: partNum,
    quantity: qty,
    total_price: totalPrice,
    status: 'draft',
    quote_data: {
      jobName, partNum, customer, quoteNum, qty, pricingMode,
      matId, stockL, stockW, stockH, matWaste,
      ops, adjustments
    }
  })
  if (error) alert('Error saving: ' + error.message)
  else alert('Quote saved! ✅')
} 
const addSavedMat = () => {
    if (!newMat.label || !newMat.pricePerLb || !newMat.density) return;
    const id = "saved_" + Date.now();
    const entry = { id, label: newMat.label, pricePerLb: parseFloat(newMat.pricePerLb), density: parseFloat(newMat.density) };
    setSavedMats(prev => [...prev, entry]);
    setNewMat({ label: "", pricePerLb: "", density: "" });
    setMatSaved(true);
    setTimeout(() => setMatSaved(false), 2000);
  };
  const deleteSavedMat = (id) => {
    setSavedMats(prev => prev.filter(m => m.id !== id));
    if (matId === id) setMatId("al6061");
  };

  // Operations
  const [ops, setOps] = useState(defaultOps());

  // Finishing
  const [finishId,     setFinishId]     = useState("debur");
  const [customFinish, setCustomFinish] = useState(0);

  // Adjustments
  const [tolerance,  setTolerance]  = useState("standard");
  const [urgency,    setUrgency]    = useState("standard");
  const [margin,     setMargin]     = useState(MARGIN_DEFAULT);
  const [toolingFlat,setToolingFlat]= useState(0);
  const [fixturingFlat, setFixturingFlat] = useState(0);
  const [notes,      setNotes]      = useState("");

  const [tab, setTab] = useState("job");  // job | material | ops | adjust | quote
  const [copied, setCopied] = useState(false);

  // ── Derived calculations ──────────────────────────────────────────────────
  const allMats  = [...MATERIALS.slice(0, -1), ...savedMats, MATERIALS[MATERIALS.length - 1]];
  const mat      = allMats.find(m => m.id === matId) || MATERIALS[0];
  const ppl      = matId === "custom" ? customMat.pricePerLb : mat.pricePerLb;
  const dens     = matId === "custom" ? customMat.density    : mat.density;
  const stockVol = stockL * stockW * stockH;                    // in³
  const stockLbs = stockVol * dens;
  const matCostRaw = stockLbs * ppl;
  const matCostPerPart = matCostRaw * (1 + matWaste / 100);

  const getRate = (op) => {
    const m = MACHINES.find(x => x.id === op.machine);
    return op.machine === "custom" ? (op.customRate || 0) : (m?.rate || 0);
  };

  const opCostPerPart = (op) => {
    const rate = getRate(op);
    const setupPerPart = ((op.setupHrs || 0) * rate) / Math.max(qty, 1);
    const cycle = ((op.cycleMin || 0) / 60) * rate;
    return setupPerPart + cycle;
  };

  const totalMachinePerPart = ops.reduce((s, op) => s + opCostPerPart(op), 0);

  const finOpt   = FINISH_OPTS.find(f => f.id === finishId);
  const finCost  = finishId === "custom" ? (customFinish || 0) : (finOpt?.cost || 0);

  const tolMult  = TOLERANCE_MULT[tolerance] || 1;
  const urgMult  = URGENCY_MULT[urgency] || 1;

  const costBeforeMargin = (matCostPerPart + totalMachinePerPart + finCost) * tolMult * urgMult
                           + (toolingFlat + fixturingFlat) / Math.max(qty, 1);
  const pricePerPart = costBeforeMargin / (1 - margin / 100);
  const totalPrice   = pricePerPart * qty;
  const grossProfit  = totalPrice - costBeforeMargin * qty;

  // ── Op helpers ────────────────────────────────────────────────────────────
  const addOp = () => {
    setOps([...ops, { id: _nextOp++, machine: "mill3", setupHrs: 0.5, cycleMin: 10, type: "hourly" }]);
  };
  const removeOp = (id) => setOps(ops.filter(o => o.id !== id));
  const updateOp = (id, field, val) => setOps(ops.map(o => o.id === id ? { ...o, [field]: val } : o));

  // ── Copy quote text ───────────────────────────────────────────────────────
  const handleCopy = () => {
    const lines = [
      `MACHINING QUOTE — ${quoteNum}`,
      `Customer: ${customer || "—"}  |  Part: ${partNum || "—"}  |  Job: ${jobName}`,
      `Quantity: ${qty} pcs`,
      ``,
      `MATERIAL: ${mat.label}  (${stockL}" × ${stockW}" × ${stockH}" stock)`,
      `  Cost/part: ${fmt$(matCostPerPart)}`,
      ``,
      `OPERATIONS:`,
      ...ops.map(op => {
        const m = MACHINES.find(x => x.id === op.machine);
        return `  ${m?.label || "Custom"}: setup ${op.setupHrs}h, cycle ${op.cycleMin}min  → ${fmt$(opCostPerPart(op))}/part`;
      }),
      ``,
      `FINISHING: ${finOpt?.label}  ${fmt$(finCost)}/part`,
      `Tolerance: ${tolerance}  |  Urgency: ${urgency}`,
      toolingFlat ? `Tooling: ${fmt$(toolingFlat)}` : null,
      fixturingFlat ? `Fixturing: ${fmt$(fixturingFlat)}` : null,
      ``,
      `── SUMMARY ──────────────────────`,
      `Cost/part:  ${fmt$(costBeforeMargin)}`,
      `Price/part: ${fmt$(pricePerPart)}`,
      `Margin:     ${margin}%`,
      `TOTAL (${qty} pcs): ${fmtTotal(totalPrice)}`,
      `Gross Profit: ${fmtTotal(grossProfit)}`,
      notes ? `\nNotes: ${notes}` : null,
    ].filter(l => l !== null).join("\n");

    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const tabs = ["job", "material", "ops", "adjust", "quote"];
  const tabLabels = { job: "Job Info", material: "Material", ops: "Operations", adjust: "Adjustments", quote: "Final Quote" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: font.sans, fontSize: 14 }}>

      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, background: C.accent, borderRadius: "50%", boxShadow: `0 0 8px ${C.accent}` }} />
          <span style={{ fontFamily: font.mono, fontSize: 13, color: C.accent, letterSpacing: 3, textTransform: "uppercase" }}>CNC Quoter</span>
          <span style={{ color: C.border }}>|</span>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: C.muted }}>{quoteNum}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: font.mono }}>TOTAL</div>
            <div style={{ fontSize: 18, fontFamily: font.mono, color: C.accent, fontWeight: 700 }}>{fmtTotal(totalPrice)}<button
  onClick={() => supabase.auth.signOut()}
  style={{ fontSize: 10, color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, padding: "3px 8px", cursor: "pointer", fontFamily: font.mono, letterSpacing: 1, textTransform: "uppercase" }}>
  Logout
</button></div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", padding: "0 24px", overflowX: "auto" }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "12px 18px", background: "none", border: "none",
            borderBottom: tab === t ? `2px solid ${C.accent}` : "2px solid transparent",
            color: tab === t ? C.accent : C.muted,
            fontFamily: font.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
            cursor: "pointer", whiteSpace: "nowrap",
            transition: "color 0.15s",
          }}>
            {i + 1}. {tabLabels[t]}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>

        {/* ── JOB INFO ── */}
        {tab === "job" && (
          <div>
            <SectionHead>Job Information</SectionHead>
            <Grid cols={2}>
              <Field label="Quote Number">
                <In value={quoteNum} onChange={e => setQuoteNum(e.target.value)} />
              </Field>
              <Field label="Customer Name">
                <In value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Acme Corp" />
              </Field>
              <Field label="Job / Part Name">
                <In value={jobName} onChange={e => setJobName(e.target.value)} />
              </Field>
              <Field label="Part Number">
                <In value={partNum} onChange={e => setPartNum(e.target.value)} placeholder="PN-12345" />
              </Field>
              <Field label="Quantity">
                <In type="number" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} min={1} />
              </Field>
              <Field label="Pricing Mode">
                <Sel value={pricingMode} onChange={e => setPricingMode(e.target.value)}>
                  <option value="hourly">Hourly machine rate</option>
                  <option value="perpart">Per-part flat rate</option>
                </Sel>
              </Field>
            </Grid>
            <NavBtn onClick={() => setTab("material")}>Next: Material →</NavBtn>
          </div>
        )}

        {/* ── MATERIAL ── */}
        {tab === "material" && (
          <div>
            <SectionHead>Material Selection</SectionHead>
            <Grid cols={2}>
              <Field label="Material" style={{ gridColumn: "1 / -1" }}>
                <Sel value={matId} onChange={e => setMatId(e.target.value)}>
                  <optgroup label="── Standard Materials ──">
                    {MATERIALS.slice(0, -1).map(m => <option key={m.id} value={m.id}>{m.label} — ${m.pricePerLb}/lb</option>)}
                  </optgroup>
                  {savedMats.length > 0 && (
                    <optgroup label="── Your Custom Materials ──">
                      {savedMats.map(m => <option key={m.id} value={m.id}>{m.label} — ${m.pricePerLb}/lb</option>)}
                    </optgroup>
                  )}
                  <optgroup label="──────────────────────">
                    <option value="custom">Enter One-Off Material</option>
                  </optgroup>
                </Sel>
              </Field>
              {matId === "custom" && <>
                <Field label="Price per lb ($)">
                  <In type="number" value={customMat.pricePerLb} onChange={e => setCustomMat({ ...customMat, pricePerLb: parseFloat(e.target.value) || 0 })} step={0.01} />
                </Field>
                <Field label="Density (lb/in³)">
                  <In type="number" value={customMat.density} onChange={e => setCustomMat({ ...customMat, density: parseFloat(e.target.value) || 0 })} step={0.001} />
                </Field>
              </>}
            </Grid>

            {/* ── Add custom material ── */}
            <SectionHead style={{ marginTop: 28 }}>Add Material to Your Library</SectionHead>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "18px 20px", marginBottom: 16 }}>
              <Grid cols={3}>
                <Field label="Material Name">
                  <In value={newMat.label} onChange={e => setNewMat({ ...newMat, label: e.target.value })} placeholder="e.g. Inconel 718" />
                </Field>
                <Field label="Price per lb ($)">
                  <In type="number" value={newMat.pricePerLb} onChange={e => setNewMat({ ...newMat, pricePerLb: e.target.value })} step={0.01} placeholder="0.00" />
                </Field>
                <Field label="Density (lb/in³)">
                  <In type="number" value={newMat.density} onChange={e => setNewMat({ ...newMat, density: e.target.value })} step={0.001} placeholder="0.000" />
                </Field>
              </Grid>
              <div style={{ marginTop: 4, fontSize: 11, color: C.muted, fontFamily: font.mono }}>
                Common densities: Al≈0.098 · Steel≈0.284 · SS≈0.289 · Ti≈0.160 · Brass≈0.307 · Copper≈0.324
              </div>
              <button onClick={addSavedMat} style={{ marginTop: 14, padding: "9px 22px", background: matSaved ? C.green : C.accent, color: C.bg, border: "none", borderRadius: 4, fontFamily: font.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700, transition: "background 0.2s" }}>
                {matSaved ? "✓ Saved!" : "+ Save to Library"}
              </button>
            </div>

            {/* ── Saved materials list ── */}
            {savedMats.length > 0 && (
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 4 }}>
                <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 100px 110px 40px", gap: 8 }}>
                  {["Name", "$/lb", "Density", ""].map(h => (
                    <span key={h} style={{ fontSize: 10, letterSpacing: 2, color: C.muted, fontFamily: font.mono, textTransform: "uppercase" }}>{h}</span>
                  ))}
                </div>
                {savedMats.map(m => (
                  <div key={m.id} style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}20`, display: "grid", gridTemplateColumns: "1fr 100px 110px 40px", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13 }}>{m.label}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 12, color: C.accent }}>${m.pricePerLb.toFixed(2)}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 12, color: C.dim }}>{m.density.toFixed(3)} lb/in³</span>
                    <button onClick={() => deleteSavedMat(m.id)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.red, cursor: "pointer", borderRadius: 3, width: 30, height: 26, fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
            )}


            <SectionHead style={{ marginTop: 24 }}>Stock Blank Size</SectionHead>
            <Grid cols={3}>
              <Field label='Length (in)"'>
                <In type="number" value={stockL} onChange={e => setStockL(parseFloat(e.target.value) || 0)} step={0.25} />
              </Field>
              <Field label='Width (in)"'>
                <In type="number" value={stockW} onChange={e => setStockW(parseFloat(e.target.value) || 0)} step={0.25} />
              </Field>
              <Field label='Height / Dia (in)"'>
                <In type="number" value={stockH} onChange={e => setStockH(parseFloat(e.target.value) || 0)} step={0.25} />
              </Field>
            </Grid>

            <Field label="Material Waste / Scrap (%)" style={{ maxWidth: 200, marginTop: 16 }}>
              <In type="number" value={matWaste} onChange={e => setMatWaste(parseFloat(e.target.value) || 0)} min={0} max={90} />
            </Field>

            <InfoBox>
              Stock: <B>{stockL}" × {stockW}" × {stockH}"</B> = {stockVol.toFixed(2)} in³ &nbsp;|&nbsp;
              ~{stockLbs.toFixed(3)} lbs &nbsp;|&nbsp;
              Raw cost: <B>{fmt$(matCostRaw)}</B> &nbsp;|&nbsp;
              With {matWaste}% waste: <B style={{ color: C.accent }}>{fmt$(matCostPerPart)} / part</B>
            </InfoBox>

            <NavBtn onClick={() => setTab("ops")}>Next: Operations →</NavBtn>
          </div>
        )}

        {/* ── OPERATIONS ── */}
        {tab === "ops" && (
          <div>
            <SectionHead>Machining Operations</SectionHead>
            <div style={{ marginBottom: 8, display: "grid", gridTemplateColumns: "180px 90px 100px 90px 90px 36px", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
              {["Machine", "Setup (hr)", "Cycle (min)", "Rate $/hr", "Cost/part", ""].map(h => (
                <span key={h} style={{ fontSize: 10, letterSpacing: 2, color: C.muted, fontFamily: font.mono, textTransform: "uppercase" }}>{h}</span>
              ))}
            </div>

            {ops.map(op => {
              const m = MACHINES.find(x => x.id === op.machine);
              const rate = op.machine === "custom" ? (op.customRate || 0) : (m?.rate || 0);
              return (
                <div key={op.id} style={{ display: "grid", gridTemplateColumns: "180px 90px 100px 90px 90px 36px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <Sel value={op.machine} onChange={e => updateOp(op.id, "machine", e.target.value)}>
                    {MACHINES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </Sel>
                  <In type="number" value={op.setupHrs} onChange={e => updateOp(op.id, "setupHrs", parseFloat(e.target.value) || 0)} step={0.25} min={0} />
                  <In type="number" value={op.cycleMin} onChange={e => updateOp(op.id, "cycleMin", parseFloat(e.target.value) || 0)} step={1} min={0} />
                  {op.machine === "custom"
                    ? <In type="number" value={op.customRate || ""} onChange={e => updateOp(op.id, "customRate", parseFloat(e.target.value) || 0)} placeholder="$/hr" />
                    : <div style={{ fontFamily: font.mono, fontSize: 13, color: C.dim, padding: "8px 0" }}>${rate}/hr</div>
                  }
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: C.accent, padding: "8px 0" }}>{fmt$(opCostPerPart(op))}</div>
                  <button onClick={() => removeOp(op.id)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.red, cursor: "pointer", borderRadius: 3, width: 36, height: 34, fontSize: 14 }}>✕</button>
                </div>
              );
            })}

            <button onClick={addOp} style={{ marginTop: 8, background: "none", border: `1px dashed ${C.accent}`, color: C.accent, cursor: "pointer", padding: "8px 18px", borderRadius: 3, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontFamily: font.mono }}>+ Add Operation</button>

            <InfoBox style={{ marginTop: 20 }}>
              Total machine cost: <B style={{ color: C.accent }}>{fmt$(totalMachinePerPart)} / part</B> &nbsp;|&nbsp;
              Setup amortized over {qty} pcs
            </InfoBox>

            <NavBtn onClick={() => setTab("adjust")}>Next: Adjustments →</NavBtn>
          </div>
        )}

        {/* ── ADJUSTMENTS ── */}
        {tab === "adjust" && (
          <div>
            <SectionHead>Finishing</SectionHead>
            <Grid cols={2}>
              <Field label="Surface Finish">
                <Sel value={finishId} onChange={e => setFinishId(e.target.value)}>
                  {FINISH_OPTS.map(f => <option key={f.id} value={f.id}>{f.label}{f.id !== "custom" ? ` — $${f.cost}/part` : ""}</option>)}
                </Sel>
              </Field>
              {finishId === "custom" && (
                <Field label="Custom Finish Cost ($/part)">
                  <In type="number" value={customFinish} onChange={e => setCustomFinish(parseFloat(e.target.value) || 0)} step={5} />
                </Field>
              )}
            </Grid>

            <SectionHead style={{ marginTop: 24 }}>Modifiers</SectionHead>
            <Grid cols={3}>
              <Field label="Tolerance">
                <Sel value={tolerance} onChange={e => setTolerance(e.target.value)}>
                  <option value="standard">Standard (±0.005")</option>
                  <option value="precision">Precision (±0.001")</option>
                  <option value="ultra">Ultra (±0.0002")</option>
                </Sel>
              </Field>
              <Field label="Urgency">
                <Sel value={urgency} onChange={e => setUrgency(e.target.value)}>
                  <option value="standard">Standard lead time</option>
                  <option value="rush">Rush (+35%)</option>
                  <option value="hot">Hot / Same-day (+75%)</option>
                </Sel>
              </Field>
              <Field label="Margin (%)">
                <In type="number" value={margin} onChange={e => setMargin(parseFloat(e.target.value) || 0)} min={0} max={90} />
              </Field>
            </Grid>

            <SectionHead style={{ marginTop: 24 }}>One-Time Costs</SectionHead>
            <Grid cols={2}>
              <Field label="Tooling / Fixtures ($)">
                <In type="number" value={toolingFlat} onChange={e => setToolingFlat(parseFloat(e.target.value) || 0)} step={25} />
              </Field>
              <Field label="Fixturing / Jigs ($)">
                <In type="number" value={fixturingFlat} onChange={e => setFixturingFlat(parseFloat(e.target.value) || 0)} step={25} />
              </Field>
            </Grid>

            <Field label="Internal Notes" style={{ marginTop: 16 }}>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                style={{ width: "100%", padding: "10px 12px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: font.sans, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
            </Field>

            <NavBtn onClick={() => setTab("quote")}>View Final Quote →</NavBtn>
          </div>
        )}

        {/* ── FINAL QUOTE ── */}
        {tab === "quote" && (
          <div>
            <SectionHead>Quote Summary — {quoteNum}</SectionHead>

            {/* Header card */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "20px 24px", marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <Micro>Customer</Micro>
                  <div style={{ fontWeight: 600 }}>{customer || "—"}</div>
                </div>
                <div>
                  <Micro>Part / PN</Micro>
                  <div>{jobName}{partNum ? ` (${partNum})` : ""}</div>
                </div>
                <div>
                  <Micro>Quantity</Micro>
                  <div style={{ fontFamily: font.mono, fontSize: 18, color: C.accent }}>{qty} pcs</div>
                </div>
              </div>
            </div>

            {/* Cost breakdown */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.border}`, fontFamily: font.mono, fontSize: 11, letterSpacing: 2, color: C.muted, textTransform: "uppercase" }}>Cost Breakdown (per part)</div>
              <div style={{ padding: "16px 24px" }}>
                <BLine label={`Material (${mat.label})`} value={fmt$(matCostPerPart)} />
                {ops.map(op => {
                  const m = MACHINES.find(x => x.id === op.machine);
                  return <BLine key={op.id} label={`${m?.label || "Machine"} — setup ${op.setupHrs}h, cycle ${op.cycleMin}min`} value={fmt$(opCostPerPart(op))} />;
                })}
                <BLine label={`Finishing (${finOpt?.label})`} value={fmt$(finCost)} />
                {(toolingFlat || fixturingFlat) > 0 && (
                  <BLine label={`One-time costs amortized (${qty} pcs)`} value={fmt$((toolingFlat + fixturingFlat) / Math.max(qty, 1))} />
                )}
                {tolerance !== "standard" && <BLine label={`Tolerance multiplier (${tolerance}) ×${TOLERANCE_MULT[tolerance]}`} value="" dim />}
                {urgency !== "standard" && <BLine label={`Urgency multiplier (${urgency}) ×${URGENCY_MULT[urgency]}`} value="" dim />}

                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 8 }}>
                  <BLine label="Total cost / part" value={fmt$(costBeforeMargin)} bold />
                  <BLine label={`Margin ${margin}%`} value={fmt$(pricePerPart - costBeforeMargin)} />
                  <BLine label="SELL PRICE / part" value={fmt$(pricePerPart)} accent bold />
                </div>
              </div>
            </div>

            {/* Totals */}
            <div style={{ background: C.surface, border: `1px solid ${C.accent}40`, borderRadius: 6, padding: "20px 24px", marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                <Stat label="Price / Part" value={fmt$(pricePerPart)} />
                <Stat label="Quantity" value={`× ${qty}`} />
                <Stat label="TOTAL" value={fmtTotal(totalPrice)} big accent />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 16, paddingTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                <Stat label="Cost of Goods" value={fmtTotal(costBeforeMargin * qty)} muted />
                <Stat label="Gross Profit" value={fmtTotal(grossProfit)} green />
                <Stat label="GP Margin" value={`${margin}%`} muted />
              </div>
            </div>

            {notes && (
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 4, padding: "14px 18px", marginBottom: 16 }}>
                <Micro>Notes</Micro>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>{notes}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setTab("adjust")} style={{ flex: 1, padding: 13, background: "none", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: font.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer" }}>← Edit</button>
              <button onClick={handleCopy} style={{ flex: 2, padding: 13, background: copied ? C.green : C.accent, color: C.bg, border: "none", borderRadius: 4, fontFamily: font.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700, transition: "background 0.2s" }}>
                {copied ? "✓ Copied to Clipboard" : "Copy Quote Text"}
              </button>
              <button onClick={() => window.print()} style={{ flex: 1, padding: 13, background: C.surface, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 4, fontFamily: font.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer" }}>Print</button>
<button onClick={saveQuote} style={{ flex: 1, padding: 13, background: C.green, color: "#fff", border: "none", borderRadius: 4, fontFamily: font.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}>Save Quote</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tiny sub-components ───────────────────────────────────────────────────────
function SectionHead({ children, style }) {
  return <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.accent, marginBottom: 14, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, ...style }}>{children}</div>;
}
function Grid({ cols, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>{children}</div>;
}
function Field({ label, children, style }) {
  return <div style={style}><div style={{ fontSize: 10, letterSpacing: 2, color: C.muted, fontFamily: font.mono, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>{children}</div>;
}
function In({ style, ...props }) {
  return <input {...props} style={{ width: "100%", padding: "8px 10px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: font.mono, fontSize: 13, boxSizing: "border-box", outline: "none", ...style }} />;
}
function Sel({ children, style, ...props }) {
  return <select {...props} style={{ width: "100%", padding: "8px 10px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: font.mono, fontSize: 12, ...style }}>{children}</select>;
}
function NavBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ marginTop: 24, width: "100%", padding: 13, background: C.accent, color: C.bg, border: "none", borderRadius: 4, fontFamily: font.mono, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }}>{children}</button>;
}
function InfoBox({ children, style }) {
  return <div style={{ marginTop: 14, padding: "10px 14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: font.mono, fontSize: 12, color: C.dim, ...style }}>{children}</div>;
}
function B({ children, style }) {
  return <span style={{ fontWeight: 700, color: C.text, ...style }}>{children}</span>;
}
function Micro({ children }) {
  return <div style={{ fontSize: 10, letterSpacing: 2, color: C.muted, fontFamily: font.mono, textTransform: "uppercase", marginBottom: 4 }}>{children}</div>;
}
function BLine({ label, value, bold, accent, dim }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, opacity: dim ? 0.6 : 1 }}>
      <span style={{ fontSize: 13, color: C.dim }}>{label}</span>
      {value && <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: bold ? 700 : 400, color: accent ? C.accent : C.text }}>{value}</span>}
    </div>
  );
}
function Stat({ label, value, big, accent, green, muted }) {
  return (
    <div>
      <Micro>{label}</Micro>
      <div style={{ fontFamily: font.mono, fontSize: big ? 22 : 16, fontWeight: 700, color: accent ? C.accent : green ? C.green : muted ? C.muted : C.text }}>{value}</div>
    </div>
  );
}
