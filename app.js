// Flippancy — local-only decision + retro app
// All data lives in localStorage. No network. No tracking. No nonsense.

const STORE_KEY = "flippancy_v1";
const THEME_KEY = "flippancy_theme";

const state = {
  mode: "gentle",
  retroType: "daily",
  varyTemp: false, // bumped by Regenerate to get a different take
};

// ---------- storage ----------

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { decisions: [], retros: [] };
    const parsed = JSON.parse(raw);
    return {
      decisions: parsed.decisions || [],
      retros: parsed.retros || [],
    };
  } catch {
    return { decisions: [], retros: [] };
  }
}

function save(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
}

let data = load();

// ---------- theme ----------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

applyTheme(localStorage.getItem(THEME_KEY) || "dark");

document.getElementById("theme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
});

// ---------- tabs ----------

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "history") renderHistory();
    if (btn.dataset.tab === "retro") renderRetroForm();
  });
});

document.getElementById("openSettings").addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.getElementById("settings").classList.add("active");
  // mark no main tab as active (it's the gear, not a tab)
});

// ---------- settings: about me + history count ----------

const ABOUT_KEY = "flippancy_about_me";
const HIST_KEY = "flippancy_history_count";
const aboutEl = document.getElementById("aboutMe");
const aboutStatus = document.getElementById("aboutStatus");
const saveAboutBtn = document.getElementById("saveAbout");

aboutEl.value = localStorage.getItem(ABOUT_KEY) || "";
document.getElementById("aboutStatus").textContent = aboutEl.value ? "Saved" : "";

saveAboutBtn.addEventListener("click", () => {
  const v = aboutEl.value.trim();
  if (v) {
    localStorage.setItem(ABOUT_KEY, v);
    aboutStatus.textContent = "Saved ✓";
  } else {
    localStorage.removeItem(ABOUT_KEY);
    aboutStatus.textContent = "Cleared.";
  }
  setTimeout(() => (aboutStatus.textContent = v ? "Saved" : ""), 2000);
});

function getHistoryCount() {
  return parseInt(localStorage.getItem(HIST_KEY) || "5", 10);
}

document.querySelectorAll(".hist-opt").forEach((btn) => {
  const c = parseInt(btn.dataset.count, 10);
  if (c === getHistoryCount()) btn.classList.add("active");
  btn.addEventListener("click", () => {
    document.querySelectorAll(".hist-opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    localStorage.setItem(HIST_KEY, String(c));
  });
});

// ---------- decide ----------

document.querySelectorAll(".mode").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.mode = btn.dataset.mode;
  });
});

document.getElementById("addOption").addEventListener("click", () => {
  const wrap = document.getElementById("options");
  if (wrap.children.length >= 5) return;
  const input = document.createElement("input");
  input.className = "opt";
  input.placeholder = `Option ${String.fromCharCode(65 + wrap.children.length)} — another choice`;
  wrap.appendChild(input);
  input.focus();
});

document.getElementById("decideBtn").addEventListener("click", () => {
  const opts = [...document.querySelectorAll(".opt")]
    .map((i) => i.value.trim())
    .filter(Boolean);
  if (opts.length < 2) {
    shake(document.getElementById("options"));
    return;
  }

  const btn = document.getElementById("decideBtn");
  const phrases = {
    gentle: "Thinking it through…",
    brutal: "Cutting the crap…",
    sarcastic: "Wow, deciding is hard, huh…",
  };
  btn.textContent = phrases[state.mode];
  btn.disabled = true;

  setTimeout(() => {
    const verdict = argue(opts);
    renderResult(opts, verdict);
    document.getElementById("llmBtn").classList.remove("hidden");
    document.getElementById("llmBtn").dataset.options = JSON.stringify(opts);
    btn.textContent = "Arguing… I mean, deciding ➜";
    btn.disabled = false;
  }, 700);
});

// ---------- decision logic ----------

