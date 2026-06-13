import { firebaseConfig } from "./firebase-config.js";

const DEMO_SESSION_ID = "demo";
const DEMO_EVENT = "live-poll-event";
const VOTER_KEY = "live-poll-voter-id";
const STORAGE_KEY = "live-poll-demo-store";
const CHART_COLORS = ["#2457a6", "#146b5f", "#a66a24", "#7b4bb3", "#b33f62", "#5b6778"];

const app = document.querySelector("#app");
const pageTitle = document.querySelector("#pageTitle");
const routeNav = document.querySelector(".route-nav");
let store = null;
let unsubscribe = () => {};

init();

async function init() {
  try {
    store = hasFirebaseConfig() ? await createFirestoreStore() : createLocalStore();
  } catch (error) {
    console.error(error);
    store = createLocalStore();
  }

  setupNavigation();
  window.addEventListener("hashchange", renderRoute);
  window.addEventListener("popstate", renderRoute);
  renderRoute();
}

function hasFirebaseConfig() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

async function createFirestoreStore() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js");
  const {
    getFirestore,
    doc,
    collection,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
  } = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js");

  const firebaseApp = initializeApp(firebaseConfig);
  const db = getFirestore(firebaseApp);

  return {
    async ensureSession(sessionId) {
      const sessionRef = doc(db, "sessions", sessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (sessionSnap.exists()) return;

      const questionId = "q1";
      await setDoc(sessionRef, {
        title: "Demo Live Poll",
        activeQuestionId: questionId,
        status: "open",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "sessions", sessionId, "questions", questionId), defaultQuestion());
    },
    subscribe(sessionId, callback) {
      const sessionRef = doc(db, "sessions", sessionId);
      let stopVotes = () => {};
      let stopQuestion = () => {};

      const stopSession = onSnapshot(sessionRef, (sessionSnap) => {
        if (!sessionSnap.exists()) {
          callback(null);
          return;
        }

        const session = { id: sessionId, ...sessionSnap.data() };
        stopQuestion();
        stopVotes();

        const questionRef = doc(db, "sessions", sessionId, "questions", session.activeQuestionId);
        stopQuestion = onSnapshot(questionRef, (questionSnap) => {
          const question = questionSnap.exists()
            ? { id: questionSnap.id, ...questionSnap.data() }
            : null;

          if (!question) {
            callback({ session, question: null, votes: [] });
            return;
          }

          const votesRef = collection(db, "sessions", sessionId, "questions", question.id, "votes");
          stopVotes = onSnapshot(votesRef, (votesSnap) => {
            const votes = votesSnap.docs.map((vote) => ({ id: vote.id, ...vote.data() }));
            callback({ session, question, votes });
          });
        });
      });

      return () => {
        stopSession();
        stopQuestion();
        stopVotes();
      };
    },
    async saveQuestion(sessionId, title, questionText, optionTexts) {
      const questionId = "q1";
      await setDoc(
        doc(db, "sessions", sessionId),
        {
          title,
          activeQuestionId: questionId,
          status: "open",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await setDoc(doc(db, "sessions", sessionId, "questions", questionId), {
        text: questionText,
        options: optionTexts.map((text, index) => ({ id: optionId(index), text })),
        status: "open",
        order: 1,
        createdAt: serverTimestamp(),
      });
    },

    async setQuestionStatus(sessionId, questionId, status) {
      await updateDoc(doc(db, "sessions", sessionId, "questions", questionId), { status });
      await updateDoc(doc(db, "sessions", sessionId), {
        status,
        updatedAt: serverTimestamp(),
      });
    },
    async vote(sessionId, questionId, voterId, optionIdValue) {
      await setDoc(doc(db, "sessions", sessionId, "questions", questionId, "votes", voterId), {
        optionId: optionIdValue,
        voterId,
        createdAt: serverTimestamp(),
      });
    },
    async resetVotes(sessionId, questionId, votes) {
      await Promise.all(
        votes.map((vote) =>
          deleteDoc(doc(db, "sessions", sessionId, "questions", questionId, "votes", vote.id)),
        ),
      );
      await updateDoc(doc(db, "sessions", sessionId, "questions", questionId), { status: "open" });
      await updateDoc(doc(db, "sessions", sessionId), {
        status: "open",
        updatedAt: serverTimestamp(),
      });
    },
  };
}

function createLocalStore() {
  let listeners = new Set();

  return {
    async ensureSession(sessionId) {
      const data = readDemoStore();
      if (data.sessions[sessionId]) return;

      data.sessions[sessionId] = {
        id: sessionId,
        title: "Demo Live Poll",
        activeQuestionId: "q1",
        status: "open",
      };
      data.questions[sessionId] = {
        q1: defaultQuestion(),
      };
      data.votes[sessionId] = {
        q1: {},
      };
      writeDemoStore(data);
    },
    subscribe(sessionId, callback) {
      const listener = () => callback(readSessionState(sessionId));
      listeners.add(listener);
      listener();
      window.addEventListener("storage", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    async saveQuestion(sessionId, title, questionText, optionTexts) {
      const data = readDemoStore();
      const existingSession = data.sessions[sessionId] || {};
      data.sessions[sessionId] = {
        ...existingSession,
        id: sessionId,
        title,
        activeQuestionId: "q1",
        status: "open",
      };
      data.questions[sessionId] = {
        q1: {
          ...defaultQuestion(),
          text: questionText,
          options: optionTexts.map((text, index) => ({ id: optionId(index), text })),
          status: "open",
        },
      };
      data.votes[sessionId] = { q1: {} };
      writeDemoStore(data);
      notify(listeners);
    },

    async setQuestionStatus(sessionId, questionId, status) {
      const data = readDemoStore();
      data.sessions[sessionId].status = status;
      data.questions[sessionId][questionId].status = status;
      writeDemoStore(data);
      notify(listeners);
    },
    async vote(sessionId, questionId, voterId, optionIdValue) {
      const data = readDemoStore();
      data.votes[sessionId][questionId][voterId] = {
        id: voterId,
        optionId: optionIdValue,
        voterId,
        createdAt: new Date().toISOString(),
      };
      writeDemoStore(data);
      notify(listeners);
    },
    async resetVotes(sessionId, questionId) {
      const data = readDemoStore();
      data.sessions[sessionId].status = "open";
      data.questions[sessionId][questionId].status = "open";
      data.votes[sessionId][questionId] = {};
      writeDemoStore(data);
      notify(listeners);
    },
  };
}

async function renderRoute() {
  unsubscribe();
  app.innerHTML = "";

  const route = parseRoute();
  document.body.dataset.page = route.page;
  updateAdminNav(route.page);
  await store.ensureSession(route.sessionId);

  if (route.page === "screen") {
    renderScreen(route.sessionId);
  } else if (route.page === "admin") {
    renderAdmin(route.sessionId);
  } else {
    renderVote(route.sessionId);
  }
}

function updateAdminNav(page) {
  if (routeNav) {
    routeNav.hidden = page !== "admin";
  }
}

function parseRoute() {
  const pathPage = pageFromPath();

  if (pathPage) {
    return {
      page: pathPage,
      sessionId: DEMO_SESSION_ID,
    };
  }

  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return {
    page: ["vote", "screen", "admin"].includes(parts[0]) ? parts[0] : "vote",
    sessionId: parts[1] || DEMO_SESSION_ID,
  };
}

function pageFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const voteIndex = parts.lastIndexOf("vote");
  const page = voteIndex >= 0 ? parts[voteIndex + 1] : "";

  if (page === "poll") return "vote";
  if (page === "output") return "screen";
  if (page === "adm") return "admin";
  return "";
}

function setupNavigation() {
  document.querySelectorAll("[data-nav-page]").forEach((link) => {
    link.href = buildPageUrl(link.dataset.navPage);
    if (["poll", "output"].includes(link.dataset.navPage)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

function renderVote(sessionId) {
  pageTitle.textContent = "觀眾投票";
  const view = document.querySelector("#voteTemplate").content.cloneNode(true);
  app.append(view);
  app.querySelector("[data-vote-page-qr]").src = createQrUrl(buildPageUrl("poll"));
  let feedbackOptionId = "";
  let feedbackTimer = 0;

  unsubscribe = store.subscribe(sessionId, (state) => {
    if (!state?.question) {
      app.innerHTML = statusPanel("目前沒有開放中的題目。");
      return;
    }

    const { session, question, votes } = state;
    const voterId = getVoterId();
    const existingVote = votes.find((vote) => vote.voterId === voterId || vote.id === voterId);
    const isOpen = question.status === "open";

    app.querySelector("[data-session-title]").textContent = session.title;
    app.querySelector("[data-question-text]").textContent = question.text;
    app.querySelector("[data-question-status]").textContent = isOpen
      ? existingVote
        ? "你已完成投票，選取結果已鎖定。"
        : "請選擇一個選項。"
      : "投票已關閉。";

    const options = app.querySelector("[data-options]");
    options.innerHTML = "";
    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      const isSelected = existingVote?.optionId === option.id;
      button.disabled = !isOpen || Boolean(existingVote);
      button.setAttribute("aria-pressed", String(isSelected));
      button.innerHTML = optionButtonContent(
        option.text,
        feedbackOptionId === option.id || isSelected,
        isSelected ? "已鎖定" : "",
      );
      if (existingVote) {
        options.append(button);
        return;
      }
      button.addEventListener("click", async () => {
        feedbackOptionId = option.id;
        clearTimeout(feedbackTimer);
        button.classList.add("is-submitting");
        button.innerHTML = optionButtonContent(option.text, true, "送出中...");

        try {
          await store.vote(sessionId, question.id, voterId, option.id);
          button.classList.remove("is-submitting");
          button.classList.add("is-sent");
          button.innerHTML = optionButtonContent(option.text, true, "已送出結果");
          feedbackTimer = window.setTimeout(() => {
            feedbackOptionId = "";
            renderRoute();
          }, 1600);
        } catch {
          feedbackOptionId = "";
          button.classList.remove("is-submitting");
          button.classList.add("is-error");
          button.innerHTML = optionButtonContent(option.text, true, "送出失敗");
        }
      });
      options.append(button);
    });
  });
}

function renderScreen(sessionId) {
  pageTitle.textContent = "現場輸出";
  const view = document.querySelector("#screenTemplate").content.cloneNode(true);
  app.append(view);
  let previousCounts = {};
  let previousRanking = [];
  let previousTotal = 0;

  const stopStore = store.subscribe(sessionId, (state) => {
    if (!state?.question) {
      app.innerHTML = statusPanel("目前沒有題目。");
      return;
    }

    const { session, question, votes } = state;
    const counts = countVotes(question.options, votes);
    const total = votes.length;
    const sessionTitle = app.querySelector("[data-session-title]");
    const questionText = app.querySelector("[data-question-text]");
    const totalVotes = app.querySelector("[data-total-votes]");
    const pieChart = app.querySelector("[data-pie-chart]");
    const results = app.querySelector("[data-results]");
    const liveBadges = app.querySelectorAll("[data-live-badge]");

    if (!sessionTitle || !questionText || !totalVotes || !pieChart || !results || !liveBadges.length) {
      return;
    }

    sessionTitle.textContent = session.title;
    questionText.textContent = question.text;
    const isClosed = question.status !== "open";
    const ranking = rankedOptions(question.options, counts);
    liveBadges.forEach((badge) => {
      badge.textContent = isClosed ? "FINAL" : "LIVE";
      badge.dataset.status = isClosed ? "final" : "live";
    });

    animateNumber(totalVotes, previousTotal, total, "總票數 ", " 票");
    renderPieChart(pieChart, question.options, counts, total);

    results.innerHTML = "";
    ranking.forEach((ranked, rankIndex) => {
      const option = ranked.option;
      const count = ranked.count;
      const percent = total ? Math.round((count / total) * 100) : 0;
      const previousCount = previousCounts[option.id] || 0;
      const movedUp = previousRanking.length && previousRanking.indexOf(option.id) > rankIndex;
      const row = document.createElement("article");
      row.className = "result-row";
      row.classList.toggle("is-vote-bump", count > previousCount);
      row.classList.toggle("is-overtake", movedUp);
      row.classList.toggle("is-leader", rankIndex === 0 && total > 0);
      row.classList.toggle("is-winner", isClosed && rankIndex === 0 && total > 0);
      row.innerHTML = `
        <div class="result-head">
          <b class="rank-badge">#${rankIndex + 1}</b>
          <i style="background: ${CHART_COLORS[ranked.index % CHART_COLORS.length]}"></i>
          <strong></strong>
          <span data-result-metric></span>
          <em class="vote-pop" ${count > previousCount ? "" : "hidden"}>+${count - previousCount}</em>
        </div>
        <div class="result-bar" aria-hidden="true">
          <span data-bar-fill style="width: 0%; background: ${CHART_COLORS[ranked.index % CHART_COLORS.length]}"></span>
        </div>
      `;
      row.querySelector("strong").textContent = option.text;
      const metric = row.querySelector("[data-result-metric]");
      metric.classList.toggle("is-pulsing", count > previousCount);
      animateNumber(metric, previousCount, count, "", ` 票 · ${percent}%`);
      results.append(row);
      requestAnimationFrame(() => {
        const bar = row.querySelector("[data-bar-fill]");
        if (bar) bar.style.width = `${percent}%`;
      });
    });

    previousCounts = counts;
    previousRanking = ranking.map((item) => item.id);
    previousTotal = total;
  });

  unsubscribe = () => {
    stopStore();
  };
}

function renderAdmin(sessionId) {
  pageTitle.textContent = "主持人管理";
  const view = document.querySelector("#adminTemplate").content.cloneNode(true);
  app.append(view);

  const form = app.querySelector("[data-question-form]");
  const status = app.querySelector("[data-admin-status]");
  const voteLink = app.querySelector("[data-vote-link]");
  const screenLink = app.querySelector("[data-screen-link]");
  if (voteLink) {
    voteLink.href = buildPageUrl("poll");
    voteLink.target = "_blank";
    voteLink.rel = "noopener noreferrer";
  }
  if (screenLink) {
    screenLink.href = buildPageUrl("output");
    screenLink.target = "_blank";
    screenLink.rel = "noopener noreferrer";
  }

  let currentState = null;

  unsubscribe = store.subscribe(sessionId, (state) => {
    currentState = state;
    if (!state?.question) return;
    form.elements.title.value = state.session.title;
    form.elements.question.value = state.question.text;
    form.elements.options.value = state.question.options.map((option) => option.text).join("\n");
    status.textContent = `目前狀態：${state.question.status}，票數：${state.votes.length}`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const optionTexts = form.elements.options.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (optionTexts.length < 2) {
      status.textContent = "至少需要兩個選項。";
      return;
    }

    await store.saveQuestion(
      sessionId,
      form.elements.title.value.trim(),
      form.elements.question.value.trim(),
      optionTexts,
    );
    status.textContent = "題目已儲存。";
  });

  app.querySelector("[data-open]").addEventListener("click", () => {
    if (currentState?.question) {
      store.setQuestionStatus(sessionId, currentState.question.id, "open");
    }
  });

  app.querySelector("[data-close]").addEventListener("click", () => {
    if (currentState?.question) {
      store.setQuestionStatus(sessionId, currentState.question.id, "closed");
    }
  });

  app.querySelector("[data-reset]").addEventListener("click", async () => {
    if (currentState?.question) {
      await store.resetVotes(sessionId, currentState.question.id, currentState.votes);
      status.textContent = "票數已清除，投票已重新開放。";
    }
  });

}

function renderDownloadPage(sessionId) {
  pageTitle.textContent = "研習下載";
  const section = document.createElement("section");
  section.className = "download-standalone";
  section.innerHTML = `
    <div class="download-standalone-head">
      <p data-session-title></p>
      <h2>研習下載列表</h2>
    </div>
    <section class="download-panel" data-download-panel>
      <div class="download-list" data-download-list></div>
    </section>
  `;
  app.append(section);

  const title = section.querySelector("[data-session-title]");
  const panel = section.querySelector("[data-download-panel]");
  const list = section.querySelector("[data-download-list]");

  unsubscribe = store.subscribe(sessionId, (state) => {
    if (!state?.session) {
      list.innerHTML = `<p class="muted">目前沒有下載清單。</p>`;
      return;
    }

    title.textContent = state.session.title || "Workshop Downloads";
    renderDownloadResources(panel, list, state.session, { keepEmptyVisible: true });
  });
}

function defaultQuestion() {
  return {
    id: "q1",
    text: "您認為這個計畫最有幫助的是？",
    options: [
      { id: "a", text: "客製化教學系統(教材 教具 評量)" },
      { id: "b", text: "師生雙方的 KPI表現 (報告 計畫 比賽)" },
      { id: "c", text: "學生可以更有效學習 (學輔 學測 私中考試 各類比賽)" },
      { id: "d", text: "影響不大" },
    ],
    status: "open",
    order: 1,
  };
}

async function saveResources(sessionId, session, updates) {
  await store.saveResourceSettings(
    sessionId,
    updates.resourceApiUrl ?? session.resourceApiUrl ?? "",
    updates.manualResources ?? normalizeManualResources(session.manualResources),
  );
}

async function renderDownloadResources(panel, list, session, options = {}) {
  if (!panel || !list) return;

  const resourceApiUrl = session.resourceApiUrl || "";
  const manualResources = normalizeManualResources(session.manualResources);

  if (!resourceApiUrl && manualResources.length === 0) {
    panel.hidden = !options.keepEmptyVisible;
    list.innerHTML = options.keepEmptyVisible ? `<p class="muted">目前沒有可顯示的下載項目。</p>` : "";
    return;
  }

  panel.hidden = false;
  list.innerHTML = `<p class="muted">正在載入下載列表...</p>`;

  try {
    const apiResources = await fetchDownloadResources(resourceApiUrl);
    const resources = [...apiResources, ...manualResources]
      .filter((resource) => resource.enabled)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-Hant"));

    if (resources.length === 0) {
      list.innerHTML = `<p class="muted">目前沒有可顯示的下載項目。</p>`;
      return;
    }

    list.innerHTML = "";
    resources.forEach((resource) => list.append(createDownloadCard(resource)));
  } catch (error) {
    list.innerHTML = `<p class="muted">下載列表讀取失敗：${escapeHtml(error.message)}</p>`;
  }
}

async function fetchDownloadResources(resourceApiUrl) {
  if (!resourceApiUrl) return [];

  const response = await fetch(resourceApiUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data && data.ok === false) {
    throw new Error(data.message || data.code || "下載清單 API 回傳錯誤");
  }

  const rows = Array.isArray(data) ? data : data.items;

  if (!Array.isArray(rows)) {
    throw new Error("下載清單格式不是陣列");
  }

  return rows.map(normalizeResource).filter((resource) => resource.enabled && resource.title && resource.value);
}

function normalizeManualResources(resources) {
  return Array.isArray(resources)
    ? resources.map(normalizeResource).filter((resource) => resource.title && resource.value)
    : [];
}

function normalizeResource(resource) {
  const type = String(resource.type || "url").trim().toLowerCase();
  return {
    id: resource.id || crypto.randomUUID(),
    title: String(resource.title || "").trim(),
    description: String(resource.description || "").trim(),
    type: ["drive", "url", "command"].includes(type) ? type : "url",
    value: String(resource.value || "").trim(),
    category: String(resource.category || "未分類").trim(),
    order: Number(resource.order) || 9999,
    enabled: parseEnabled(resource.enabled),
  };
}

function createDownloadCard(resource) {
  const card = document.createElement("article");
  card.className = "download-card";
  const badge = resource.type === "command" ? "CMD" : resource.type === "drive" ? "DRIVE" : "URL";
  const action =
    resource.type === "command"
      ? `<code>${escapeHtml(resource.value)}</code>`
      : `<a href="${escapeHtml(resource.value)}" target="_blank" rel="noopener noreferrer">開啟連結</a>`;

  card.innerHTML = `
    <div>
      <div class="download-meta">
        <span>${badge}</span>
        <small>${escapeHtml(resource.category)}</small>
      </div>
      <h3>${escapeHtml(resource.title)}</h3>
      <p>${escapeHtml(resource.description || " " )}</p>
    </div>
    <div class="download-action">${action}</div>
  `;
  return card;
}

function renderManualResourceAdmin(container, resources) {
  if (!resources.length) {
    container.innerHTML = `<p class="muted">尚未新增手動 URL 或命令列。</p>`;
    return;
  }

  container.innerHTML = "";
  resources.forEach((resource) => {
    const row = document.createElement("article");
    row.className = "manual-resource-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(resource.title)}</strong>
        <p>${escapeHtml(resource.description || resource.value)}</p>
      </div>
      <button type="button" class="secondary" data-remove-resource="${escapeHtml(resource.id)}">移除</button>
    `;
    container.append(row);
  });
}

function readDemoStore() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved);
  return { sessions: {}, questions: {}, votes: {} };
}

function writeDemoStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
}

function readSessionState(sessionId) {
  const data = readDemoStore();
  const session = data.sessions[sessionId];
  if (!session) return null;
  const question = data.questions[sessionId]?.[session.activeQuestionId] || null;
  const voteMap = data.votes[sessionId]?.[session.activeQuestionId] || {};
  return { session, question, votes: Object.values(voteMap) };
}

function notify(listeners) {
  listeners.forEach((listener) => listener());
}

function optionId(index) {
  return String.fromCharCode(97 + index);
}

function countVotes(options, votes) {
  return options.reduce((counts, option) => {
    counts[option.id] = votes.filter((vote) => vote.optionId === option.id).length;
    return counts;
  }, {});
}

function rankedOptions(options, counts) {
  return options
    .map((option, index) => ({
      id: option.id,
      option,
      index,
      count: counts[option.id] || 0,
    }))
    .sort((a, b) => b.count - a.count || a.index - b.index);
}

function animateNumber(element, from, to, prefix = "", suffix = "") {
  const start = Number.isFinite(from) ? from : to;
  const distance = to - start;

  if (!distance) {
    element.textContent = `${prefix}${to}${suffix}`;
    return;
  }

  const startTime = performance.now();
  const duration = 520;

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${prefix}${Math.round(start + distance * eased)}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

function showDrama(element, message) {
  element.hidden = false;
  element.textContent = message;
  element.classList.remove("is-pulsing");
  requestAnimationFrame(() => element.classList.add("is-pulsing"));
}

function updateCountdownPace(element, seconds) {
  element.dataset.pace = seconds <= 10 ? "hot" : seconds <= 30 ? "warm" : "calm";
}

function renderPieChart(chart, options, counts, total) {
  if (!total) {
    chart.style.background = "#e9edf2";
    chart.textContent = "0";
    return;
  }

  let cursor = 0;
  const slices = options.map((option, index) => {
    const count = counts[option.id] || 0;
    const start = cursor;
    const end = cursor + (count / total) * 100;
    cursor = end;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${end}%`;
  });

  chart.style.background = `conic-gradient(${slices.join(", ")})`;
  chart.textContent = String(total);
}

function renderChartLabels(container, options) {
  container.innerHTML = "";
  options.forEach((option, index) => {
    const label = document.createElement("div");
    label.className = "chart-label";
    label.innerHTML = `
      <i style="background: ${CHART_COLORS[index % CHART_COLORS.length]}"></i>
      <span></span>
    `;
    label.querySelector("span").textContent = option.text;
    container.append(label);
  });
}

function playCountdownTone(audioContext, frequency, duration) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function optionButtonContent(text, showStatus, statusText = "已送出結果") {
  const status = showStatus ? `<span class="option-status">${escapeHtml(statusText)}</span>` : "";
  return `<span class="option-text">${escapeHtml(text)}</span>${status}`;
}

function buildPageUrl(page) {
  return `${window.location.origin}${basePath()}${page}/`;
}

function basePath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const voteIndex = parts.lastIndexOf("vote");

  if (voteIndex < 0) {
    return "/";
  }

  return `/${parts.slice(0, voteIndex + 1).join("/")}/`;
}

function createQrUrl(value) {
  const encodedValue = encodeURIComponent(value);
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodedValue}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fieldValue(form, name) {
  return form.querySelector(`[name="${name}"]`)?.value.trim() || "";
}

function parseEnabled(value) {
  if (typeof value === "boolean") {
    return value;
  }

  return ["true", "yes", "1", "是", ""].includes(String(value ?? "").trim().toLowerCase());
}

function getVoterId() {
  let voterId = localStorage.getItem(VOTER_KEY);
  if (!voterId) {
    voterId = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY, voterId);
  }
  return voterId;
}

function statusPanel(message) {
  return `<section class="panel"><p class="muted">${message}</p></section>`;
}
