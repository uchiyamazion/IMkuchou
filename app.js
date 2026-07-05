/* ==========================================================================
   IMkuchou — アイエム空調株式会社 書類統合管理システム
   すべてブラウザ内完結(localStorage)。ビルド不要・GitHub Pagesで直接動作。
   ========================================================================== */

const {
  useState,
  useEffect,
  useRef,
  useMemo
} = React;
const STORAGE_KEY = "imkuchou_data_v1";

/* ---------------------------------------------------------------------- */
/* 書類種別メタ定義                                                       */
/* ---------------------------------------------------------------------- */

const DOC_META = {
  estimate: {
    key: "estimate",
    label: "見積書",
    short: "見積",
    prefix: "EST",
    dateLabel: "見積日",
    extraDate: {
      key: "validUntil",
      label: "有効期限"
    },
    banner: "御見積金額",
    intro: "下記の通りお見積り申し上げます。",
    next: "order"
  },
  order: {
    key: "order",
    label: "注文書",
    short: "注文",
    prefix: "ORD",
    dateLabel: "注文日",
    extraDate: {
      key: "desiredDelivery",
      label: "希望納期"
    },
    banner: "ご注文金額",
    intro: "下記の通り注文いたします。",
    next: "acceptance"
  },
  acceptance: {
    key: "acceptance",
    label: "注文請書",
    short: "請書",
    prefix: "ACC",
    dateLabel: "請書発行日",
    extraDate: null,
    banner: "ご請書金額",
    intro: "下記の通り注文をお請けいたします。",
    next: "delivery"
  },
  delivery: {
    key: "delivery",
    label: "納品書",
    short: "納品",
    prefix: "DLV",
    dateLabel: "納品日",
    extraDate: null,
    banner: "納品金額",
    intro: "下記の通り納品いたします。",
    next: "invoice"
  },
  invoice: {
    key: "invoice",
    label: "請求書",
    short: "請求",
    prefix: "INV",
    dateLabel: "請求日",
    extraDate: {
      key: "dueDate",
      label: "支払期限"
    },
    banner: "ご請求金額",
    intro: "下記の通りご請求申し上げます。",
    next: null
  }
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
      zip: "",
      address: "",
      tel: "",
      fax: "",
      invoiceRegNo: "",
      bankName: "",
      bankBranch: "",
      bankType: "普通",
      bankNumber: "",
      bankHolder: ""
    },
    clients: [],
    items: [],
    docs: {
      estimate: [],
      order: [],
      acceptance: [],
      delivery: [],
      invoice: []
    },
    counters: {}
  };
}
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const base = defaultData();
    return {
      company: {
        ...base.company,
        ...(parsed.company || {})
      },
      clients: parsed.clients || [],
      items: parsed.items || [],
      docs: {
        ...base.docs,
        ...(parsed.docs || {})
      },
      counters: parsed.counters || {}
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
    counterKey,
    n
  };
}
function calcTotals(items, taxRate) {
  const subtotal = (items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const tax = Math.floor(subtotal * (Number(taxRate) || 0) / 100);
  return {
    subtotal,
    tax,
    total: subtotal + tax
  };
}
function blankItemRow() {
  return {
    id: uid(),
    name: "",
    qty: 1,
    unit: "式",
    unitPrice: 0
  };
}
function makeBlankDoc(docType) {
  return {
    id: uid(),
    docType,
    docNumber: "",
    date: todayISO(),
    validUntil: "",
    desiredDelivery: "",
    dueDate: "",
    clientId: "",
    client: {
      name: "",
      honor: "御中",
      zip: "",
      address: "",
      tel: "",
      fax: "",
      contact: ""
    },
    items: [blankItemRow()],
    taxRate: 10,
    notes: "",
    status: "draft",
    paymentStatus: "unpaid",
    // 請求書のみ使用: unpaid / partial / paid
    paidAmount: 0,
    paidDate: "",
    linkedFrom: null,
    linkedTo: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/* ---------------------------------------------------------------------- */
/* 汎用コンポーネント                                                     */
/* ---------------------------------------------------------------------- */

function Toast({
  message
}) {
  if (!message) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, message);
}
function Modal({
  title,
  onClose,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-backdrop",
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": title
  }, /*#__PURE__*/React.createElement("h2", null, title), children));
}
function StatusPill({
  status
}) {
  const map = {
    draft: ["下書き", "status-draft"],
    sent: ["送付済", "status-sent"],
    done: ["完了", "status-done"]
  };
  const [label, cls] = map[status] || map.draft;
  return /*#__PURE__*/React.createElement("span", {
    className: `status-pill ${cls}`
  }, label);
}
function PaymentPill({
  doc
}) {
  const ps = doc.paymentStatus || "unpaid";
  const overdue = doc.dueDate && ps !== "paid" && doc.dueDate < todayISO();
  if (overdue) return /*#__PURE__*/React.createElement("span", {
    className: "status-pill",
    style: {
      background: "#3a1414",
      color: "#f2a0a0"
    }
  }, "期限超過");
  const map = {
    unpaid: ["未入金", "status-draft"],
    partial: ["一部入金", "status-sent"],
    paid: ["入金済み", "status-done"]
  };
  const [label, cls] = map[ps] || map.unpaid;
  return /*#__PURE__*/React.createElement("span", {
    className: `status-pill ${cls}`
  }, label);
}

/* ---------------------------------------------------------------------- */
/* サイドバー(バインダー・タブ)                                          */
/* ---------------------------------------------------------------------- */