const toneLib = {
  gentle: {
    pick: (winner, losers) =>
      `Go with <b>${escape(winner)}</b>. The others aren't wrong — they're just not this one, for you, right now.`,
    roast: (history) =>
      history.length
        ? `<br><br><i>By the way — you've gone back and forth on similar things ${history.length} time${
            history.length === 1 ? "" : "s"
          } before. Trust yourself this time?</i>`
        : "",
  },
  brutal: {
    pick: (winner, losers) =>
      `<b>${escape(winner)}</b>. Stop hedging. The others are just exits you're keeping open so you don't have to commit. Pick this and move.`,
    roast: (history) =>
      history.length
        ? `<br><br><i>You've chickened out ${history.length} time${
            history.length === 1 ? "" : "s"
          } on stuff like this. Don't be that person again.</i>`
        : `<br><br><i>First decision logged. Try not to overrule it in 20 minutes.</i>`,
  },
  sarcastic: {
    pick: (winner, losers) =>
      `Oh look, after all that drama, it's <b>${escape(winner)}</b>. Shocking. Truly nobody could've seen that coming. Anyway — go do it.`,
    roast: (history) =>
      history.length
        ? `<br><br><i>Also, fun fact: this is decision #${history.length + 1} you've stress-asked about. We should start a support group.</i>`
        : `<br><br><i>Welcome to your first one. Try to make it a streak.</i>`,
  },
};

function argue(opts) {
  // deterministic-ish scoring with a little chaos
  const scored = opts.map((o, i) => {
    const seed = hash(o + Date.now().toString().slice(0, -4) + i);
    const pros = makeProCon(o, "pro", seed);
    const cons = makeProCon(o, "con", seed + 7);
    return { opt: o, pros, cons, score: pseudo(seed) };
  });

  // bias the pick a bit by mode: gentle leans toward middle, brutal toward highest, sarcastic toward chaos
  let winner;
  if (state.mode === "gentle") {
    scored.sort((a, b) => Math.abs(a.score - 0.5) - Math.abs(b.score - 0.5));
    winner = scored[0];
  } else if (state.mode === "brutal") {
    scored.sort((a, b) => b.score - a.score);
    winner = scored[0];
  } else {
    // sarcastic: pick randomly but feel confident
    winner = scored[Math.floor(pseudo(hash("sarc-" + opts.join())) * scored.length)];
  }

  const losers = scored.filter((s) => s.opt !== winner.opt);
  return { winner, losers };
}

function makeProCon(opt, kind, seed) {
  // generate from a small library keyed by tone
  const lib = {
    pro: [
      `You keep coming back to "${opt}" — that means something.`,
      `It actually fits the life you're building, not the one you're escaping.`,
      `Future-you will probably thank present-you for this.`,
      `It's the option you'd quietly choose if nobody was watching.`,
      `You already know. You just want permission.`,
      `Cheaper regret than the alternative.`,
    ],
    con: [
      `It's the safer pick. Safer isn't always the right pick.`,
      `You might wonder "what if" for about a week. Then you'll forget.`,
      `It asks something of you. The others don't.`,
      `Easy to explain to other people, harder to explain to yourself.`,
      `It solves today's problem, but maybe not next month's.`,
      `You could be wrong. You won't know until you try.`,
    ],
  };
  const arr = lib[kind];
  return arr[seed % arr.length];
}

function pseudo(n) {
  // simple deterministic 0..1
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function renderResult(opts, verdict) {
  const { winner, losers } = verdict;
  const out = document.getElementById("decideResult");
  const similarHistory = data.decisions.filter((d) =>
    d.options.some((o) => opts.some((x) => similarity(o, x) > 0.5))
  );

  const argueHtml = [winner, ...losers]
    .map(
      (s) => `
        <div>
          <strong>${escape(s.opt)}</strong>
          <div class="argue">
            <div class="pro">+ ${s.pros}</div>
            <div class="con">− ${s.cons}</div>
          </div>
        </div>
      `
    )
    .join("");

  const tone = toneLib[state.mode];
  const pick = tone.pick(winner.opt, losers) + tone.roast(similarHistory);

  out.innerHTML = `
    <h3>🧠 The case for each</h3>
    ${argueHtml}
    <div class="pick">${pick}</div>
  `;
  out.classList.remove("hidden");

  // save
  data.decisions.unshift({
    id: Date.now(),
    createdAt: new Date().toISOString(),
    options: opts,
    pick: winner.opt,
    mode: state.mode,
  });
  // cap to last 100
  data.decisions = data.decisions.slice(0, 100);
  save(data);
}

function similarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const inter = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return inter / union;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function shake(el) {
  el.style.transition = "transform 0.05s";
  el.style.transform = "translateX(-6px)";
  setTimeout(() => (el.style.transform = "translateX(6px)"), 50);
  setTimeout(() => (el.style.transform = "translateX(-4px)"), 100);
  setTimeout(() => (el.style.transform = "translateX(0)"), 150);
}

// ---------- retro ----------

const questions = {
  daily: [
    { key: "win", q: "What went well today?", hint: "even tiny stuff counts" },
    { key: "drain", q: "What drained you?", hint: "name it, don't perform" },
    { key: "tomorrow", q: "One small win to chase tomorrow?", hint: "specific, doable" },
  ],
  weekly: [
    { key: "win", q: "What were your wins this week?" },
    { key: "drain", q: "What kept draining you?" },
    { key: "lesson", q: "Biggest lesson learned?" },
    { key: "drop", q: "What are you dropping next week?" },
    { key: "double", q: "What are you doubling down on?" },
  ],
};

document.querySelectorAll(".retro-type").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".retro-type").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.retroType = btn.dataset.type;
    renderRetroForm();
  });
});

