import type { ScanResult } from "./types.ts";

/** Escape so the embedded JSON never contains a literal </script> */
const toEmbeddedJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c");

export const renderHtml = (result: ScanResult): string => {
  const data = toEmbeddedJson(result);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>UI Strings — ${result.projectDir.split("/").at(-1) ?? ""}</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --text: #1a2233; --muted: #66708a;
    --border: #e2e6ee; --accent: #2456c8; --accent-soft: #e8eefb;
    --edit: #7a4dbf; --edit-soft: #f2ecfb;
    font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-size: 14px; padding-bottom: 70px; }
  header { padding: 20px 24px 0; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .meta { color: var(--muted); font-size: 12px; }
  .stats { display: flex; flex-wrap: wrap; gap: 10px; padding: 14px 24px; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 14px; }
  .stat b { font-size: 18px; }
  .stat span { color: var(--muted); font-size: 11px; display: block; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 0 24px 12px; }
  input[type="search"], select {
    padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--card); color: var(--text); font-size: 13px;
  }
  input[type="search"] { min-width: 260px; }
  .chip, .viewbtn {
    border: 1px solid var(--border); background: var(--card); border-radius: 999px;
    padding: 5px 12px; cursor: pointer; font-size: 12px; color: var(--muted);
    font-family: ui-monospace, monospace;
  }
  .chip.active, .viewbtn.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
  .viewswitch { display: inline-flex; gap: 4px; margin-right: 8px; }
  .viewbtn { font-family: inherit; }
  main { padding: 0 24px 40px; max-width: 1200px; }
  .empty { color: var(--muted); padding: 30px 0; text-align: center; }
  mark { background: #ffe58a; border-radius: 3px; }

  .ctx {
    font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted);
    background: #f2f4f8; border: 1px solid var(--border); border-radius: 5px;
    padding: 1px 6px; white-space: nowrap;
  }
  .cond {
    font-family: ui-monospace, monospace; font-size: 11px; color: #8a6d1d;
    background: #fdf6e3; border: 1px solid #eadfb8; border-radius: 5px;
    padding: 1px 6px; white-space: nowrap;
  }
  .badge { font-family: ui-monospace, monospace; font-size: 11px; border-radius: 6px; padding: 2px 7px; background: var(--accent-soft); color: var(--accent); }
  .badge.interactive { background: #fff3e0; color: #9a5b00; }
  .badge.a11y { background: #eef2ee; color: #3d6b45; }
  .badge.internal, .badge.meta { background: #f0f0f2; color: #6a6a72; }
  .iconbtn {
    border: none; background: none; cursor: pointer; font-size: 13px; color: var(--muted);
    padding: 1px 4px; border-radius: 5px; visibility: hidden;
  }
  .iconbtn:hover { background: var(--accent-soft); }

  /* page view */
  .page { margin-top: 22px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); overflow: hidden; }
  .page-bar {
    display: flex; align-items: center; gap: 8px; padding: 8px 14px;
    background: #eef1f6; border-bottom: 1px solid var(--border);
  }
  .page-bar .route { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted);
    background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 2px 10px; }
  .page-bar .count { margin-left: auto; font-size: 11px; color: var(--muted); }
  .page-body { padding: 14px 20px 12px; }
  .file-divider { display: flex; align-items: center; gap: 8px; margin: 12px 0 6px; color: var(--muted); font-size: 10.5px; font-family: ui-monospace, monospace; }
  .file-divider::before, .file-divider::after { content: ""; flex: 1; border-top: 1px dashed var(--border); }
  .item { display: flex; gap: 8px; align-items: baseline; padding: 3px 4px; border-radius: 6px; }
  .item:hover { background: #fafbfd; }
  .item:hover .iconbtn { visibility: visible; }
  .item .txt { white-space: pre-line; line-height: 1.6; }
  .item.edited .txt { text-decoration: line-through; text-decoration-color: #b3261e88; }
  .item .newtxt { white-space: pre-line; line-height: 1.6; color: var(--edit); font-weight: 600; }
  details { margin: 10px 0 4px; border-top: 1px solid var(--border); }
  summary { cursor: pointer; padding: 8px 0; font-size: 12px; color: var(--muted); font-weight: 600; font-family: ui-monospace, monospace; }

  /* table view */
  .group { margin-top: 18px; }
  .group > h2 {
    font-size: 14px; margin: 0 0 6px; padding: 6px 10px; background: var(--accent-soft);
    color: var(--accent); border-radius: 8px; display: inline-block;
  }
  .group-count { color: var(--muted); font-weight: normal; margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); }
  th, td { text-align: left; padding: 6px 10px; border-top: 1px solid var(--border); vertical-align: top; }
  thead th { border-top: none; background: #fafbfd; color: var(--muted); font-size: 11px; font-weight: 600; }
  td.text { width: 40%; white-space: pre-line; }
  td.loc { color: var(--muted); font-size: 12px; white-space: nowrap; font-family: ui-monospace, monospace; }
  td.mono { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); white-space: nowrap; }
  td.ops { white-space: nowrap; }
  tr:hover .iconbtn { visibility: visible; }
  .newtxt-cell { color: var(--edit); font-weight: 600; }

  /* editor */
  .editbox { flex: 1; }
  .editbox textarea, #promptText {
    width: 100%; min-height: 56px; padding: 8px; border: 1px solid var(--edit);
    border-radius: 8px; font: inherit; font-size: 13px;
  }
  .editbox .row { display: flex; gap: 6px; margin-top: 4px; }
  .smallbtn {
    border: 1px solid var(--border); background: var(--card); border-radius: 6px;
    padding: 4px 10px; cursor: pointer; font-size: 12px;
  }
  .smallbtn.primary { background: var(--edit); border-color: var(--edit); color: #fff; }

  /* bottom bar and modal */
  #fixbar {
    position: fixed; left: 0; right: 0; bottom: 0; display: none; gap: 12px; align-items: center;
    background: var(--edit-soft); border-top: 1px solid var(--edit); padding: 10px 24px; z-index: 10;
  }
  #fixbar.show { display: flex; }
  #fixbar b { color: var(--edit); }
  #modal {
    display: none; position: fixed; inset: 0; background: rgba(20,25,40,0.45); z-index: 20;
    align-items: center; justify-content: center;
  }
  #modal.show { display: flex; }
  #modal .box { background: var(--card); border-radius: 12px; padding: 18px; width: min(760px, 92vw); }
  #modal h2 { margin: 0 0 10px; font-size: 15px; }
  #promptText { min-height: 320px; font-family: ui-monospace, monospace; font-size: 12px; }
  #modal .row { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