function Binder({
  activeTab,
  setActiveTab
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "binder",
    "aria-label": "書類種別"
  }, /*#__PURE__*/React.createElement("button", {
    className: "binder-brand",
    onClick: () => setActiveTab("dashboard"),
    title: "ホームへ"
  }, "IMkuchou"), DOC_ORDER.map(key => /*#__PURE__*/React.createElement("button", {
    key: key,
    className: `tab ${activeTab === key ? "active" : ""}`,
    "data-type": key,
    onClick: () => setActiveTab(key)
  }, /*#__PURE__*/React.createElement("span", {
    className: "tab-dot"
  }), DOC_META[key].label)), /*#__PURE__*/React.createElement("button", {
    className: `tab tab-util ${activeTab === "reports" ? "active" : ""}`,
    onClick: () => setActiveTab("reports"),
    style: {
      writingMode: "horizontal-tb",
      minHeight: "unset"
    }
  }, "経営レポート"), /*#__PURE__*/React.createElement("button", {
    className: `tab tab-util ${activeTab === "master" ? "active" : ""}`,
    onClick: () => setActiveTab("master"),
    style: {
      writingMode: "horizontal-tb",
      minHeight: "unset"
    }
  }, "マスタ管理"), /*#__PURE__*/React.createElement("button", {
    className: `tab tab-util ${activeTab === "settings" ? "active" : ""}`,
    onClick: () => setActiveTab("settings"),
    style: {
      writingMode: "horizontal-tb",
      minHeight: "unset"
    }
  }, "自社設定"));
}

/* ---------------------------------------------------------------------- */
/* ダッシュボード                                                         */
/* ---------------------------------------------------------------------- */

function Dashboard({
  data,
  setActiveTab,
  openNewDoc
}) {
  const counts = DOC_ORDER.map(key => ({
    key,
    label: DOC_META[key].label,
    count: data.docs[key].length,
    draft: data.docs[key].filter(d => d.status === "draft").length
  }));
  const recent = DOC_ORDER.flatMap(key => data.docs[key].map(d => ({
    ...d,
    docType: key
  }))).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 8);
  const invoices = data.docs.invoice || [];
  const today = todayISO();
  const unpaidInvoices = invoices.filter(d => (d.paymentStatus || "unpaid") !== "paid");
  const overdueInvoices = unpaidInvoices.filter(d => d.dueDate && d.dueDate < today);
  const outstandingTotal = unpaidInvoices.reduce((sum, d) => {
    const total = calcTotals(d.items, d.taxRate).total;
    const paid = Number(d.paidAmount) || 0;
    return sum + Math.max(total - paid, 0);
  }, 0);
  return /*#__PURE__*/React.createElement("div", null, invoices.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      marginBottom: 20,
      padding: 16,
      borderColor: overdueInvoices.length ? "var(--danger)" : undefined,
      cursor: "pointer"
    },
    onClick: () => setActiveTab("invoice")
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, "未回収金額(合計)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 26,
      fontWeight: 700,
      color: "#e4e8ec"
    }
  }, yen(outstandingTotal))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, "未入金の請求書"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 26,
      fontWeight: 700,
      color: "#e4e8ec"
    }
  }, unpaidInvoices.length, "件")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, "支払期限超過"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 26,
      fontWeight: 700,
      color: overdueInvoices.length ? "#f2a0a0" : "#e4e8ec"
    }
  }, overdueInvoices.length, "件")))), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      marginBottom: 20,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))",
      gap: 12
    }
  }, counts.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.key,
    style: {
      background: "#1d2126",
      border: "1px solid #3a4048",
      borderRadius: 6,
      padding: "14px 16px",
      cursor: "pointer"
    },
    onClick: () => setActiveTab(c.key)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, c.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 26,
      fontWeight: 700,
      color: "#e4e8ec"
    }
  }, c.count), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--copper)"
    }
  }, "下書き ", c.draft, " 件"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 20
    }
  }, DOC_ORDER.map(key => /*#__PURE__*/React.createElement("button", {
    key: key,
    className: "btn btn-primary",
    onClick: () => openNewDoc(key)
  }, "+ 新規", DOC_META[key].label))), /*#__PURE__*/React.createElement("h2", {
    style: {
      color: "#e4e8ec",
      fontSize: 14,
      marginBottom: 10
    }
  }, "最近更新した書類"), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap"
  }, recent.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icon"
  }, "📄"), /*#__PURE__*/React.createElement("p", null, "まだ書類がありません。上のボタンから作成できます。")) : /*#__PURE__*/React.createElement("table", {
    className: "doc-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "種別"), /*#__PURE__*/React.createElement("th", null, "番号"), /*#__PURE__*/React.createElement("th", null, "日付"), /*#__PURE__*/React.createElement("th", null, "取引先"), /*#__PURE__*/React.createElement("th", null, "金額"), /*#__PURE__*/React.createElement("th", null, "状態"))), /*#__PURE__*/React.createElement("tbody", null, recent.map(d => /*#__PURE__*/React.createElement("tr", {
    key: d.id,
    style: {
      cursor: "pointer"
    },
    onClick: () => setActiveTab(d.docType, d.id)
  }, /*#__PURE__*/React.createElement("td", null, DOC_META[d.docType].label), /*#__PURE__*/React.createElement("td", {
    className: "doc-num"
  }, d.docNumber), /*#__PURE__*/React.createElement("td", null, fmtDate(d.date)), /*#__PURE__*/React.createElement("td", null, d.client?.name || "—"), /*#__PURE__*/React.createElement("td", {
    className: "amount"
  }, yen(calcTotals(d.items, d.taxRate).total)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(StatusPill, {
    status: d.status
  }))))))));
}

/* ---------------------------------------------------------------------- */
/* 書類一覧                                                               */
/* ---------------------------------------------------------------------- */