function renderRetroForm() {
  const form = document.getElementById("retroForm");
  form.innerHTML = "";
  questions[state.retroType].forEach((q) => {
    const wrap = document.createElement("div");
    wrap.className = "q";
    wrap.innerHTML = `
      <label>${q.q}${q.hint ? `<span class="hint">${q.hint}</span>` : ""}</label>
      <textarea name="${q.key}" rows="2" placeholder="be honest, no one's reading this but you"></textarea>
    `;
    form.appendChild(wrap);
  });
  document.getElementById("retroStatus").textContent = "";
}

renderRetroForm();

document.getElementById("saveRetro").addEventListener("click", () => {
  const form = document.getElementById("retroForm");
  const answers = {};
  let any = false;
  questions[state.retroType].forEach((q) => {
    const el = form.elements[q.key];
    const v = el.value.trim();
    if (v) any = true;
    answers[q.key] = v;
  });
  if (!any) {
    shake(form);
    return;
  }
  data.retros.unshift({
    id: Date.now(),
    createdAt: new Date().toISOString(),
    type: state.retroType,
    answers,
  });
  data.retros = data.retros.slice(0, 200);
  save(data);

  const status = document.getElementById("retroStatus");
  status.textContent = "Saved. Future-you says thanks ✨";
  form.reset();
  setTimeout(() => (status.textContent = ""), 3000);
});

// ---------- history ----------

function renderHistory() {
  const list = document.getElementById("historyList");
  const items = [
    ...data.decisions.map((d) => ({ kind: "decision", ...d })),
    ...data.retros.map((r) => ({ kind: "retro", ...r })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!items.length) {
    list.innerHTML = `<div class="empty">Nothing here yet. Make a decision or write a retro to get started.</div>`;
    return;
  }

  list.innerHTML = items
    .map((it) => {
      const when = new Date(it.createdAt).toLocaleString();
      if (it.kind === "decision") {
        return `
          <div class="entry">
            <div class="meta">
              <span class="tag">🎯 Decision · ${escape(it.mode)}</span>
              <span class="when">${when}</span>
            </div>
            <div class="pick-line">→ ${escape(it.pick)}</div>
            <div class="answers"><div><span>Options:</span>${it.options.map(escape).join(" · ")}</div></div>
          </div>
        `;
      }
      const a = it.answers;
      const rows = Object.entries(a)
        .filter(([, v]) => v)
        .map(([k, v]) => `<div><span>${escape(k)}:</span>${escape(v)}</div>`)
        .join("");
      return `
        <div class="entry">
          <div class="meta">
            <span class="tag">📓 Retro · ${escape(it.type)}</span>
            <span class="when">${when}</span>
          </div>
          <div class="answers">${rows}</div>
        </div>
      `;
    })
    .join("");
}

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flippancy-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clearBtn").addEventListener("click", () => {
  if (!confirm("Wipe everything? Can't undo this.")) return;
  data = { decisions: [], retros: [] };
  save(data);
  renderHistory();
});

// ---------- import ----------

const importStatus = document.getElementById("importStatus");
let pendingImport = null;

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
      const retros = Array.isArray(parsed.retros) ? parsed.retros : [];

      if (!decisions.length && !retros.length) {
        importStatus.textContent = "Hmm, that file doesn't look right.";
        return;
      }

      pendingImport = { decisions, retros, fileName: file.name };
      importStatus.innerHTML = `Found <b>${decisions.length}</b> decisions and <b>${retros.length}</b> retros. <button id="confirmMerge" class="ghost" style="padding:4px 10px;margin-left:6px">Merge</button> <button id="confirmReplace" class="ghost" style="padding:4px 10px">Replace</button> <button id="cancelImport" class="ghost" style="padding:4px 10px">Cancel</button>`;

      document.getElementById("confirmMerge").onclick = () => doImport("merge");
      document.getElementById("confirmReplace").onclick = () => doImport("replace");
      document.getElementById("cancelImport").onclick = () => {
        pendingImport = null;
        importStatus.textContent = "Import cancelled.";
        e.target.value = "";
      };
    } catch (err) {
      importStatus.textContent = "Couldn't read that file. Is it a Flippancy export?";
    }
  };
  reader.readAsText(file);
});