</style>
</head>
<body>
<header>
  <h1>UI Strings</h1>
  <div class="meta" id="meta"></div>
</header>
<div class="stats" id="stats"></div>
<div class="controls">
  <span class="viewswitch">
    <button class="viewbtn active" id="btnPage">Page view</button>
    <button class="viewbtn" id="btnTable">Table view</button>
  </span>
  <input type="search" id="search" placeholder="Search text or file name…" />
  <select id="groupSelect"><option value="">All groups</option></select>
  <span id="chips"></span>
</div>
<main id="list"></main>
<div id="fixbar">
  <b><span id="editCount"></span> edits</b>
  <button class="smallbtn primary" id="btnCopyAll">Copy fix prompt</button>
  <button class="smallbtn" id="btnGenerate">Preview prompt</button>
  <button class="smallbtn" id="btnClearEdits">Clear</button>
</div>
<div id="modal">
  <div class="box">
    <h2>Fix Prompt</h2>
    <textarea id="promptText" readonly></textarea>
    <div class="row">
      <button class="smallbtn primary" id="btnCopyPrompt">Copy</button>
      <button class="smallbtn" id="btnCloseModal">Close</button>
    </div>
  </div>
</div>
<script type="application/json" id="data">${data}</script>
<script>
const RESULT = JSON.parse(document.getElementById("data").textContent);
RESULT.entries.forEach((e, i) => { e.id = i; });
const SURFACES = ["visible", "interactive", "a11y", "meta", "internal"];
const state = { view: "page", query: "", group: "", surfaces: new Set(), editingId: null };