function SourceDocModal({
  data,
  targetType,
  onPick,
  onClose
}) {
  const [query, setQuery] = useState("");
  const candidates = DOC_ORDER.filter(t => t !== targetType).flatMap(t => data.docs[t].map(d => ({
    ...d,
    docType: t
  }))).filter(d => !query || d.docNumber.includes(query) || (d.client?.name || "").includes(query)).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return /*#__PURE__*/React.createElement(Modal, {
    title: `${DOC_META[targetType].label}を他の書類から作成`,
    onClose: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "コピー元を選択(取引先・明細・備考を引き継ぎます)"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    placeholder: "書類番号・取引先名で検索",
    value: query,
    onChange: e => setQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "mini-list",
    style: {
      maxHeight: 320,
      overflowY: "auto"
    }
  }, candidates.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("p", null, "コピー元になる書類が見つかりません。")), candidates.map(d => /*#__PURE__*/React.createElement("div", {
    className: "mini-item",
    key: `${d.docType}-${d.id}`,
    style: {
      cursor: "pointer"
    },
    onClick: () => onPick(d)
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mi-name"
  }, DOC_META[d.docType].label, " ", /*#__PURE__*/React.createElement("span", {
    className: "doc-num"
  }, d.docNumber)), /*#__PURE__*/React.createElement("div", {
    className: "mi-sub"
  }, d.client?.name || "取引先未設定", " ／ ", fmtDate(d.date), " ／ ", yen(calcTotals(d.items, d.taxRate).total))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm"
  }, "この内容で作成")))), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "キャンセル")));
}
function DocList({
  docType,
  docs,
  onOpen,
  onNew,
  onDelete,
  data,
  onCreateFromSource
}) {
  const [query, setQuery] = useState("");
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const filtered = docs.filter(d => !query || d.docNumber.includes(query) || (d.client?.name || "").includes(query)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 14,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "書類番号・取引先名で検索",
    value: query,
    onChange: e => setQuery(e.target.value),
    style: {
      flex: "1 1 240px",
      background: "#1d2126",
      border: "1px solid #454b53",
      color: "#e4e8ec",
      padding: "8px 12px",
      borderRadius: 3
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setShowSourcePicker(true)
  }, "他の書類から作成"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onNew
  }, "+ 新規", DOC_META[docType].label)), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap"
  }, filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("div", {
    className: "icon"
  }, "📁"), /*#__PURE__*/React.createElement("p", null, DOC_META[docType].label, "がまだありません。"), /*#__PURE__*/React.createElement("p", null, "「+ 新規", DOC_META[docType].label, "」、または「他の書類から作成」をお試しください。")) : /*#__PURE__*/React.createElement("table", {
    className: "doc-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "番号"), /*#__PURE__*/React.createElement("th", null, "日付"), /*#__PURE__*/React.createElement("th", null, "取引先"), /*#__PURE__*/React.createElement("th", null, "金額"), /*#__PURE__*/React.createElement("th", null, "状態"), docType === "invoice" && /*#__PURE__*/React.createElement("th", null, "入金"), /*#__PURE__*/React.createElement("th", null))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(d => /*#__PURE__*/React.createElement("tr", {
    key: d.id
  }, /*#__PURE__*/React.createElement("td", {
    className: "doc-num",
    style: {
      cursor: "pointer"
    },
    onClick: () => onOpen(d.id)
  }, d.docNumber), /*#__PURE__*/React.createElement("td", {
    style: {
      cursor: "pointer"
    },
    onClick: () => onOpen(d.id)
  }, fmtDate(d.date)), /*#__PURE__*/React.createElement("td", {
    style: {
      cursor: "pointer"
    },
    onClick: () => onOpen(d.id)
  }, d.client?.name || "—"), /*#__PURE__*/React.createElement("td", {
    className: "amount",
    style: {
      cursor: "pointer"
    },
    onClick: () => onOpen(d.id)
  }, yen(calcTotals(d.items, d.taxRate).total)), /*#__PURE__*/React.createElement("td", {
    style: {
      cursor: "pointer"
    },
    onClick: () => onOpen(d.id)
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: d.status
  })), docType === "invoice" && /*#__PURE__*/React.createElement("td", {
    style: {
      cursor: "pointer"
    },
    onClick: () => onOpen(d.id)
  }, /*#__PURE__*/React.createElement(PaymentPill, {
    doc: d
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: () => onDelete(d.id)
  }, "削除"))))))), showSourcePicker && /*#__PURE__*/React.createElement(SourceDocModal, {
    data: data,
    targetType: docType,
    onClose: () => setShowSourcePicker(false),
    onPick: sourceDoc => {
      setShowSourcePicker(false);
      onCreateFromSource(sourceDoc, docType);
    }
  }));
}

/* ---------------------------------------------------------------------- */
/* 紙面プレビュー(PDF出力対象)                                            */
/* ---------------------------------------------------------------------- */

function PaperPreview({
  doc,
  company,
  printRef
}) {
  const meta = DOC_META[doc.docType];
  const totals = calcTotals(doc.items, doc.taxRate);
  return /*#__PURE__*/React.createElement("div", {
    className: "paper",
    ref: printRef
  }, /*#__PURE__*/React.createElement("div", {
    className: "control-corner"
  }, "No. ", doc.docNumber), /*#__PURE__*/React.createElement("div", {
    className: "paper-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "paper-title"
  }, meta.label), /*#__PURE__*/React.createElement("div", {
    className: "paper-docnum"
  }, doc.docNumber)), /*#__PURE__*/React.createElement("div", {
    className: "paper-company"
  }, /*#__PURE__*/React.createElement("div", {
    className: "name"
  }, company.name), company.zip && /*#__PURE__*/React.createElement("div", null, "〒", company.zip), company.address && /*#__PURE__*/React.createElement("div", null, company.address), (company.tel || company.fax) && /*#__PURE__*/React.createElement("div", null, company.tel && `TEL ${company.tel}`, " ", company.fax && `FAX ${company.fax}`), doc.docType === "invoice" && company.invoiceRegNo && /*#__PURE__*/React.createElement("div", null, "登録番号 ", company.invoiceRegNo))), /*#__PURE__*/React.createElement("div", {
    className: "paper-parties"
  }, /*#__PURE__*/React.createElement("div", {
    className: "paper-client"
  }, /*#__PURE__*/React.createElement("div", {
    className: "client-name"
  }, doc.client.name || "（取引先未設定）", " ", doc.client.honor), doc.client.zip && /*#__PURE__*/React.createElement("div", null, "〒", doc.client.zip), doc.client.address && /*#__PURE__*/React.createElement("div", null, doc.client.address), doc.client.tel && /*#__PURE__*/React.createElement("div", null, "TEL ", doc.client.tel), doc.client.contact && /*#__PURE__*/React.createElement("div", null, "ご担当 ", doc.client.contact, " 様")), /*#__PURE__*/React.createElement("div", {
    className: "paper-date"
  }, /*#__PURE__*/React.createElement("div", null, "発行日\u3000", fmtDate(doc.date)), meta.extraDate && doc[meta.extraDate.key] && /*#__PURE__*/React.createElement("div", null, meta.extraDate.label, "\u3000", fmtDate(doc[meta.extraDate.key])))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      marginBottom: 16
    }
  }, meta.intro), /*#__PURE__*/React.createElement("div", {
    className: "paper-total-banner"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, meta.banner), /*#__PURE__*/React.createElement("span", {
    className: "value"
  }, yen(totals.total), "（税込）")), /*#__PURE__*/React.createElement("table", {
    className: "item-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: "40%"
    }
  }, "品名"), /*#__PURE__*/React.createElement("th", null, "数量"), /*#__PURE__*/React.createElement("th", null, "単位"), /*#__PURE__*/React.createElement("th", null, "単価"), /*#__PURE__*/React.createElement("th", null, "金額"))), /*#__PURE__*/React.createElement("tbody", null, doc.items.map(it => /*#__PURE__*/React.createElement("tr", {
    key: it.id
  }, /*#__PURE__*/React.createElement("td", null, it.name), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, it.qty), /*#__PURE__*/React.createElement("td", null, it.unit), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, yen(it.unitPrice)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, yen((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))))))), /*#__PURE__*/React.createElement("div", {
    className: "paper-totals"
  }, /*#__PURE__*/React.createElement("div", {
    className: "trow"
  }, /*#__PURE__*/React.createElement("span", null, "小計"), /*#__PURE__*/React.createElement("span", {
    className: "val"
  }, yen(totals.subtotal))), /*#__PURE__*/React.createElement("div", {
    className: "trow"
  }, /*#__PURE__*/React.createElement("span", null, "消費税（", doc.taxRate, "%）"), /*#__PURE__*/React.createElement("span", {
    className: "val"
  }, yen(totals.tax))), /*#__PURE__*/React.createElement("div", {
    className: "trow grand"
  }, /*#__PURE__*/React.createElement("span", null, "合計"), /*#__PURE__*/React.createElement("span", {
    className: "val"
  }, yen(totals.total)))), doc.notes && /*#__PURE__*/React.createElement("div", {
    className: "paper-notes"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hd"
  }, "備考"), doc.notes), /*#__PURE__*/React.createElement("div", {
    className: "paper-stamp-area"
  }, /*#__PURE__*/React.createElement("div", {
    className: "stamp-box"
  }, "承認"), /*#__PURE__*/React.createElement("div", {
    className: "stamp-box"
  }, "担当")));
}