function doImport(mode) {
  if (!pendingImport) return;
  const { decisions, retros } = pendingImport;

  if (mode === "replace") {
    if (!confirm("Replace everything with the imported data? Your current data will be lost.")) return;
    data = { decisions, retros };
  } else {
    // merge: dedupe by id, prefer imported
    const seen = new Set();
    const merged = [];
    [...data.decisions, ...decisions].forEach((d) => {
      if (!d || d.id == null) return;
      if (seen.has(d.id)) return;
      seen.add(d.id);
      merged.push(d);
    });
    const seenR = new Set();
    const mergedR = [];
    [...data.retros, ...retros].forEach((r) => {
      if (!r || r.id == null) return;
      if (seenR.has(r.id)) return;
      seenR.add(r.id);
      mergedR.push(r);
    });
    data = {
      decisions: merged.sort((a, b) => (b.id || 0) - (a.id || 0)),
      retros: mergedR.sort((a, b) => (b.id || 0) - (a.id || 0)),
    };
  }

  save(data);
  renderHistory();
  importStatus.textContent = `Imported ✓ (${decisions.length} decisions, ${retros.length} retros)`;
  pendingImport = null;
  document.getElementById("importFile").value = "";
}

// ---------- LLM (Groq — OpenAI-compatible) ----------

const KEY_STORAGE = "flippancy_groq_keys";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // 30 RPM, 1K/day free

function getKeys() {
  try {
    const raw = localStorage.getItem(KEY_STORAGE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveKeys(arr) {
  localStorage.setItem(KEY_STORAGE, JSON.stringify(arr));
}

function addKey(k) {
  const keys = getKeys();
  if (!keys.includes(k)) keys.push(k);
  saveKeys(keys);
}

function clearKeys() {
  localStorage.removeItem(KEY_STORAGE);
  // also nuke any legacy Gemini keys from earlier versions
  localStorage.removeItem("flippancy_gemini_key");
  localStorage.removeItem("flippancy_gemini_keys");
}

function getKey() {
  const keys = getKeys();
  return keys[0] || "";
}

const apiKeyBar = document.getElementById("apiKeyBar");
const apiKeyInput = document.getElementById("apiKeyInput");
const llmBtn = document.getElementById("llmBtn");
const saveKeyBtn = document.getElementById("saveKey");

function refreshKeyUi() {
  const keys = getKeys();
  const has = keys.length > 0;
  apiKeyBar.classList.toggle("hidden", has);
  llmBtn.classList.toggle("hidden", !has);
  document.getElementById("keyCount").textContent = has ? `${keys.length} key${keys.length === 1 ? "" : "s"} saved` : "";
  if (has) apiKeyInput.value = "";
}

refreshKeyUi();

saveKeyBtn.addEventListener("click", () => {
  const k = apiKeyInput.value.trim();
  if (!k) return;
  addKey(k);
  refreshKeyUi();
  apiKeyInput.value = "";
});

document.getElementById("verifyKey").addEventListener("click", async () => {
  const k = apiKeyInput.value.trim();
  const resultEl = document.getElementById("keyVerifyResult");
  if (!k) {
    resultEl.textContent = "Paste a key first.";
    return;
  }
  resultEl.textContent = "Checking…";

  // 1. Format check (Groq keys start with gsk_)
  let formatNote = "";
  if (k.startsWith("gsk_")) {
    formatNote = "✅ Looks like a Groq key (`gsk_...`).";
  } else {
    formatNote = "❓ Doesn't look like a Groq key (should start with `gsk_`). Get one free at console.groq.com.";
  }

  // 2. Live test (very small request)
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${k}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 4,
      }),
    });
    const text = await res.text();
    if (res.ok) {
      resultEl.innerHTML = `${formatNote}<br>✅ Live test passed — this key works right now.`;
    } else if (res.status === 429) {
      resultEl.innerHTML = `${formatNote}<br>❌ Live test got 429 (rate limited). Try again in a minute.`;
    } else if (res.status === 401) {
      resultEl.innerHTML = `${formatNote}<br>❌ Live test got 401. Key is invalid or revoked.`;
    } else if (res.status === 403) {
      resultEl.innerHTML = `${formatNote}<br>❌ Live test got 403. Key forbidden — check permissions.`;
    } else {
      resultEl.innerHTML = `${formatNote}<br>❌ Live test got ${res.status}. ${escape(text.slice(0, 120))}`;
    }
  } catch (e) {
    resultEl.innerHTML = `${formatNote}<br>❌ Network error: ${escape(e.message)}`;
  }
});