const STORAGE_KEY = "ui-strings-edits:" + RESULT.projectDir;
const editKey = (e) => e.file + ":" + e.line + ":" + e.text;
let edits = {};
try { edits = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { edits = {}; }
const saveEdits = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const highlight = (s, q) => {
  const escaped = escapeHtml(s);
  if (!q) return escaped;
  const eq = escapeHtml(q).replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
  return escaped.replace(new RegExp(eq, "gi"), (m) => "<mark>" + m + "</mark>");
};
const contextOf = (e) =>
  e.kind === "array-item" && e.key ? (e.tag ? e.key + " → <" + e.tag + ">" : e.key) :
  e.attr ? e.attr + "=" : e.callee ? e.callee + "()" : e.key ? e.key + ":" : e.tag ? "<" + e.tag + ">" : "";
const condOf = (e) => {
  if (!e.condition) return "";
  if (e.branch === "else") {
    return /^[A-Za-z_$][\\w$.]*$/.test(e.condition) ? "!" + e.condition : "!(" + e.condition + ")";
  }
  return e.condition;
};
const locOf = (e) => e.file + ":" + e.line;

function copyText(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand("copy"); ta.remove();
  return Promise.resolve();
}

function matches(e) {
  if (e.surface === "internal" && !state.surfaces.has("internal")) return false;
  if (state.surfaces.size && !state.surfaces.has(e.surface)) return false;
  if (state.group && e.group !== state.group) return false;
  if (state.query) {
    const q = state.query.toLowerCase();
    if (!e.text.toLowerCase().includes(q) && !e.file.toLowerCase().includes(q)) return false;
  }
  return true;
}

function chipsHtml(e) {
  const ctx = contextOf(e);
  const cond = condOf(e);
  const ctxTitle = e.usedAt ? ' title="render: ' + escapeHtml(e.usedAt) + '"' : "";
  return (ctx ? '<span class="ctx"' + ctxTitle + ">" + escapeHtml(ctx) + "</span>" : "") +
    (cond ? '<span class="cond" title="branching condition">' + escapeHtml(cond) + "</span>" : "");
}

function editorHtml(e) {
  const current = edits[editKey(e)]?.newText ?? e.text;
  return '<span class="editbox">' +
    '<textarea data-edit-input="' + e.id + '">' + escapeHtml(current) + "</textarea>" +
    '<span class="row">' +
    '<button class="smallbtn primary" data-edit-save="' + e.id + '">Save</button>' +
    '<button class="smallbtn" data-edit-cancel="' + e.id + '">Cancel</button>' +
    (edits[editKey(e)] ? '<button class="smallbtn" data-edit-remove="' + e.id + '">Discard edit</button>' : "") +
    "</span></span>";
}

function textHtml(e) {
  const edit = edits[editKey(e)];
  let html = '<span class="txt">' + highlight(e.text, state.query) + "</span>";
  if (edit) html += '<span class="newtxt">→ ' + escapeHtml(edit.newText) + "</span>";
  return html;
}

function itemButtons(e) {
  return '<button class="iconbtn" data-edit="' + e.id + '" title="Edit text">✎</button>' +
    '<button class="iconbtn" data-copy="' + e.id + '" title="Copy row (TSV)">📋</button>';
}

function renderPageView(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push(e);
  }
  let html = "";
  for (const [group, items] of groups) {
    const visible = items.filter((e) => e.surface === "visible");
    const rest = new Map();
    for (const e of items) {
      if (e.surface === "visible") continue;
      if (!rest.has(e.surface)) rest.set(e.surface, []);
      rest.get(e.surface).push(e);
    }
    html += '<section class="page"><div class="page-bar">' +
      '<span class="route">' + escapeHtml(group) + '</span>' +
      '<span class="count">' + items.length + " items</span></div><div class=\\"page-body\\">";
    let currentFile = "";
    const renderItem = (e) => {
      if (state.editingId === e.id) {
        return '<div class="item">' + chipsHtml(e) + editorHtml(e) + "</div>";
      }
      return '<div class="item' + (edits[editKey(e)] ? " edited" : "") + '" title="' + escapeHtml(locOf(e)) + '">' +
        chipsHtml(e) + textHtml(e) + itemButtons(e) + "</div>";
    };
    for (const e of visible) {
      if (e.file !== currentFile) {
        currentFile = e.file;
        html += '<div class="file-divider">' + escapeHtml(e.file.split("/").pop()) + "</div>";
      }
      html += renderItem(e);
    }
    for (const [surface, list] of rest) {
      html += "<details" + (list.some((e) => state.editingId === e.id) ? " open" : "") +
        "><summary>" + surface + " (" + list.length + ")</summary>";
      for (const e of list) html += renderItem(e);
      html += "</details>";
    }
    html += "</div></section>";
  }
  return html;
}