/* ---------------------------------------------------------------------- */
/* 書類編集画面                                                           */
/* ---------------------------------------------------------------------- */

function DocEditor({
  doc,
  data,
  updateDoc,
  company,
  onBack,
  onCreateNext,
  onExportPdf,
  printRef
}) {
  const meta = DOC_META[doc.docType];
  const totals = calcTotals(doc.items, doc.taxRate);
  function patch(fields) {
    updateDoc(doc.docType, doc.id, fields);
  }
  function patchClient(fields) {
    updateDoc(doc.docType, doc.id, {
      client: {
        ...doc.client,
        ...fields
      }
    });
  }
  function selectClient(clientId) {
    const c = data.clients.find(c => c.id === clientId);
    if (!c) {
      patch({
        clientId: ""
      });
      return;
    }
    patch({
      clientId,
      client: {
        name: c.name,
        honor: c.honor || "御中",
        zip: c.zip,
        address: c.address,
        tel: c.tel,
        fax: c.fax,
        contact: c.contact
      }
    });
  }
  function updateItem(itemId, fields) {
    patch({
      items: doc.items.map(it => it.id === itemId ? {
        ...it,
        ...fields
      } : it)
    });
  }
  function addItem() {
    patch({
      items: [...doc.items, blankItemRow()]
    });
  }
  function removeItem(itemId) {
    if (doc.items.length <= 1) return;
    patch({
      items: doc.items.filter(it => it.id !== itemId)
    });
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "editor-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h2", null, "基本情報"), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "取引先（マスタから選択）"), /*#__PURE__*/React.createElement("select", {
    value: doc.clientId,
    onChange: e => selectClient(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "— 手入力 / 未選択 —"), data.clients.map(c => /*#__PURE__*/React.createElement("option", {
    key: c.id,
    value: c.id
  }, c.name)))), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "取引先名"), /*#__PURE__*/React.createElement("input", {
    value: doc.client.name,
    onChange: e => patchClient({
      name: e.target.value
    }),
    placeholder: "株式会社〇〇"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      maxWidth: 90
    }
  }, /*#__PURE__*/React.createElement("label", null, "敬称"), /*#__PURE__*/React.createElement("select", {
    value: doc.client.honor,
    onChange: e => patchClient({
      honor: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "御中"
  }, "御中"), /*#__PURE__*/React.createElement("option", {
    value: "様"
  }, "様")))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "住所"), /*#__PURE__*/React.createElement("input", {
    value: doc.client.address,
    onChange: e => patchClient({
      address: e.target.value
    }),
    placeholder: "住所"
  })), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "TEL"), /*#__PURE__*/React.createElement("input", {
    value: doc.client.tel,
    onChange: e => patchClient({
      tel: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "ご担当者"), /*#__PURE__*/React.createElement("input", {
    value: doc.client.contact,
    onChange: e => patchClient({
      contact: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, meta.dateLabel), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: doc.date,
    onChange: e => patch({
      date: e.target.value
    })
  })), meta.extraDate && /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, meta.extraDate.label), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: doc[meta.extraDate.key] || "",
    onChange: e => patch({
      [meta.extraDate.key]: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "状態"), /*#__PURE__*/React.createElement("select", {
    value: doc.status,
    onChange: e => patch({
      status: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "draft"
  }, "下書き"), /*#__PURE__*/React.createElement("option", {
    value: "sent"
  }, "送付済"), /*#__PURE__*/React.createElement("option", {
    value: "done"
  }, "完了"))), doc.docType === "invoice" && /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#1d2126",
      border: "1px solid #454b53",
      borderRadius: 4,
      padding: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)",
      marginBottom: 8,
      fontWeight: 700
    }
  }, "入金管理"), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "入金状況"), /*#__PURE__*/React.createElement("select", {
    value: doc.paymentStatus || "unpaid",
    onChange: e => patch({
      paymentStatus: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "unpaid"
  }, "未入金"), /*#__PURE__*/React.createElement("option", {
    value: "partial"
  }, "一部入金"), /*#__PURE__*/React.createElement("option", {
    value: "paid"
  }, "入金済み"))), (doc.paymentStatus === "partial" || doc.paymentStatus === "paid") && /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "入金額"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: doc.paidAmount || 0,
    onChange: e => patch({
      paidAmount: Number(e.target.value)
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "入金日"), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: doc.paidDate || "",
    onChange: e => patch({
      paidDate: e.target.value
    })
  }))), doc.dueDate && doc.paymentStatus !== "paid" && doc.dueDate < todayISO() && /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--danger)",
      fontSize: 12,
      fontWeight: 700
    }
  }, "⚠ 支払期限(", fmtDate(doc.dueDate), ")を超過しています")), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "消費税率（%）"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: doc.taxRate,
    onChange: e => patch({
      taxRate: Number(e.target.value)
    }),
    style: {
      maxWidth: 100
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "備考"), /*#__PURE__*/React.createElement("textarea", {
    value: doc.notes,
    onChange: e => patch({
      notes: e.target.value
    }),
    placeholder: "特記事項があれば入力"
  })), doc.linkedFrom && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)",
      marginBottom: 10
    }
  }, "⤴ ", DOC_META[doc.linkedFrom.docType].label, " ", doc.linkedFrom.docNumber, " から作成"), doc.linkedTo && doc.linkedTo.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)",
      marginBottom: 10
    }
  }, doc.linkedTo.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, "⤵ ", DOC_META[l.docType].label, " ", l.docNumber, " を作成済み"))), /*#__PURE__*/React.createElement("div", {
    className: "workflow-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: onExportPdf
  }, "PDF書き出し"), meta.next && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-copper",
    onClick: () => onCreateNext(doc, meta.next)
  }, DOC_META[meta.next].label, "を作成 →"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onBack
  }, "一覧へ戻る"))), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h2", null, "明細"), /*#__PURE__*/React.createElement("div", {
    className: "item-header"
  }, /*#__PURE__*/React.createElement("span", null, "品名"), /*#__PURE__*/React.createElement("span", null, "数量"), /*#__PURE__*/React.createElement("span", null, "単位"), /*#__PURE__*/React.createElement("span", null, "単価"), /*#__PURE__*/React.createElement("span", null)), doc.items.map(it => /*#__PURE__*/React.createElement("div", {
    className: "item-row",
    key: it.id
  }, /*#__PURE__*/React.createElement("input", {
    value: it.name,
    onChange: e => updateItem(it.id, {
      name: e.target.value
    }),
    placeholder: "品名・作業内容"
  }), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: it.qty,
    onChange: e => updateItem(it.id, {
      qty: e.target.value
    })
  }), /*#__PURE__*/React.createElement("input", {
    value: it.unit,
    onChange: e => updateItem(it.id, {
      unit: e.target.value
    })
  }), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: it.unitPrice,
    onChange: e => updateItem(it.id, {
      unitPrice: e.target.value
    })
  }), /*#__PURE__*/React.createElement("button", {
    className: "row-del",
    onClick: () => removeItem(it.id),
    title: "削除",
    "aria-label": "この行を削除"
  }, "×"))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: addItem,
    style: {
      marginTop: 6
    }
  }, "+ 明細行を追加"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      borderTop: "1px solid #3a4048",
      paddingTop: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 13,
      color: "#c7d0d8",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", null, "小計"), /*#__PURE__*/React.createElement("span", {
    className: "amount",
    style: {
      color: "#e4e8ec"
    }
  }, yen(totals.subtotal))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 13,
      color: "#c7d0d8",
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("span", null, "消費税"), /*#__PURE__*/React.createElement("span", {
    className: "amount",
    style: {
      color: "#e4e8ec"
    }
  }, yen(totals.tax))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 15,
      color: "#fff",
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("span", null, "合計"), /*#__PURE__*/React.createElement("span", {
    className: "amount"
  }, yen(totals.total)))))), /*#__PURE__*/React.createElement("h2", {
    style: {
      color: "#e4e8ec",
      fontSize: 13,
      margin: "24px 0 10px"
    }
  }, "プレビュー"), /*#__PURE__*/React.createElement("div", {
    className: "paper-scroll"
  }, /*#__PURE__*/React.createElement(PaperPreview, {
    doc: doc,
    company: company,
    printRef: printRef
  })));
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
function ReportsView({
  data
}) {
  const invoices = data.docs.invoice || [];
  const monthKeys = last12MonthKeys();
  const monthTotals = monthKeys.map(key => {
    const total = invoices.filter(inv => (inv.date || "").slice(0, 7) === key).reduce((s, inv) => s + calcTotals(inv.items, inv.taxRate).total, 0);
    return {
      key,
      total
    };
  });
  const maxMonthTotal = Math.max(1, ...monthTotals.map(m => m.total));
  const thisMonthKey = monthKeys[monthKeys.length - 1];
  const thisMonthTotal = monthTotals[monthTotals.length - 1].total;
  const yearNow = new Date().getFullYear();
  const yearTotal = invoices.filter(inv => (inv.date || "").slice(0, 4) === String(yearNow)).reduce((s, inv) => s + calcTotals(inv.items, inv.taxRate).total, 0);
  const avgInvoice = invoices.length ? invoices.reduce((s, inv) => s + calcTotals(inv.items, inv.taxRate).total, 0) / invoices.length : 0;

  // 取引先別ランキング(請求書ベース)
  const byClient = {};
  invoices.forEach(inv => {
    const name = inv.client.name || "(取引先未設定)";
    const total = calcTotals(inv.items, inv.taxRate).total;
    const paid = Math.min(Number(inv.paidAmount) || 0, total);
    if (!byClient[name]) byClient[name] = {
      name,
      total: 0,
      paid: 0,
      count: 0
    };
    byClient[name].total += total;
    byClient[name].paid += inv.paymentStatus === "paid" ? total : paid;
    byClient[name].count += 1;
  });
  const ranking = Object.values(byClient).sort((a, b) => b.total - a.total);
  const grandTotal = ranking.reduce((s, r) => s + r.total, 0) || 1;

  // 見積の成約率(見積から後続書類が作られた割合、簡易指標)
  const estimates = data.docs.estimate || [];
  const wonEstimates = estimates.filter(e => e.linkedTo && e.linkedTo.length > 0).length;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
      gap: 12,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      padding: "14px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, yearNow, "年 累計売上(請求書ベース)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 24,
      fontWeight: 700,
      color: "#e4e8ec"
    }
  }, yen(yearTotal))), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      padding: "14px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, "今月(", monthShortLabel(thisMonthKey), ")の売上"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 24,
      fontWeight: 700,
      color: "#e4e8ec"
    }
  }, yen(thisMonthTotal))), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      padding: "14px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, "請求書1件あたり平均"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 24,
      fontWeight: 700,
      color: "#e4e8ec"
    }
  }, yen(avgInvoice))), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      padding: "14px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--line)"
    }
  }, "見積 → 成約(件)"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 24,
      fontWeight: 700,
      color: "#e4e8ec"
    }
  }, wonEstimates, " / ", estimates.length))), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      padding: 18,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 12.5,
      color: "var(--line)",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      margin: "0 0 16px"
    }
  }, "月次売上推移(直近12か月・請求書ベース)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: 6,
      height: 160
    }
  }, monthTotals.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.key,
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-end",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      color: "var(--line)",
      fontFamily: "var(--font-mono)",
      marginBottom: 4,
      whiteSpace: "nowrap"
    }
  }, m.total > 0 ? Math.round(m.total / 1000) + "k" : ""), /*#__PURE__*/React.createElement("div", {
    title: `${m.key}: ${yen(m.total)}`,
    style: {
      width: "100%",
      maxWidth: 34,
      height: `${Math.max(2, m.total / maxMonthTotal * 120)}px`,
      background: m.key === thisMonthKey ? "var(--copper)" : "var(--steel)",
      borderRadius: "2px 2px 0 0"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--line)",
      marginTop: 6
    }
  }, monthShortLabel(m.key)))))), /*#__PURE__*/React.createElement("div", {
    className: "doc-table-wrap",
    style: {
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 12.5,
      color: "var(--line)",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      margin: "0 0 12px"
    }
  }, "取引先別 売上ランキング(請求書ベース)"), ranking.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("p", null, "請求書がまだ作成されていません。")) : /*#__PURE__*/React.createElement("table", {
    className: "doc-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "#"), /*#__PURE__*/React.createElement("th", null, "取引先"), /*#__PURE__*/React.createElement("th", null, "請求件数"), /*#__PURE__*/React.createElement("th", null, "売上合計"), /*#__PURE__*/React.createElement("th", null, "入金済み"), /*#__PURE__*/React.createElement("th", null, "構成比"))), /*#__PURE__*/React.createElement("tbody", null, ranking.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.name
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      color: "var(--line)"
    }
  }, i + 1), /*#__PURE__*/React.createElement("td", null, r.name), /*#__PURE__*/React.createElement("td", null, r.count, "件"), /*#__PURE__*/React.createElement("td", {
    className: "amount"
  }, yen(r.total)), /*#__PURE__*/React.createElement("td", {
    className: "amount",
    style: {
      color: r.paid >= r.total ? "#7fbf8a" : "#c7d0d8"
    }
  }, yen(r.paid)), /*#__PURE__*/React.createElement("td", {
    style: {
      width: 120
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#33383e",
      borderRadius: 3,
      overflow: "hidden",
      height: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${r.total / grandTotal * 100}%`,
      background: "var(--steel-light)",
      height: "100%"
    }
  })))))))));
}

/* ---------------------------------------------------------------------- */
/* マスタ管理(取引先・品目)                                               */
/* ---------------------------------------------------------------------- */

function MasterView({
  data,
  setData
}) {
  const [modal, setModal] = useState(null); // {type:'client'|'item', editing: obj|null}

  function saveClient(fields) {
    setData(d => {
      const clients = modal.editing ? d.clients.map(c => c.id === modal.editing.id ? {
        ...c,
        ...fields
      } : c) : [...d.clients, {
        id: uid(),
        ...fields
      }];
      return {
        ...d,
        clients
      };
    });
    setModal(null);
  }
  function deleteClient(id) {
    if (!confirm("この取引先を削除しますか？")) return;
    setData(d => ({
      ...d,
      clients: d.clients.filter(c => c.id !== id)
    }));
  }
  function saveItem(fields) {
    setData(d => {
      const items = modal.editing ? d.items.map(i => i.id === modal.editing.id ? {
        ...i,
        ...fields
      } : i) : [...d.items, {
        id: uid(),
        ...fields
      }];
      return {
        ...d,
        items
      };
    });
    setModal(null);
  }
  function deleteItem(id) {
    if (!confirm("この品目を削除しますか？")) return;
    setData(d => ({
      ...d,
      items: d.items.filter(i => i.id !== id)
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "master-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h2", null, "取引先マスタ"), /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, data.clients.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("p", null, "取引先が登録されていません。")), data.clients.map(c => /*#__PURE__*/React.createElement("div", {
    className: "mini-item",
    key: c.id
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mi-name"
  }, c.name), /*#__PURE__*/React.createElement("div", {
    className: "mi-sub"
  }, c.address)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: () => setModal({
      type: "client",
      editing: c
    })
  }, "編集"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: () => deleteClient(c.id)
  }, "削除"))))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    style: {
      marginTop: 12
    },
    onClick: () => setModal({
      type: "client",
      editing: null
    })
  }, "+ 取引先を追加")), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h2", null, "品目マスタ（よく使う品目）"), /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, data.items.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("p", null, "品目が登録されていません。")), data.items.map(i => /*#__PURE__*/React.createElement("div", {
    className: "mini-item",
    key: i.id
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mi-name"
  }, i.name), /*#__PURE__*/React.createElement("div", {
    className: "mi-sub"
  }, i.unit, " / ", yen(i.unitPrice))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: () => setModal({
      type: "item",
      editing: i
    })
  }, "編集"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: () => deleteItem(i.id)
  }, "削除"))))), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    style: {
      marginTop: 12
    },
    onClick: () => setModal({
      type: "item",
      editing: null
    })
  }, "+ 品目を追加")), modal?.type === "client" && /*#__PURE__*/React.createElement(ClientModal, {
    editing: modal.editing,
    onSave: saveClient,
    onClose: () => setModal(null)
  }), modal?.type === "item" && /*#__PURE__*/React.createElement(ItemModal, {
    editing: modal.editing,
    onSave: saveItem,
    onClose: () => setModal(null)
  }));
}
function ClientModal({
  editing,
  onSave,
  onClose
}) {
  const [f, setF] = useState(editing || {
    name: "",
    honor: "御中",
    zip: "",
    address: "",
    tel: "",
    fax: "",
    contact: ""
  });
  return /*#__PURE__*/React.createElement(Modal, {
    title: editing ? "取引先を編集" : "取引先を追加",
    onClose: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "取引先名"), /*#__PURE__*/React.createElement("input", {
    value: f.name,
    onChange: e => setF({
      ...f,
      name: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "敬称"), /*#__PURE__*/React.createElement("select", {
    value: f.honor,
    onChange: e => setF({
      ...f,
      honor: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "御中"
  }, "御中"), /*#__PURE__*/React.createElement("option", {
    value: "様"
  }, "様"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "郵便番号"), /*#__PURE__*/React.createElement("input", {
    value: f.zip,
    onChange: e => setF({
      ...f,
      zip: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "住所"), /*#__PURE__*/React.createElement("input", {
    value: f.address,
    onChange: e => setF({
      ...f,
      address: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "TEL"), /*#__PURE__*/React.createElement("input", {
    value: f.tel,
    onChange: e => setF({
      ...f,
      tel: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "FAX"), /*#__PURE__*/React.createElement("input", {
    value: f.fax,
    onChange: e => setF({
      ...f,
      fax: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "ご担当者"), /*#__PURE__*/React.createElement("input", {
    value: f.contact,
    onChange: e => setF({
      ...f,
      contact: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "キャンセル"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => f.name.trim() && onSave(f)
  }, "保存")));
}
function ItemModal({
  editing,
  onSave,
  onClose
}) {
  const [f, setF] = useState(editing || {
    name: "",
    unit: "式",
    unitPrice: 0
  });
  return /*#__PURE__*/React.createElement(Modal, {
    title: editing ? "品目を編集" : "品目を追加",
    onClose: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "品名"), /*#__PURE__*/React.createElement("input", {
    value: f.name,
    onChange: e => setF({
      ...f,
      name: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "単位"), /*#__PURE__*/React.createElement("input", {
    value: f.unit,
    onChange: e => setF({
      ...f,
      unit: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "単価"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: f.unitPrice,
    onChange: e => setF({
      ...f,
      unitPrice: Number(e.target.value)
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "modal-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onClose
  }, "キャンセル"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: () => f.name.trim() && onSave(f)
  }, "保存")));
}

/* ---------------------------------------------------------------------- */
/* 自社設定                                                               */
/* ---------------------------------------------------------------------- */

function SettingsView({
  data,
  setData,
  showToast
}) {
  const [f, setF] = useState(data.company);
  const fileInputRef = useRef(null);
  useEffect(() => setF(data.company), [data.company]);
  function save() {
    setData(d => ({
      ...d,
      company: f
    }));
    showToast("自社情報を保存しました");
  }
  function exportBackup() {
    const payload = {
      ...data,
      exportedAt: new Date().toISOString(),
      appVersion: "IMkuchou-1"
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
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
          company: {
            ...base.company,
            ...(parsed.company || {})
          },
          clients: parsed.clients || [],
          items: parsed.items || [],
          docs: {
            ...base.docs,
            ...(parsed.docs || {})
          },
          counters: parsed.counters || {}
        });
        showToast("バックアップを読み込みました");
      } catch (err) {
        alert("ファイルの読み込みに失敗しました。JSON形式のバックアップファイルを選択してください。");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 20,
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h2", null, "データのバックアップ"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12.5,
      color: "var(--line)",
      marginTop: 0,
      lineHeight: 1.7
    }
  }, "すべてのデータはこの端末のブラウザ内(localStorage)にのみ保存されています。 ブラウザのデータ削除・端末の故障・機種変更でデータが失われる可能性があるため、 定期的にバックアップのダウンロードをおすすめします。"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: exportBackup
  }, "バックアップをダウンロード(JSON)"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: triggerImport
  }, "バックアップから復元"), /*#__PURE__*/React.createElement("input", {
    ref: fileInputRef,
    type: "file",
    accept: "application/json",
    style: {
      display: "none"
    },
    onChange: handleImportFile
  }))), /*#__PURE__*/React.createElement("div", {
    className: "panel"
  }, /*#__PURE__*/React.createElement("h2", null, "自社情報"), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "会社名"), /*#__PURE__*/React.createElement("input", {
    value: f.name,
    onChange: e => setF({
      ...f,
      name: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "郵便番号"), /*#__PURE__*/React.createElement("input", {
    value: f.zip,
    onChange: e => setF({
      ...f,
      zip: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "住所"), /*#__PURE__*/React.createElement("input", {
    value: f.address,
    onChange: e => setF({
      ...f,
      address: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "TEL"), /*#__PURE__*/React.createElement("input", {
    value: f.tel,
    onChange: e => setF({
      ...f,
      tel: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "FAX"), /*#__PURE__*/React.createElement("input", {
    value: f.fax,
    onChange: e => setF({
      ...f,
      fax: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "インボイス登録番号（請求書に表示）"), /*#__PURE__*/React.createElement("input", {
    value: f.invoiceRegNo,
    onChange: e => setF({
      ...f,
      invoiceRegNo: e.target.value
    }),
    placeholder: "T1234567890123"
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      marginTop: 20
    }
  }, "振込先情報"), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "銀行名"), /*#__PURE__*/React.createElement("input", {
    value: f.bankName,
    onChange: e => setF({
      ...f,
      bankName: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "支店名"), /*#__PURE__*/React.createElement("input", {
    value: f.bankBranch,
    onChange: e => setF({
      ...f,
      bankBranch: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "口座種別"), /*#__PURE__*/React.createElement("select", {
    value: f.bankType,
    onChange: e => setF({
      ...f,
      bankType: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "普通"
  }, "普通"), /*#__PURE__*/React.createElement("option", {
    value: "当座"
  }, "当座"))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "口座番号"), /*#__PURE__*/React.createElement("input", {
    value: f.bankNumber,
    onChange: e => setF({
      ...f,
      bankNumber: e.target.value
    })
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", null, "口座名義"), /*#__PURE__*/React.createElement("input", {
    value: f.bankHolder,
    onChange: e => setF({
      ...f,
      bankHolder: e.target.value
    })
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: save
  }, "保存する")));
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
  useEffect(() => {
    saveData(data);
  }, [data]);
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
        [docType]: d.docs[docType].map(doc => doc.id === id ? {
          ...doc,
          ...fields,
          updatedAt: new Date().toISOString()
        } : doc)
      }
    }));
  }
  function createAndOpen(docType, prefill) {
    const newId = uid();
    setData(d => {
      const {
        number,
        counterKey,
        n
      } = nextDocNumber(d, docType, prefill?.date);
      const blank = makeBlankDoc(docType);
      const newDoc = {
        ...blank,
        ...(prefill || {}),
        id: newId,
        docNumber: number
      };
      return {
        ...d,
        docs: {
          ...d.docs,
          [docType]: [...d.docs[docType], newDoc]
        },
        counters: {
          ...d.counters,
          [counterKey]: n
        }
      };
    });
    setActiveTab(docType, newId);
  }
  function deleteDoc(docType, id) {
    if (!confirm("この書類を削除しますか？この操作は取り消せません。")) return;
    setData(d => ({
      ...d,
      docs: {
        ...d.docs,
        [docType]: d.docs[docType].filter(x => x.id !== id)
      }
    }));
    if (activeDocId === id) setActiveTab(docType, null);
  }
  function handleCreateNext(sourceDoc, nextType) {
    const newId = uid();
    setData(d => {
      const {
        number,
        counterKey,
        n
      } = nextDocNumber(d, nextType, sourceDoc.date);
      const blank = makeBlankDoc(nextType);
      const newDoc = {
        ...blank,
        id: newId,
        docNumber: number,
        clientId: sourceDoc.clientId,
        client: {
          ...sourceDoc.client
        },
        items: sourceDoc.items.map(it => ({
          ...it,
          id: uid()
        })),
        taxRate: sourceDoc.taxRate,
        notes: sourceDoc.notes,
        linkedFrom: {
          docType: sourceDoc.docType,
          docId: sourceDoc.id,
          docNumber: sourceDoc.docNumber
        }
      };
      const updatedSourceList = d.docs[sourceDoc.docType].map(x => x.id === sourceDoc.id ? {
        ...x,
        linkedTo: [...(x.linkedTo || []), {
          docType: nextType,
          docId: newId,
          docNumber: number
        }]
      } : x);
      return {
        ...d,
        docs: {
          ...d.docs,
          [sourceDoc.docType]: updatedSourceList,
          [nextType]: [...d.docs[nextType], newDoc]
        },
        counters: {
          ...d.counters,
          [counterKey]: n
        }
      };
    });
    setActiveTab(nextType, newId);
    setToast(`${DOC_META[nextType].label}を作成しました`);
  }
  function exportPdf(doc) {
    if (!printRef.current || !window.html2pdf) {
      setToast("PDF出力ライブラリの読込に失敗しました");
      return;
    }
    const opt = {
      margin: 0,
      filename: `${doc.docNumber}_${doc.client.name || "書類"}.pdf`,
      image: {
        type: "jpeg",
        quality: 0.98
      },
      html2canvas: {
        scale: 2,
        useCORS: true
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait"
      }
    };
    window.html2pdf().set(opt).from(printRef.current).save();
  }
  let body;
  if (activeTab === "dashboard") {
    body = /*#__PURE__*/React.createElement(Dashboard, {
      data: data,
      setActiveTab: setActiveTab,
      openNewDoc: t => createAndOpen(t)
    });
  } else if (activeTab === "reports") {
    body = /*#__PURE__*/React.createElement(ReportsView, {
      data: data
    });
  } else if (activeTab === "master") {
    body = /*#__PURE__*/React.createElement(MasterView, {
      data: data,
      setData: setData
    });
  } else if (activeTab === "settings") {
    body = /*#__PURE__*/React.createElement(SettingsView, {
      data: data,
      setData: setData,
      showToast: setToast
    });
  } else if (DOC_ORDER.includes(activeTab)) {
    const docs = data.docs[activeTab];
    const activeDoc = activeDocId ? docs.find(d => d.id === activeDocId) : null;
    if (activeDoc) {
      body = /*#__PURE__*/React.createElement(DocEditor, {
        doc: activeDoc,
        data: data,
        updateDoc: updateDoc,
        company: data.company,
        onBack: () => setActiveTab(activeTab, null),
        onCreateNext: handleCreateNext,
        onExportPdf: () => exportPdf(activeDoc),
        printRef: printRef
      });
    } else {
      body = /*#__PURE__*/React.createElement(DocList, {
        docType: activeTab,
        docs: docs,
        data: data,
        onOpen: id => setActiveTab(activeTab, id),
        onNew: () => createAndOpen(activeTab),
        onDelete: id => deleteDoc(activeTab, id),
        onCreateFromSource: handleCreateNext
      });
    }
  }
  const titleMap = {
    dashboard: "ホーム",
    reports: "経営レポート",
    master: "マスタ管理",
    settings: "自社設定"
  };
  const pageTitle = titleMap[activeTab] || DOC_META[activeTab]?.label || "";
  const pageSub = DOC_ORDER.includes(activeTab) ? activeDocId ? "書類を編集" : `${DOC_META[activeTab].label} 一覧` : "アイエム空調株式会社";
  return /*#__PURE__*/React.createElement("div", {
    className: "app-shell"
  }, /*#__PURE__*/React.createElement(Binder, {
    activeTab: activeTab,
    setActiveTab: setActiveTab
  }), /*#__PURE__*/React.createElement("div", {
    className: "main-area"
  }, /*#__PURE__*/React.createElement("div", {
    className: "topbar"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, pageTitle), /*#__PURE__*/React.createElement("div", {
    className: "sub"
  }, pageSub))), /*#__PURE__*/React.createElement("div", {
    className: "content-scroll"
  }, body)), /*#__PURE__*/React.createElement(Toast, {
    message: toast
  }));
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(/*#__PURE__*/React.createElement(App, null));