document.getElementById("resetKey").addEventListener("click", () => {
  if (!confirm("Forget all saved API keys?")) return;
  clearKeys();
  refreshKeyUi();
});

const manageKeysBtn = document.getElementById("manageKeysBtn");
function refreshManageBtn() {
  const has = getKeys().length > 0;
  manageKeysBtn.classList.toggle("hidden", !has);
}
refreshManageBtn();

manageKeysBtn.addEventListener("click", () => {
  apiKeyBar.classList.remove("hidden");
  apiKeyInput.focus();
});

// wrap refreshKeyUi to also update manage button
const _refreshKeyUi = refreshKeyUi;
refreshKeyUi = function () {
  _refreshKeyUi();
  refreshManageBtn();
};

// show key bar if user clicks the button while no key
llmBtn.addEventListener("click", () => {
  if (!getKey()) {
    apiKeyBar.classList.remove("hidden");
    apiKeyInput.focus();
    return;
  }
  runLlm();
});

function buildContext() {
  const about = (localStorage.getItem(ABOUT_KEY) || "").trim();
  const count = getHistoryCount();
  let historyBlock = "";

  if (count > 0) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
    const recentDecisions = data.decisions
      .filter((d) => new Date(d.createdAt).getTime() >= cutoff)
      .slice(0, count);
    const recentRetros = data.retros
      .filter((r) => new Date(r.createdAt).getTime() >= cutoff)
      .slice(0, Math.max(2, Math.ceil(count / 2)));

    const decLines = recentDecisions.map((d) => {
      const opts = d.options.map((o) => o.length > 30 ? o.slice(0, 30) + "…" : o).join(" | ");
      return `  - picked "${d.pick}" from [${opts}] (${d.mode})`;
    }).join("\n");

    const retLines = recentRetros.map((r) => {
      const parts = Object.entries(r.answers || {})
        .filter(([, v]) => v && v.trim())
        .map(([k, v]) => `${k}: ${v.length > 200 ? v.slice(0, 200) + "…" : v}`)
        .join("; ");
      return parts ? `  - [${r.type}] ${parts}` : "";
    }).filter(Boolean).join("\n");

    if (decLines || retLines) {
      historyBlock = `\n\nRecent history (last 30 days, used for pattern-spotting — do not invent beyond this):
${decLines}${retLines ? "\n" + retLines : ""}`;
    }
  }

  return { about, historyBlock };
}

function buildPrompt(opts, mode) {
  const { about, historyBlock } = buildContext();

  const system = `You are Flippancy, a sharp decision coach. Given a list of options, a tone, and (optionally) context about the user, return a JSON object ONLY. No prose, no markdown, no code fences.

Tones:
- gentle: warm, validating, "you already know"
- brutal: direct, cuts hedging, calls out avoidance
- sarcastic: dry, playful, light roast

Rules:
- Use the "About me" context and recent history to make your advice SPECIFIC to this person. Reference their actual situation, not generic advice.
- If you see a real pattern in their history (e.g. always picking the safe option, repeat indecision on the same theme), you can call it out in the roast. Only roast patterns that genuinely show up in the data.
- ONE pro and ONE con per option, each under 14 words.
- Pick exactly one option.
- The "verdict" is ONE sentence, under 25 words, matching the tone. It should feel like advice to a specific person, not a template.
- The "roast" is OPTIONAL — only include if there's a genuine pattern. Max 15 words. Omit if nothing real.
- Never invent context the user didn't give. If no About me is provided, give general-but-honest advice without fabricating personal details.

Output schema (return ONLY this JSON, no other text):
{"options":[{"name":"<option text>","pro":"<short pro>","con":"<short con>"}],"pick":"<option text>","verdict":"<one sharp sentence>","roast":"<optional, omit if nothing real>"}`;

  const userParts = [`Tone: ${mode}`];
  if (about) userParts.push(`About me:\n${about}`);
  if (historyBlock) userParts.push(historyBlock.trim());
  userParts.push(`Options: ${JSON.stringify(opts)}`);
  userParts.push("Return JSON now.");

  return { system, user: userParts.join("\n\n") };
}