function renderTableView(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.group)) groups.set(e.group, []);
    groups.get(e.group).push(e);
  }
  let html = "";
  for (const [group, items] of groups) {
    html += '<section class="group"><h2>' + escapeHtml(group) +
      '<span class="group-count">' + items.length + " items</span></h2>";
    html += "<table><thead><tr><th>text</th><th>surface</th><th>kind</th><th>context</th><th>location</th><th></th></tr></thead><tbody>";
    for (const e of items) {
      const edit = edits[editKey(e)];
      const cond = condOf(e);
      const textCell = state.editingId === e.id
        ? editorHtml(e)
        : highlight(e.text, state.query) +
          (edit ? '<div class="newtxt-cell">→ ' + escapeHtml(edit.newText) + "</div>" : "");
      html += "<tr><td class=\\"text\\">" + textCell + "</td>" +
        '<td class="mono"><span class="badge ' + e.surface + '">' + e.surface + "</span></td>" +
        '<td class="mono">' + e.kind + "</td>" +
        '<td class="mono"' + (e.usedAt ? ' title="render: ' + escapeHtml(e.usedAt) + '"' : "") + ">" + escapeHtml(contextOf(e)) +
        (cond ? ' <span class="cond">' + escapeHtml(cond) + "</span>" : "") + "</td>" +
        '<td class="loc">' + highlight(locOf(e), state.query) + "</td>" +
        '<td class="ops">' + itemButtons(e) + "</td></tr>";
    }
    html += "</tbody></table></section>";
  }
  return html;
}

function render() {
  const entries = RESULT.entries.filter(matches);
  const uniqueTexts = new Set(entries.map((e) => e.text)).size;
  const files = new Set(entries.map((e) => e.file)).size;
  document.getElementById("meta").textContent =
    RESULT.projectDir + "  /  " + RESULT.srcGlob + "  /  generated: " + RESULT.generatedAt;
  document.getElementById("stats").innerHTML =
    '<div class="stat"><b>' + entries.length + "</b><span>strings shown</span></div>" +
    '<div class="stat"><b>' + uniqueTexts + "</b><span>unique strings</span></div>" +
    '<div class="stat"><b>' + files + "</b><span>files</span></div>" +
    '<div class="stat"><b>' + RESULT.scannedFiles + "</b><span>files scanned</span></div>";
  const list = document.getElementById("list");
  list.innerHTML = entries.length
    ? (state.view === "page" ? renderPageView(entries) : renderTableView(entries))
    : '<div class="empty">No matching strings</div>';
  renderFixbar();
}

function renderFixbar() {
  const count = Object.keys(edits).length;
  const bar = document.getElementById("fixbar");
  bar.classList.toggle("show", count > 0);
  document.getElementById("editCount").textContent = count;
}

function generatePrompt() {
  const list = Object.values(edits);
  const lines = [];
  lines.push("Update the following UI strings. Target repository: " + RESULT.projectDir);
  lines.push("Change only string literals and JSX text. Do not change logic or markup structure.");
  lines.push('Each location is given as "file path:line number". A merged string may span multiple nodes across <br> or inline elements.');
  lines.push("");
  list.forEach((edit, i) => {
    lines.push((i + 1) + ". " + edit.file + ":" + edit.line);
    lines.push("   Current: " + edit.text.replace(/\\n/g, "\\\\n"));
    lines.push("   Replace with: " + edit.newText.replace(/\\n/g, "\\\\n"));
  });
  return lines.join("\\n");
}

