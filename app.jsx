/* ==========================================================================
   IMkuchou — アイエム空調株式会社 書類統合管理システム
   すべてブラウザ内完結(localStorage)。ビルド不要・GitHub Pagesで直接動作。
   ========================================================================== */

const { useState, useEffect, useRef, useMemo } = React;

const STORAGE_KEY = "imkuchou_data_v1";

/* ---------------------------------------------------------------------- */
/* 書類種別メタ定義                                                       */
/* ---------------------------------------------------------------------- */

const DOC_META = {
  estimate: {
    key: "estimate", label: "見積書", short: "見積", prefix: "EST",
    dateLabel: "見積日", extraDate: { key: "validUntil", label: "有効期限" },
    banner: "御見積金額", intro: "下記の通りお見積り申し上げます。",
    next: "order",
  },
  order: {
    key: "order", label: "注文書", short: "注文", prefix: "ORD",
    dateLabel: "注文日", extraDate: { key: "desiredDelivery", label: "希望納期" },
    banner: "ご注文金額", intro: "下記の通り注文いたします。",
    next: "acceptance",
  },
  acceptance: {
    key: "acceptance", label: "注文請書", short: "請書", prefix: "ACC",
    dateLabel: "請書発行日", extraDate: null,
    banner: "ご請書金額", intro: "下記の通り注文をお請けいたします。",
    next: "delivery",
  },
  delivery: {
    key: "delivery", label: "納品書", short: "納品", prefix: "DLV",
    dateLabel: "納品日", extraDate: null,
    banner: "納品金額", intro: "下記の通り納品いたします。",
    next: "invoice",
  },
  invoice: {
    key: "invoice", label: "請求書", short: "請求", prefix: "INV",
    dateLabel: "請求日", extraDate: { key: "dueDate", label: "支払期限" },
    banner: "ご請求金額", intro: "下記の通りご請求申し上げます。",
    next: null,
  },
};
const DOC_ORDER = ["estimate", "order", "acceptance", "delivery", "invoice"];

/* ---------------------------------------------------------------------- */
/* ユーティリティ                                                         */
/* ---------------------------------------------------------------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function yen(n) {
  const v = Math.round(n || 0);
  return "¥" + v.toLocaleString("ja-JP");
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function defaultData() {
  return {
    company: {
      name: "アイエム空調株式会社",
      zip: "", address: "", tel: "", fax: "",
      invoiceRegNo: "", bankName: "", bankBranch: "", bankType: "普通",
      bankNumber: "", bankHolder: "",
    },
    clients: [],
    items: [],
    docs: { estimate: [], order: [], acceptance: [], delivery: [], invoice: [] },
    counters: {},
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const base = defaultData();
    return {
      company: { ...base.company, ...(parsed.company || {}) },
      clients: parsed.clients || [],
      items: parsed.items || [],
      docs: { ...base.docs, ...(parsed.docs || {}) },
      counters: parsed.counters || {},
    };
  } catch (e) {
    console.error("データ読込エラー", e);
    return defaultData();
  }
}
function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("データ保存エラー", e);
    return false;
  }
}

function nextDocNumber(data, docType, dateStr) {
  const year = (dateStr || todayISO()).slice(0, 4);
  const counterKey = `${docType}-${year}`;
  const n = (data.counters[counterKey] || 0) + 1;
  return {
    number: `${DOC_META[docType].prefix}-${year}-${String(n).padStart(3, "0")}`,
    counterKey, n,
  };
}

function calcTotals(items, taxRate) {
  const subtotal = (items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const tax = Math.floor(subtotal * (Number(taxRate) || 0) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

function blankItemRow() {
  return { id: uid(), name: "", qty: 1, unit: "式", unitPrice: 0 };
}

function makeBlankDoc(docType) {
  return {
    id: uid(),
    docType,
    docNumber: "",
    date: todayISO(),
    validUntil: "", desiredDelivery: "", dueDate: "",
    title: "", siteName: "", workOverview: "",
    clientId: "",
    client: { name: "", honor: "御中", zip: "", address: "", tel: "", fax: "", contact: "" },
    items: [blankItemRow()],
    taxRate: 10,
    notes: "",
    status: "draft",
    paymentStatus: "unpaid", // 請求書のみ使用: unpaid / partial / paid
    paidAmount: 0,
    paidDate: "",
    linkedFrom: null,
    linkedTo: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------------- */
/* 汎用コンポーネント                                                     */
/* ---------------------------------------------------------------------- */

function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = { draft: ["下書き", "status-draft"], sent: ["送付済", "status-sent"], done: ["完了", "status-done"] };
  const [label, cls] = map[status] || map.draft;
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