async function runLlm(optsOverride = null) {
  const opts = optsOverride || JSON.parse(llmBtn.dataset.options || "[]");
  if (opts.length < 2) return;

  const originalText = llmBtn.textContent;
  const phrases = {
    gentle: "Asking Groq gently…",
    brutal: "Asking Groq to cut the crap…",
    sarcastic: "Asking Groq to roll its eyes…",
  };
  llmBtn.textContent = phrases[state.mode] || "Thinking…";
  llmBtn.disabled = true;

  const keys = getKeys();
  if (!keys.length) {
    apiKeyBar.classList.remove("hidden");
    apiKeyInput.focus();
    llmBtn.textContent = originalText;
    llmBtn.disabled = false;
    return;
  }

  let lastErr = null;
  const { system, user } = buildPrompt(opts, state.mode);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      llmBtn.textContent = i === 0
        ? (phrases[state.mode] || "Thinking…")
        : `Key ${i + 1}/${keys.length} (retry)…`;

      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: state.varyTemp ? 0.9 : (state.mode === "sarcastic" ? 0.9 : 0.4),
          max_tokens: 600,
          response_format: { type: "json_object" },
        }),
      });

      state.varyTemp = false; // reset after each call

      if (res.status === 429 || res.status === 401) {
        lastErr = new Error(
          res.status === 429
            ? `Key #${i + 1} hit rate limit.`
            : `Key #${i + 1} unauthorized — check the key.`
        );
        lastErr.status = res.status;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        let msg;
        if (res.status === 400) {
          msg = `Bad request. ${errText.slice(0, 150)}`;
        } else {
          msg = `Groq error ${res.status}. ${errText.slice(0, 120)}`;
        }
        throw new Error(msg);
      }

      const json = await res.json();
      const raw = json?.choices?.[0]?.message?.content;
      if (!raw) throw new Error("Empty response from Groq.");

      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("Groq returned non-JSON. Try again.");
      }

      renderLlmResult(parsed);
      lastErr = null;
      break;
    } catch (err) {
      if (err.status === 429 || err.status === 401) continue;
      lastErr = err;
      break;
    }
  }

  if (lastErr) {
    const out = document.getElementById("decideResult");
    const allRateLimited = /rate limit/i.test(lastErr.message);
    out.innerHTML = `
      <h3>⚠️ ${allRateLimited ? "All your keys hit the rate limit" : "Couldn't reach Gemini"}</h3>
      <div class="argue"><div class="con">${escape(lastErr.message)}</div></div>
      <div class="sub" style="margin-top:10px">${
        allRateLimited
          ? "Free tier resets soon. Add another key, or wait a few minutes."
          : "Check your setup, or hit the local take above."
      }</div>
    `;
    out.classList.remove("hidden");
  }

  llmBtn.textContent = originalText;
  llmBtn.disabled = false;
}

function renderLlmResult(p) {
  const out = document.getElementById("decideResult");
  const argueHtml = (p.options || [])
    .map(
      (o) => `
        <div>
          <strong>${escape(o.name)}</strong>
          <div class="argue">
            <div class="pro">+ ${escape(o.pro)}</div>
            <div class="con">− ${escape(o.con)}</div>
          </div>
        </div>
      `
    )
    .join("");

  const roast = p.roast ? `<br><br><i>${escape(p.roast)}</i>` : "";

  out.innerHTML = `
    <h3>✨ The real take</h3>
    ${argueHtml}
    <div class="pick">${escape(p.verdict || `Go with ${escape(p.pick)}.`)}${roast}</div>
    <div class="row gap" style="margin-top:12px">
      <button id="regenBtn" class="ghost">🔁 Regenerate</button>
      <button id="tweakBtn" class="ghost">🎚 Same options, different tone</button>
    </div>
  `;
  out.classList.remove("hidden");

  const regen = document.getElementById("regenBtn");
  const tweak = document.getElementById("tweakBtn");

  regen.onclick = () => {
    state.varyTemp = true;
    runLlm();
  };

  tweak.onclick = () => {
    const tones = ["gentle", "brutal", "sarcastic"];
    const next = tones[(tones.indexOf(state.mode) + 1) % tones.length];
    document.querySelectorAll(".mode").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === next);
    });
    state.mode = next;
    runLlm();
  };
}