document.getElementById("list").addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const byId = (value) => RESULT.entries[Number(value)];
  if (target.dataset.edit !== undefined) {
    state.editingId = Number(target.dataset.edit);
    render();
    const ta = document.querySelector('[data-edit-input="' + state.editingId + '"]');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  } else if (target.dataset.copy !== undefined) {
    const e = byId(target.dataset.copy);
    copyText([e.text, e.surface, e.kind, contextOf(e), locOf(e)].join("\\t"));
    target.textContent = "✓";
    setTimeout(() => { target.textContent = "📋"; }, 800);
  } else if (target.dataset.editSave !== undefined) {
    const e = byId(target.dataset.editSave);
    const ta = document.querySelector('[data-edit-input="' + e.id + '"]');
    const newText = ta.value;
    if (newText !== e.text && newText.trim() !== "") {
      edits[editKey(e)] = { file: e.file, line: e.line, text: e.text, newText };
    } else {
      delete edits[editKey(e)];
    }
    saveEdits();
    state.editingId = null;
    render();
  } else if (target.dataset.editCancel !== undefined) {
    state.editingId = null;
    render();
  } else if (target.dataset.editRemove !== undefined) {
    const e = byId(target.dataset.editRemove);
    delete edits[editKey(e)];
    saveEdits();
    state.editingId = null;
    render();
  }
});

document.getElementById("btnCopyAll").onclick = (event) => {
  copyText(generatePrompt());
  event.target.textContent = "Copied ✓";
  setTimeout(() => { event.target.textContent = "Copy fix prompt"; }, 1200);
};
document.getElementById("btnGenerate").onclick = () => {
  document.getElementById("promptText").value = generatePrompt();
  document.getElementById("modal").classList.add("show");
};
document.getElementById("btnCopyPrompt").onclick = (event) => {
  copyText(document.getElementById("promptText").value);
  event.target.textContent = "Copied";
  setTimeout(() => { event.target.textContent = "Copy"; }, 1000);
};
document.getElementById("btnCloseModal").onclick = () =>
  document.getElementById("modal").classList.remove("show");
document.getElementById("btnClearEdits").onclick = () => {
  edits = {};
  saveEdits();
  render();
};

const surfaceCounts = new Map();
for (const e of RESULT.entries) surfaceCounts.set(e.surface, (surfaceCounts.get(e.surface) ?? 0) + 1);
const chips = document.getElementById("chips");
for (const surface of SURFACES) {
  const count = surfaceCounts.get(surface) ?? 0;
  if (!count) continue;
  const chip = document.createElement("button");
  chip.className = "chip";
  chip.textContent = surface + " " + count;
  chip.onclick = () => {
    state.surfaces.has(surface) ? state.surfaces.delete(surface) : state.surfaces.add(surface);
    chip.classList.toggle("active");
    render();
  };
  chips.appendChild(chip);
}

const btnPage = document.getElementById("btnPage");
const btnTable = document.getElementById("btnTable");
btnPage.onclick = () => { state.view = "page"; btnPage.classList.add("active"); btnTable.classList.remove("active"); render(); };
btnTable.onclick = () => { state.view = "table"; btnTable.classList.add("active"); btnPage.classList.remove("active"); render(); };

const groupSelect = document.getElementById("groupSelect");
for (const group of [...new Set(RESULT.entries.map((e) => e.group))].sort()) {
  const option = document.createElement("option");
  option.value = group;
  option.textContent = group;
  groupSelect.appendChild(option);
}
groupSelect.onchange = () => { state.group = groupSelect.value; render(); };
document.getElementById("search").oninput = (event) => {
  state.query = event.target.value.trim();
  render();
};
render();
</script>
</body>
</html>
`;
};
