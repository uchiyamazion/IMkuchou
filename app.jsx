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
    clientId: "",
    client: { name: "", honor: "御中", zip: "", address: "", tel: "", fax: "", contact: "" },
    items: [blankItemRow()],
    taxRate: 10,
    notes: "",
    status: "draft",
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

  return (
    <div>
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
            <thead><tr><th>番号</th><th>日付</th><th>取引先</th><th>金額</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id}>
                  <td className="doc-num" style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>{d.docNumber}</td>
                  <td style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>{fmtDate(d.date)}</td>
                  <td style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>{d.client?.name || "—"}</td>
                  <td className="amount" style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}>{yen(calcTotals(d.items, d.taxRate).total)}</td>
                  <td style={{ cursor: "pointer" }} onClick={() => onOpen(d.id)}><StatusPill status={d.status} /></td>
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
  useEffect(() => setF(data.company), [data.company]);

  function save() {
    setData(d => ({ ...d, company: f }));
    showToast("自社情報を保存しました");
  }

  return (
    <div className="panel" style={{ maxWidth: 560 }}>
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

  const titleMap = { dashboard: "ホーム", master: "マスタ管理", settings: "自社設定" };
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
        </div>
        <div className="content-scroll">{body}</div>
      </div>
      <Toast message={toast} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