function PaymentPill({ doc }) {
  const ps = doc.paymentStatus || "unpaid";
  const overdue = doc.dueDate && ps !== "paid" && doc.dueDate < todayISO();
  if (overdue) return <span className="status-pill" style={{ background: "#3a1414", color: "#f2a0a0" }}>期限超過</span>;
  const map = { unpaid: ["未入金", "status-draft"], partial: ["一部入金", "status-sent"], paid: ["入金済み", "status-done"] };
  const [label, cls] = map[ps] || map.unpaid;
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

/* ---------------------------------------------------------------------- */
/* サイドバー(バインダー・タブ)                                          */
/* ---------------------------------------------------------------------- */

function Binder({ activeTab, setActiveTab }) {
  return (
    <nav className="binder" aria-label="書類種別">
      <button className="binder-brand" onClick={() => setActiveTab("dashboard")} title="ホームへ">
        IMkuchou
      </button>
      {DOC_ORDER.map((key) => (
        <button
          key={key}
          className={`tab ${activeTab === key ? "active" : ""}`}
          data-type={key}
          onClick={() => setActiveTab(key)}
        >
          <span className="tab-dot"></span>
          {DOC_META[key].label}
        </button>
      ))}
      <button
        className={`tab tab-util ${activeTab === "manual" ? "active" : ""}`}
        onClick={() => setActiveTab("manual")}
        style={{ writingMode: "horizontal-tb", minHeight: "unset" }}
      >
        マニュアル
      </button>
      <button
        className={`tab tab-util ${activeTab === "reports" ? "active" : ""}`}
        onClick={() => setActiveTab("reports")}
        style={{ writingMode: "horizontal-tb", minHeight: "unset" }}
      >
        経営レポート
      </button>
      <button
        className={`tab tab-util ${activeTab === "master" ? "active" : ""}`}
        onClick={() => setActiveTab("master")}
        style={{ writingMode: "horizontal-tb", minHeight: "unset" }}
      >
        マスタ管理
      </button>
      <button
        className={`tab tab-util ${activeTab === "settings" ? "active" : ""}`}
        onClick={() => setActiveTab("settings")}
        style={{ writingMode: "horizontal-tb", minHeight: "unset" }}
      >
        自社設定
      </button>
    </nav>
  );
}

/* ---------------------------------------------------------------------- */
/* ダッシュボード                                                         */
/* ---------------------------------------------------------------------- */

function Dashboard({ data, setActiveTab, openNewDoc }) {
  const counts = DOC_ORDER.map((key) => ({
    key, label: DOC_META[key].label,
    count: data.docs[key].length,
    draft: data.docs[key].filter(d => d.status === "draft").length,
  }));
  const recent = DOC_ORDER.flatMap((key) => data.docs[key].map(d => ({ ...d, docType: key })))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .slice(0, 8);

  const invoices = data.docs.invoice || [];
  const today = todayISO();
  const unpaidInvoices = invoices.filter(d => (d.paymentStatus || "unpaid") !== "paid");
  const overdueInvoices = unpaidInvoices.filter(d => d.dueDate && d.dueDate < today);
  const outstandingTotal = unpaidInvoices.reduce((sum, d) => {
    const total = calcTotals(d.items, d.taxRate).total;
    const paid = Number(d.paidAmount) || 0;
    return sum + Math.max(total - paid, 0);
  }, 0);

  return (
    <div>
      {invoices.length > 0 && (
        <div
          className="doc-table-wrap"
          style={{ marginBottom: 20, padding: 16, borderColor: overdueInvoices.length ? "var(--danger)" : undefined, cursor: "pointer" }}
          onClick={() => setActiveTab("invoice")}
        >
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--line)" }}>未回収金額(合計)</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "#e4e8ec" }}>{yen(outstandingTotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--line)" }}>未入金の請求書</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "#e4e8ec" }}>{unpaidInvoices.length}件</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--line)" }}>支払期限超過</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: overdueInvoices.length ? "#f2a0a0" : "#e4e8ec" }}>{overdueInvoices.length}件</div>
            </div>
          </div>
        </div>
      )}

      <div className="doc-table-wrap" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
          {counts.map(c => (
            <div key={c.key} style={{ background: "#1d2126", border: "1px solid #3a4048", borderRadius: 6, padding: "14px 16px", cursor: "pointer" }}
                 onClick={() => setActiveTab(c.key)}>
              <div style={{ fontSize: 12, color: "var(--line)" }}>{c.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "#e4e8ec" }}>{c.count}</div>
              <div style={{ fontSize: 11, color: "var(--copper)" }}>下書き {c.draft} 件</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {DOC_ORDER.map(key => (
          <button key={key} className="btn btn-primary" onClick={() => openNewDoc(key)}>
            + 新規{DOC_META[key].label}
          </button>
        ))}
      </div>

      <h2 style={{ color: "#e4e8ec", fontSize: 14, marginBottom: 10 }}>最近更新した書類</h2>
      <div className="doc-table-wrap">
        {recent.length === 0 ? (
          <div className="empty-state"><div className="icon">📄</div><p>まだ書類がありません。上のボタンから作成できます。</p></div>
        ) : (
          <table className="doc-table">
            <thead><tr><th>種別</th><th>番号</th><th>日付</th><th>取引先</th><th>金額</th><th>状態</th></tr></thead>
            <tbody>
              {recent.map(d => (
                <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => setActiveTab(d.docType, d.id)}>
                  <td>{DOC_META[d.docType].label}</td>
                  <td className="doc-num">{d.docNumber}</td>
                  <td>{fmtDate(d.date)}</td>
                  <td>{d.client?.name || "—"}</td>
                  <td className="amount">{yen(calcTotals(d.items, d.taxRate).total)}</td>
                  <td><StatusPill status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 書類一覧                                                               */
/* ---------------------------------------------------------------------- */

function SourceDocModal({ data, targetType, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const candidates = DOC_ORDER
    .filter(t => t !== targetType)
    .flatMap(t => data.docs[t].map(d => ({ ...d, docType: t })))
    .filter(d => !query || d.docNumber.includes(query) || (d.client?.name || "").includes(query))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  return (
    <Modal title={`${DOC_META[targetType].label}を他の書類から作成`} onClose={onClose}>
      <div className="field">
        <label>コピー元を選択(取引先・明細・備考を引き継ぎます)</label>
        <input
          autoFocus
          placeholder="書類番号・取引先名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="mini-list" style={{ maxHeight: 320, overflowY: "auto" }}>
        {candidates.length === 0 && <div className="empty-state"><p>コピー元になる書類が見つかりません。</p></div>}
        {candidates.map(d => (
          <div className="mini-item" key={`${d.docType}-${d.id}`} style={{ cursor: "pointer" }} onClick={() => onPick(d)}>
            <div>
              <div className="mi-name">{DOC_META[d.docType].label} <span className="doc-num">{d.docNumber}</span></div>
              <div className="mi-sub">{d.client?.name || "取引先未設定"} ／ {fmtDate(d.date)} ／ {yen(calcTotals(d.items, d.taxRate).total)}</div>
            </div>
            <button className="btn btn-primary btn-sm">この内容で作成</button>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>キャンセル</button>
      </div>
    </Modal>
  );
}

function DocList({ docType, docs, onOpen, onNew, onDelete, data, onCreateFromSource }) {
  const [query, setQuery] = useState("");
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const filtered = docs.filter(d =>
    !query || d.docNumber.includes(query) || (d.client?.name || "").includes(query)
  ).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          placeholder="書類番号・取引先名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: "1 1 240px", background: "#1d2126", border: "1px solid #454b53", color: "#e4e8ec", padding: "8px 12px", borderRadius: 3 }}
        />
        <button className="btn btn-ghost" onClick={() => setShowSourcePicker(true)}>他の書類から作成</button>
        <button className="btn btn-primary" onClick={onNew}>+ 新規{DOC_META[docType].label}</button>
      </div>
      <div className="doc-table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📁</div>
            <p>{DOC_META[docType].label}がまだありません。</p>
            <p>「+ 新規{DOC_META[docType].label}」、または「他の書類から作成」をお試しください。</p>
          </div>
        ) : (
          <table className="doc-table">
            <thead><tr><th>番号</th><th>日付</th><th>取引先</th><th>金額</th><th>状態</th>{docType === "invoice" && <th>入金</th>}<th></th></tr></thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id}>
                  <td className="doc-num" style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>{d.docNumber}</td>
                  <td style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>{fmtDate(d.date)}</td>
                  <td style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>
                    {d.client?.name || "—"}
                    {d.title && <div style={{ fontSize: 11, color: "var(--line)", marginTop: 2 }}>{d.title}</div>}
                  </td>
                  <td className="amount" style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>{yen(calcTotals(d.items, d.taxRate).total)}</td>
                  <td style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}><StatusPill status={d.status} /></td>
                  {docType === "invoice" && (
                    <td style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}><PaymentPill doc={d} /></td>
                  )}
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => onDelete(d.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showSourcePicker && (
        <SourceDocModal
          data={data}
          targetType={docType}
          onClose={() => setShowSourcePicker(false)}
          onPick={(sourceDoc) => { setShowSourcePicker(false); onCreateFromSource(sourceDoc, docType); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 紙面プレビュー(PDF出力対象)                                            */
/* ---------------------------------------------------------------------- */

function PaperPreview({ doc, company, printRef }) {
  const meta = DOC_META[doc.docType];
  const totals = calcTotals(doc.items, doc.taxRate);
  return (
    <div className="paper" ref={printRef}>
      <div className="control-corner">No. {doc.docNumber}</div>
      <div className="paper-head">
        <div>
          <div className="paper-title">{meta.label}</div>
          <div className="paper-docnum">{doc.docNumber}</div>
          {doc.title && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>件名：{doc.title}</div>}
        </div>
        <div className="paper-company">
          <div className="name">{company.name}</div>
          {company.zip && <div>〒{company.zip}</div>}
          {company.address && <div>{company.address}</div>}
          {(company.tel || company.fax) && <div>{company.tel && `TEL ${company.tel}`} {company.fax && `FAX ${company.fax}`}</div>}
          {doc.docType === "invoice" && company.invoiceRegNo && <div>登録番号 {company.invoiceRegNo}</div>}
        </div>
      </div>

      <div className="paper-parties">
        <div className="paper-client">
          <div className="client-name">{doc.client.name || "（取引先未設定）"} {doc.client.honor}</div>
          {doc.client.zip && <div>〒{doc.client.zip}</div>}
          {doc.client.address && <div>{doc.client.address}</div>}
          {doc.client.tel && <div>TEL {doc.client.tel}</div>}
          {doc.client.contact && <div>ご担当 {doc.client.contact} 様</div>}
        </div>
        <div className="paper-date">
          <div>発行日　{fmtDate(doc.date)}</div>
          {meta.extraDate && doc[meta.extraDate.key] && (
            <div>{meta.extraDate.label}　{fmtDate(doc[meta.extraDate.key])}</div>
          )}
        </div>
      </div>

      {(doc.siteName || doc.workOverview) && (
        <div style={{ border: "1px solid var(--line-faint)", borderRadius: 3, padding: "8px 12px", marginBottom: 16, fontSize: 12 }}>
          {doc.siteName && <div><b>工事場所</b>　{doc.siteName}</div>}
          {doc.workOverview && <div style={{ marginTop: doc.siteName ? 4 : 0, whiteSpace: "pre-wrap" }}><b>作業概要</b>　{doc.workOverview}</div>}
        </div>
      )}

      <p style={{ fontSize: 13, marginBottom: 16 }}>{meta.intro}</p>

      <div className="paper-total-banner">
        <span className="label">{meta.banner}</span>
        <span className="value">{yen(totals.total)}（税込）</span>
      </div>

      <table className="item-table">
        <thead>
          <tr><th style={{ width: "40%" }}>品名</th><th>数量</th><th>単位</th><th>単価</th><th>金額</th></tr>
        </thead>
        <tbody>
          {doc.items.map(it => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td className="num">{it.qty}</td>
              <td>{it.unit}</td>
              <td className="num">{yen(it.unitPrice)}</td>
              <td className="num">{yen((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="paper-totals">
        <div className="trow"><span>小計</span><span className="val">{yen(totals.subtotal)}</span></div>
        <div className="trow"><span>消費税（{doc.taxRate}%）</span><span className="val">{yen(totals.tax)}</span></div>
        <div className="trow grand"><span>合計</span><span className="val">{yen(totals.total)}</span></div>
      </div>

      {doc.notes && (
        <div className="paper-notes">
          <div className="hd">備考</div>
          {doc.notes}
        </div>
      )}

      <div className="paper-stamp-area">
        <div className="stamp-box">承認</div>
        <div className="stamp-box">担当</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 書類編集画面                                                           */
/* ---------------------------------------------------------------------- */

function DocEditor({ doc, data, updateDoc, company, onBack, onCreateNext, onExportPdf, printRef }) {
  const meta = DOC_META[doc.docType];
  const totals = calcTotals(doc.items, doc.taxRate);

  function patch(fields) {
    updateDoc(doc.docType, doc.id, fields);
  }
  function patchClient(fields) {
    updateDoc(doc.docType, doc.id, { client: { ...doc.client, ...fields } });
  }
  function selectClient(clientId) {
    const c = data.clients.find(c => c.id === clientId);
    if (!c) { patch({ clientId: "" }); return; }
    patch({ clientId, client: { name: c.name, honor: c.honor || "御中", zip: c.zip, address: c.address, tel: c.tel, fax: c.fax, contact: c.contact } });
  }
  function updateItem(itemId, fields) {
    patch({ items: doc.items.map(it => it.id === itemId ? { ...it, ...fields } : it) });
  }
  function addItem() {
    patch({ items: [...doc.items, blankItemRow()] });
  }
  function removeItem(itemId) {
    if (doc.items.length <= 1) return;
    patch({ items: doc.items.filter(it => it.id !== itemId) });
  }

  return (
    <div>
      <div className="editor-grid">
        <div className="panel">
          <h2>基本情報</h2>
          <div className="field">
            <label>件名</label>
            <input value={doc.title || ""} onChange={(e) => patch({ title: e.target.value })} placeholder="例：〇〇ビル 空調更新工事" />
          </div>
          <div className="field">
            <label>工事場所・現場</label>
            <input value={doc.siteName || ""} onChange={(e) => patch({ siteName: e.target.value })} placeholder="例：〇〇県〇〇市〇〇 △△ビル3F" />
          </div>
          <div className="field">
            <label>作業概要(大枠の作業内容)</label>
            <textarea value={doc.workOverview || ""} onChange={(e) => patch({ workOverview: e.target.value })} placeholder="例：業務用エアコン4台の更新、既存機撤去・処分、試運転調整 一式" style={{ minHeight: 70 }}></textarea>
          </div>
          <div style={{ borderTop: "1px solid #3a4048", margin: "4px 0 14px" }}></div>
          <div className="field">
            <label>取引先（マスタから選択）</label>
            <select value={doc.clientId} onChange={(e) => selectClient(e.target.value)}>
              <option value="">— 手入力 / 未選択 —</option>
              {data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label>取引先名</label>
              <input value={doc.client.name} onChange={(e) => patchClient({ name: e.target.value })} placeholder="株式会社〇〇" />
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label>敬称</label>
              <select value={doc.client.honor} onChange={(e) => patchClient({ honor: e.target.value })}>
                <option value="御中">御中</option>
                <option value="様">様</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>住所</label>
            <input value={doc.client.address} onChange={(e) => patchClient({ address: e.target.value })} placeholder="住所" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>TEL</label>
              <input value={doc.client.tel} onChange={(e) => patchClient({ tel: e.target.value })} />
            </div>
            <div className="field">
              <label>ご担当者</label>
              <input value={doc.client.contact} onChange={(e) => patchClient({ contact: e.target.value })} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>{meta.dateLabel}</label>
              <input type="date" value={doc.date} onChange={(e) => patch({ date: e.target.value })} />
            </div>
            {meta.extraDate && (
              <div className="field">
                <label>{meta.extraDate.label}</label>
                <input type="date" value={doc[meta.extraDate.key] || ""} onChange={(e) => patch({ [meta.extraDate.key]: e.target.value })} />
              </div>
            )}
          </div>

          <div className="field">
            <label>状態</label>
            <select value={doc.status} onChange={(e) => patch({ status: e.target.value })}>
              <option value="draft">下書き</option>
              <option value="sent">送付済</option>
              <option value="done">完了</option>
            </select>
          </div>

          {doc.docType === "invoice" && (
            <div style={{ background: "#1d2126", border: "1px solid #454b53", borderRadius: 4, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "var(--line)", marginBottom: 8, fontWeight: 700 }}>入金管理</div>
              <div className="field">
                <label>入金状況</label>
                <select value={doc.paymentStatus || "unpaid"} onChange={(e) => patch({ paymentStatus: e.target.value })}>
                  <option value="unpaid">未入金</option>
                  <option value="partial">一部入金</option>
                  <option value="paid">入金済み</option>
                </select>
              </div>
              {(doc.paymentStatus === "partial" || doc.paymentStatus === "paid") && (
                <div className="field-row">
                  <div className="field">
                    <label>入金額</label>
                    <input type="number" value={doc.paidAmount || 0} onChange={(e) => patch({ paidAmount: Number(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label>入金日</label>
                    <input type="date" value={doc.paidDate || ""} onChange={(e) => patch({ paidDate: e.target.value })} />
                  </div>
                </div>
              )}
              {doc.dueDate && doc.paymentStatus !== "paid" && doc.dueDate < todayISO() && (
                <div style={{ color: "var(--danger)", fontSize: 12, fontWeight: 700 }}>⚠ 支払期限({fmtDate(doc.dueDate)})を超過しています</div>
              )}
            </div>
          )}

          <div className="field">
            <label>消費税率（%）</label>
            <input type="number" value={doc.taxRate} onChange={(e) => patch({ taxRate: Number(e.target.value) })} style={{ maxWidth: 100 }} />
          </div>

          <div className="field">
            <label>備考</label>
            <textarea value={doc.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="特記事項があれば入力"></textarea>
          </div>

          {doc.linkedFrom && (
            <div style={{ fontSize: 12, color: "var(--line)", marginBottom: 10 }}>
              ⤴ {DOC_META[doc.linkedFrom.docType].label} {doc.linkedFrom.docNumber} から作成
            </div>
          )}
          {doc.linkedTo && doc.linkedTo.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--line)", marginBottom: 10 }}>
              {doc.linkedTo.map((l, i) => (
                <div key={i}>⤵ {DOC_META[l.docType].label} {l.docNumber} を作成済み</div>
              ))}
            </div>
          )}

          <div className="workflow-actions">
            <button className="btn btn-primary" onClick={onExportPdf}>PDF書き出し</button>
            {meta.next && (
              <button className="btn btn-copper" onClick={() => onCreateNext(doc, meta.next)}>
                {DOC_META[meta.next].label}を作成 →
              </button>
            )}
            <button className="btn btn-ghost" onClick={onBack}>一覧へ戻る</button>
          </div>
        </div>

        <div className="panel">
          <h2>明細</h2>
          <div className="item-header">
            <span>品名</span><span>数量</span><span>単位</span><span>単価</span><span></span>
          </div>
          {doc.items.map(it => (
            <div className="item-row" key={it.id}>
              <input value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} placeholder="品名・作業内容" />
              <input type="number" value={it.qty} onChange={(e) => updateItem(it.id, { qty: e.target.value })} />
              <input value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value })} />
              <input type="number" value={it.unitPrice} onChange={(e) => updateItem(it.id, { unitPrice: e.target.value })} />
              <button className="row-del" onClick={() => removeItem(it.id)} title="削除" aria-label="この行を削除">×</button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={addItem} style={{ marginTop: 6 }}>+ 明細行を追加</button>

          <div style={{ marginTop: 16, borderTop: "1px solid #3a4048", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#c7d0d8", marginBottom: 4 }}>
              <span>小計</span><span className="amount" style={{ color: "#e4e8ec" }}>{yen(totals.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#c7d0d8", marginBottom: 4 }}>
              <span>消費税</span><span className="amount" style={{ color: "#e4e8ec" }}>{yen(totals.tax)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#fff", fontWeight: 700 }}>
              <span>合計</span><span className="amount">{yen(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <h2 style={{ color: "#e4e8ec", fontSize: 13, margin: "24px 0 10px" }}>プレビュー</h2>
      <div className="paper-scroll">
        <PaperPreview doc={doc} company={company} printRef={printRef} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 操作マニュアル                                                         */
/* ---------------------------------------------------------------------- */

const MANUAL_SECTIONS = [
  {
    title: "はじめに",
    body: (
      <div>
        <p>IMkuchouは、見積書・注文書・注文請書・納品書・請求書の5つの書類を1つのアプリで管理するシステムです。</p>
        <ul>
          <li>データはこの端末のブラウザ内(localStorage)にのみ保存されます。サーバーには送信されません。</li>
          <li>ビルドや会員登録は不要で、URLを開くだけですぐに使えます。</li>
          <li>左側のタブで書類の種類を切り替えます。一番下に「経営レポート」「マスタ管理」「自社設定」があります。</li>
        </ul>
        <div className="note">別の端末(PCとスマホなど)ではデータは共有されません。同じデータを使いたい場合は「自社設定」→「データのバックアップ」からエクスポートし、もう一方の端末でインポートしてください。</div>
      </div>
    ),
  },
  {
    title: "書類の作成方法",
    body: (
      <div>
        <ol>
          <li>左のタブから作りたい書類(例:見積書)を選ぶ</li>
          <li>一覧画面右上の「<span className="kbd">+ 新規見積書</span>」を押す</li>
          <li>取引先を選択(マスタ未登録なら手入力もできます)、明細行を入力</li>
          <li>自動的に小計・消費税・合計が計算され、下部にプレビューが表示されます</li>
          <li>「PDF書き出し」でPDFとしてダウンロードできます</li>
        </ol>
      </div>
    ),
  },
  {
    title: "書類間の連携(ワークフロー)",
    body: (
      <div>
        <p>2つの方法で書類をつなげて作成できます。</p>
        <ul>
          <li><b>連番通りに次を作る</b>:編集画面下部の「〇〇書を作成→」ボタン。見積書からは注文書、注文書からは注文請書…という順に、取引先・明細・備考を引き継いで次の書類を作成します。</li>
          <li><b>任意の書類から作る</b>:一覧画面の「他の書類から作成」ボタン。たとえば請求書の一覧からこれを押すと、見積書・注文書・納品書など好きな書類を選んで、その内容を引き継いで請求書を直接作成できます(間の書類を省略できます)。</li>
        </ul>
        <p>作成された書類には「⤴ 見積書 EST-2026-001 から作成」のようにリンク元が、元の書類には「⤵ 請求書 INV-2026-001 を作成済み」のようにリンク先が表示されます。</p>
        <div className="note">一度コピーされた後は別々のデータになります。後から元の書類を修正しても、既に作成した先の書類には自動反映されません。</div>
      </div>
    ),
  },
  {
    title: "請求書の入金管理",
    body: (
      <div>
        <p>請求書の編集画面には「入金管理」欄があり、未入金・一部入金・入金済みを記録できます。</p>
        <ul>
          <li>支払期限を過ぎても未入金の請求書は、一覧・編集画面の両方で赤く警告表示されます</li>
          <li>ダッシュボードに未回収金額の合計、未入金件数、期限超過件数が表示されます</li>
        </ul>
      </div>
    ),
  },
  {
    title: "経営レポートの見方",
    body: (
      <div>
        <ul>
          <li><b>月次売上推移</b>:直近12か月分の請求書合計金額を棒グラフで表示(今月はオレンジ)</li>
          <li><b>取引先別売上ランキング</b>:請求書ベースで取引先ごとの売上合計・入金済み額・構成比を確認できます</li>
          <li><b>見積 → 成約</b>:見積書のうち、後続の書類(注文書など)が作られた件数の割合です。おおまかな成約率の目安になります</li>
        </ul>
      </div>
    ),
  },
  {
    title: "マスタ管理・自社設定",
    body: (
      <div>
        <p><b>マスタ管理</b>では、よく使う取引先・品目を登録しておくと、書類作成時にプルダウンから選ぶだけで済み入力の手間が減ります。</p>
        <p><b>自社設定</b>では、会社名・住所・振込先・インボイス登録番号を設定します。ここで入力した内容は、すべての書類のプレビュー・PDFに自動的に反映されます(振込先は請求書、インボイス登録番号は請求書のみに表示)。</p>
      </div>
    ),
  },
  {
    title: "データのバックアップ・復元",
    body: (
      <div>
        <p>「自社設定」画面の一番上に「データのバックアップ」があります。</p>
        <ul>
          <li><b>バックアップをダウンロード</b>:全データ(書類・取引先・品目・自社情報)をJSONファイルとして保存します</li>
          <li><b>バックアップから復元</b>:保存したJSONファイルを選択すると、現在のデータを丸ごと置き換えます(確認ダイアログが出ます)</li>
        </ul>
        <div className="note">データはこの端末にしか保存されないため、機種変更・ブラウザのデータ削除に備えて、月1回など定期的にバックアップをダウンロードしておくことを強くおすすめします。</div>
      </div>
    ),
  },
  {
    title: "よくある質問・トラブルシューティング",
    body: (
      <div>
        <ul>
          <li><b>Q. 読み込みが遅い/止まる</b> — 回線が不安定な可能性があります。再読み込みをお試しください。15秒経っても表示されない場合はエラーメッセージと再読み込みボタンが出ます。</li>
          <li><b>Q. 別のスマホ・PCでも同じデータを見たい</b> — 「データのバックアップ」でエクスポートしたファイルを、もう一方の端末でインポートしてください。自動同期はしていません。</li>
          <li><b>Q. 書類番号を打ち間違えて削除してしまった</b> — 一覧から削除すると復元できません。定期的なバックアップをおすすめします。</li>
          <li><b>Q. 消費税率を変えたい</b> — 各書類の編集画面で書類ごとに消費税率を設定できます(既定10%)。</li>
        </ul>
      </div>
    ),
  },
];

function ManualView() {
  return (
    <div style={{ maxWidth: 720 }}>
      {MANUAL_SECTIONS.map((s, i) => (
        <details className="manual-section" key={i} open={i === 0}>
          <summary>{s.title}</summary>
          <div className="manual-body">{s.body}</div>
        </details>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 経営レポート                                                           */
/* ---------------------------------------------------------------------- */

function last12MonthKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}
function monthShortLabel(key) {
  const [y, m] = key.split("-");
  return `${Number(m)}月`;
}

function ReportsView({ data }) {
  const invoices = data.docs.invoice || [];
  const monthKeys = last12MonthKeys();
  const monthTotals = monthKeys.map(key => {
    const total = invoices
      .filter(inv => (inv.date || "").slice(0, 7) === key)
      .reduce((s, inv) => s + calcTotals(inv.items, inv.taxRate).total, 0);
    return { key, total };
  });
  const maxMonthTotal = Math.max(1, ...monthTotals.map(m => m.total));

  const thisMonthKey = monthKeys[monthKeys.length - 1];
  const thisMonthTotal = monthTotals[monthTotals.length - 1].total;
  const yearNow = new Date().getFullYear();
  const yearTotal = invoices
    .filter(inv => (inv.date || "").slice(0, 4) === String(yearNow))
    .reduce((s, inv) => s + calcTotals(inv.items, inv.taxRate).total, 0);
  const avgInvoice = invoices.length ? invoices.reduce((s, inv) => s + calcTotals(inv.items, inv.taxRate).total, 0) / invoices.length : 0;

  // 取引先別ランキング(請求書ベース)
  const byClient = {};
  invoices.forEach(inv => {
    const name = inv.client.name || "(取引先未設定)";
    const total = calcTotals(inv.items, inv.taxRate).total;
    const paid = Math.min(Number(inv.paidAmount) || 0, total);
    if (!byClient[name]) byClient[name] = { name, total: 0, paid: 0, count: 0 };
    byClient[name].total += total;
    byClient[name].paid += (inv.paymentStatus === "paid") ? total : paid;
    byClient[name].count += 1;
  });
  const ranking = Object.values(byClient).sort((a, b) => b.total - a.total);
  const grandTotal = ranking.reduce((s, r) => s + r.total, 0) || 1;

  // 見積の成約率(見積から後続書類が作られた割合、簡易指標)
  const estimates = data.docs.estimate || [];
  const wonEstimates = estimates.filter(e => e.linkedTo && e.linkedTo.length > 0).length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
        <div className="doc-table-wrap" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--line)" }}>{yearNow}年 累計売上(請求書ベース)</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#e4e8ec" }}>{yen(yearTotal)}</div>
        </div>
        <div className="doc-table-wrap" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--line)" }}>今月({monthShortLabel(thisMonthKey)})の売上</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#e4e8ec" }}>{yen(thisMonthTotal)}</div>
        </div>
        <div className="doc-table-wrap" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--line)" }}>請求書1件あたり平均</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#e4e8ec" }}>{yen(avgInvoice)}</div>
        </div>
        <div className="doc-table-wrap" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "var(--line)" }}>見積 → 成約(件)</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, color: "#e4e8ec" }}>{wonEstimates} / {estimates.length}</div>
        </div>
      </div>

      <div className="doc-table-wrap" style={{ padding: 18, marginBottom: 20 }}>
        <h2 style={{ fontSize: 12.5, color: "var(--line)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px" }}>月次売上推移(直近12か月・請求書ベース)</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160 }}>
          {monthTotals.map(m => (
            <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontSize: 9.5, color: "var(--line)", fontFamily: "var(--font-mono)", marginBottom: 4, whiteSpace: "nowrap" }}>
                {m.total > 0 ? Math.round(m.total / 1000) + "k" : ""}
              </div>
              <div
                title={`${m.key}: ${yen(m.total)}`}
                style={{
                  width: "100%",
                  maxWidth: 34,
                  height: `${Math.max(2, (m.total / maxMonthTotal) * 120)}px`,
                  background: m.key === thisMonthKey ? "var(--copper)" : "var(--steel)",
                  borderRadius: "2px 2px 0 0",
                }}
              ></div>
              <div style={{ fontSize: 10, color: "var(--line)", marginTop: 6 }}>{monthShortLabel(m.key)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="doc-table-wrap" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 12.5, color: "var(--line)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>取引先別 売上ランキング(請求書ベース)</h2>
        {ranking.length === 0 ? (
          <div className="empty-state"><p>請求書がまだ作成されていません。</p></div>
        ) : (
          <table className="doc-table">
            <thead><tr><th>#</th><th>取引先</th><th>請求件数</th><th>売上合計</th><th>入金済み</th><th>構成比</th></tr></thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.name}>
                  <td style={{ color: "var(--line)" }}>{i + 1}</td>
                  <td>{r.name}</td>
                  <td>{r.count}件</td>
                  <td className="amount">{yen(r.total)}</td>
                  <td className="amount" style={{ color: r.paid >= r.total ? "#7fbf8a" : "#c7d0d8" }}>{yen(r.paid)}</td>
                  <td style={{ width: 120 }}>
                    <div style={{ background: "#33383e", borderRadius: 3, overflow: "hidden", height: 8 }}>
                      <div style={{ width: `${(r.total / grandTotal) * 100}%`, background: "var(--steel-light)", height: "100%" }}></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* マスタ管理(取引先・品目)                                               */
/* ---------------------------------------------------------------------- */

function MasterView({ data, setData }) {
  const [modal, setModal] = useState(null); // {type:'client'|'item', editing: obj|null}

  function saveClient(fields) {
    setData(d => {
      const clients = modal.editing
        ? d.clients.map(c => c.id === modal.editing.id ? { ...c, ...fields } : c)
        : [...d.clients, { id: uid(), ...fields }];
      return { ...d, clients };
    });
    setModal(null);
  }
  function deleteClient(id) {
    if (!confirm("この取引先を削除しますか？")) return;
    setData(d => ({ ...d, clients: d.clients.filter(c => c.id !== id) }));
  }
  function saveItem(fields) {
    setData(d => {
      const items = modal.editing
        ? d.items.map(i => i.id === modal.editing.id ? { ...i, ...fields } : i)
        : [...d.items, { id: uid(), ...fields }];
      return { ...d, items };
    });
    setModal(null);
  }
  function deleteItem(id) {
    if (!confirm("この品目を削除しますか？")) return;
    setData(d => ({ ...d, items: d.items.filter(i => i.id !== id) }));
  }

  return (
    <div className="master-grid">
      <div className="panel">
        <h2>取引先マスタ</h2>
        <div className="mini-list">
          {data.clients.length === 0 && <div className="empty-state"><p>取引先が登録されていません。</p></div>}
          {data.clients.map(c => (
            <div className="mini-item" key={c.id}>
              <div>
                <div className="mi-name">{c.name}</div>
                <div className="mi-sub">{c.address}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: "client", editing: c })}>編集</button>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteClient(c.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setModal({ type: "client", editing: null })}>+ 取引先を追加</button>
      </div>

      <div className="panel">
        <h2>品目マスタ（よく使う品目）</h2>
        <div className="mini-list">
          {data.items.length === 0 && <div className="empty-state"><p>品目が登録されていません。</p></div>}
          {data.items.map(i => (
            <div className="mini-item" key={i.id}>
              <div>
                <div className="mi-name">{i.name}</div>
                <div className="mi-sub">{i.unit} / {yen(i.unitPrice)}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: "item", editing: i })}>編集</button>
                <button className="btn btn-ghost btn-sm" onClick={() => deleteItem(i.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setModal({ type: "item", editing: null })}>+ 品目を追加</button>
      </div>

      {modal?.type === "client" && (
        <ClientModal editing={modal.editing} onSave={saveClient} onClose={() => setModal(null)} />
      )}
      {modal?.type === "item" && (
        <ItemModal editing={modal.editing} onSave={saveItem} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function ClientModal({ editing, onSave, onClose }) {
  const [f, setF] = useState(editing || { name: "", honor: "御中", zip: "", address: "", tel: "", fax: "", contact: "" });
  return (
    <Modal title={editing ? "取引先を編集" : "取引先を追加"} onClose={onClose}>
      <div className="field"><label>取引先名</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="field"><label>敬称</label>
        <select value={f.honor} onChange={(e) => setF({ ...f, honor: e.target.value })}>
          <option value="御中">御中</option><option value="様">様</option>
        </select>
      </div>
      <div className="field"><label>郵便番号</label><input value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></div>
      <div className="field"><label>住所</label><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
      <div className="field-row">
        <div className="field"><label>TEL</label><input value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} /></div>
        <div className="field"><label>FAX</label><input value={f.fax} onChange={(e) => setF({ ...f, fax: e.target.value })} /></div>
      </div>
      <div className="field"><label>ご担当者</label><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>キャンセル</button>
        <button className="btn btn-primary" onClick={() => f.name.trim() && onSave(f)}>保存</button>
      </div>
    </Modal>
  );
}

function ItemModal({ editing, onSave, onClose }) {
  const [f, setF] = useState(editing || { name: "", unit: "式", unitPrice: 0 });
  return (
    <Modal title={editing ? "品目を編集" : "品目を追加"} onClose={onClose}>
      <div className="field"><label>品名</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="field-row">
        <div className="field"><label>単位</label><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></div>
        <div className="field"><label>単価</label><input type="number" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: Number(e.target.value) })} /></div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>キャンセル</button>
        <button className="btn btn-primary" onClick={() => f.name.trim() && onSave(f)}>保存</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* 自社設定                                                               */
/* ---------------------------------------------------------------------- */

function SettingsView({ data, setData, showToast }) {
  const [f, setF] = useState(data.company);
  const fileInputRef = useRef(null);
  useEffect(() => setF(data.company), [data.company]);

  function save() {
    setData(d => ({ ...d, company: f }));
    showToast("自社情報を保存しました");
  }

  function exportBackup() {
    const payload = { ...data, exportedAt: new Date().toISOString(), appVersion: "IMkuchou-1" };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = todayISO().replace(/-/g, "");
    a.href = url;
    a.download = `imkuchou_backup_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("バックアップをダウンロードしました");
  }

  function triggerImport() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !parsed.docs) {
          alert("バックアップファイルの形式が正しくありません。");
          return;
        }
        if (!confirm("現在のデータを、選択したバックアップファイルの内容で上書きします。よろしいですか？\n(念のため、上書き前に現在の状態もエクスポートしておくことをおすすめします)")) return;
        const base = defaultData();
        setData({
          company: { ...base.company, ...(parsed.company || {}) },
          clients: parsed.clients || [],
          items: parsed.items || [],
          docs: { ...base.docs, ...(parsed.docs || {}) },
          counters: parsed.counters || {},
        });
        showToast("バックアップを読み込みました");
      } catch (err) {
        alert("ファイルの読み込みに失敗しました。JSON形式のバックアップファイルを選択してください。");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      <div className="panel">
        <h2>データのバックアップ</h2>
        <p style={{ fontSize: 12.5, color: "var(--line)", marginTop: 0, lineHeight: 1.7 }}>
          すべてのデータはこの端末のブラウザ内(localStorage)にのみ保存されています。
          ブラウザのデータ削除・端末の故障・機種変更でデータが失われる可能性があるため、
          定期的にバックアップのダウンロードをおすすめします。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={exportBackup}>バックアップをダウンロード(JSON)</button>
          <button className="btn btn-ghost" onClick={triggerImport}>バックアップから復元</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>
      </div>

      <div className="panel">
        <h2>自社情報</h2>
        <div className="field"><label>会社名</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label>郵便番号</label><input value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></div>
        <div className="field"><label>住所</label><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div className="field-row">
          <div className="field"><label>TEL</label><input value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} /></div>
          <div className="field"><label>FAX</label><input value={f.fax} onChange={(e) => setF({ ...f, fax: e.target.value })} /></div>
        </div>
        <div className="field"><label>インボイス登録番号（請求書に表示）</label><input value={f.invoiceRegNo} onChange={(e) => setF({ ...f, invoiceRegNo: e.target.value })} placeholder="T1234567890123" /></div>

        <h2 style={{ marginTop: 20 }}>振込先情報</h2>
        <div className="field-row">
          <div className="field"><label>銀行名</label><input value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></div>
          <div className="field"><label>支店名</label><input value={f.bankBranch} onChange={(e) => setF({ ...f, bankBranch: e.target.value })} /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>口座種別</label>
            <select value={f.bankType} onChange={(e) => setF({ ...f, bankType: e.target.value })}>
              <option value="普通">普通</option><option value="当座">当座</option>
            </select>
          </div>
          <div className="field"><label>口座番号</label><input value={f.bankNumber} onChange={(e) => setF({ ...f, bankNumber: e.target.value })} /></div>
        </div>
        <div className="field"><label>口座名義</label><input value={f.bankHolder} onChange={(e) => setF({ ...f, bankHolder: e.target.value })} /></div>

        <button className="btn btn-primary" onClick={save}>保存する</button>
      </div>
    </div>

  );
}

/* ---------------------------------------------------------------------- */
/* アプリ本体                                                             */
/* ---------------------------------------------------------------------- */

function App() {
  const [data, setData] = useState(loadData);
  const [activeTab, setActiveTabRaw] = useState("dashboard");
  const [activeDocId, setActiveDocId] = useState(null);
  const [toast, setToast] = useState("");
  const printRef = useRef(null);

  useEffect(() => { saveData(data); }, [data]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function setActiveTab(tab, docId) {
    setActiveTabRaw(tab);
    setActiveDocId(docId || null);
  }

  function updateDoc(docType, id, fields) {
    setData(d => ({
      ...d,
      docs: {
        ...d.docs,
        [docType]: d.docs[docType].map(doc => doc.id === id ? { ...doc, ...fields, updatedAt: new Date().toISOString() } : doc),
      },
    }));
  }

  function createAndOpen(docType, prefill) {
    const newId = uid();
    setData(d => {
      const { number, counterKey, n } = nextDocNumber(d, docType, prefill?.date);
      const blank = makeBlankDoc(docType);
      const newDoc = { ...blank, ...(prefill || {}), id: newId, docNumber: number };
      return {
        ...d,
        docs: { ...d.docs, [docType]: [...d.docs[docType], newDoc] },
        counters: { ...d.counters, [counterKey]: n },
      };
    });
    setActiveTab(docType, newId);
  }

  function deleteDoc(docType, id) {
    if (!confirm("この書類を削除しますか？この操作は取り消せません。")) return;
    setData(d => ({ ...d, docs: { ...d.docs, [docType]: d.docs[docType].filter(x => x.id !== id) } }));
    if (activeDocId === id) setActiveTab(docType, null);
  }

  function handleCreateNext(sourceDoc, nextType) {
    const newId = uid();
    setData(d => {
      const { number, counterKey, n } = nextDocNumber(d, nextType, sourceDoc.date);
      const blank = makeBlankDoc(nextType);
      const newDoc = {
        ...blank,
        id: newId,
        docNumber: number,
        clientId: sourceDoc.clientId,
        client: { ...sourceDoc.client },
        title: sourceDoc.title || "",
        siteName: sourceDoc.siteName || "",
        workOverview: sourceDoc.workOverview || "",
        items: sourceDoc.items.map(it => ({ ...it, id: uid() })),
        taxRate: sourceDoc.taxRate,
        notes: sourceDoc.notes,
        linkedFrom: { docType: sourceDoc.docType, docId: sourceDoc.id, docNumber: sourceDoc.docNumber },
      };
      const updatedSourceList = d.docs[sourceDoc.docType].map(x =>
        x.id === sourceDoc.id
          ? { ...x, linkedTo: [...(x.linkedTo || []), { docType: nextType, docId: newId, docNumber: number }] }
          : x
      );
      return {
        ...d,
        docs: { ...d.docs, [sourceDoc.docType]: updatedSourceList, [nextType]: [...d.docs[nextType], newDoc] },
        counters: { ...d.counters, [counterKey]: n },
      };
    });
    setActiveTab(nextType, newId);
    setToast(`${DOC_META[nextType].label}を作成しました`);
  }

  function exportPdf(doc) {
    if (!printRef.current || !window.html2pdf) { setToast("PDF出力ライブラリの読込に失敗しました"); return; }
    const opt = {
      margin: 0,
      filename: `${doc.docNumber}_${doc.client.name || "書類"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    window.html2pdf().set(opt).from(printRef.current).save();
  }

  let body;
  if (activeTab === "dashboard") {
    body = <Dashboard data={data} setActiveTab={setActiveTab} openNewDoc={(t) => createAndOpen(t)} />;
  } else if (activeTab === "manual") {
    body = <ManualView />;
  } else if (activeTab === "reports") {
    body = <ReportsView data={data} />;
  } else if (activeTab === "master") {
    body = <MasterView data={data} setData={setData} />;
  } else if (activeTab === "settings") {
    body = <SettingsView data={data} setData={setData} showToast={setToast} />;
  } else if (DOC_ORDER.includes(activeTab)) {
    const docs = data.docs[activeTab];
    const activeDoc = activeDocId ? docs.find(d => d.id === activeDocId) : null;
    if (activeDoc) {
      body = (
        <DocEditor
          doc={activeDoc}
          data={data}
          updateDoc={updateDoc}
          company={data.company}
          onBack={() => setActiveTab(activeTab, null)}
          onCreateNext={handleCreateNext}
          onExportPdf={() => exportPdf(activeDoc)}
          printRef={printRef}
        />
      );
    } else {
      body = (
        <DocList
          docType={activeTab}
          docs={docs}
          data={data}
          onOpen={(id) => setActiveTab(activeTab, id)}
          onNew={() => createAndOpen(activeTab)}
          onDelete={(id) => deleteDoc(activeTab, id)}
          onCreateFromSource={handleCreateNext}
        />
      );
    }
  }

  const titleMap = { dashboard: "ホーム", manual: "マニュアル", reports: "経営レポート", master: "マスタ管理", settings: "自社設定" };
  const pageTitle = titleMap[activeTab] || DOC_META[activeTab]?.label || "";
  const pageSub = DOC_ORDER.includes(activeTab)
    ? (activeDocId ? "書類を編集" : `${DOC_META[activeTab].label} 一覧`)
    : "アイエム空調株式会社";

  return (
    <div className="app-shell">
      <Binder activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="main-area">
        <div className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <div className="sub">{pageSub}</div>
          </div>
          {activeTab !== "dashboard" && (
            <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab("dashboard")}>
              🏠 ホーム
            </button>
          )}
        </div>
        <div className="content-scroll">{body}</div>
      </div>
      <Toast message={toast} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
