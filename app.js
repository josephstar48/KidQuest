const STORAGE_KEY = "kidquest.state.v2";
const ADMIN_EMAILS = (window.KIDQUEST_ADMIN_EMAILS || ["josephstar48@hotmailcom"]).map((email) => email.toLowerCase());
const FIREBASE_SDK_VERSION = "10.12.5";
const TODAY = new Date().toISOString().slice(0, 10);

const worlds = [
  {
    id: "forest",
    name: "Forest Trail",
    emoji: "🌲",
    skills: ["Reading Quest", "Logic Puzzle", "Fitness Challenge"],
    bg: "linear-gradient(150deg, #2fa56f, #7ac943 55%, #2e6f3e)"
  },
  {
    id: "mountains",
    name: "Mountain Math",
    emoji: "⛰️",
    skills: ["Math Battle", "Speed Challenge", "Logic Puzzle"],
    bg: "linear-gradient(150deg, #6c8fb5, #d7ecff 42%, #436d97)"
  },
  {
    id: "city",
    name: "City Clues",
    emoji: "🏙️",
    skills: ["Reading Quest", "Speed Challenge", "Math Battle"],
    bg: "linear-gradient(150deg, #5261d6, #30b7e8 48%, #26365f)"
  },
  {
    id: "space",
    name: "Space Logic",
    emoji: "🚀",
    skills: ["Logic Puzzle", "Math Battle", "Fitness Challenge"],
    bg: "linear-gradient(150deg, #18224f, #6d4bd2 52%, #0e1024)"
  }
];

const avatars = ["🧒🏻", "👧🏻", "🧒🏽", "👧🏽", "🧒🏾", "👧🏾", "🧒🏿", "👧🏿", "🧑🏻", "🧑🏽", "🧑🏾", "🧑🏿"];
const rewards = ["Extra story time", "Choose family game", "Pick dessert", "Park adventure", "Movie night", "Art project", "Bike ride", "Stay up 15 minutes"];
const titles = ["Explorer", "Trailblazer", "Champion", "Puzzle Hero", "Star Captain", "Word Wizard"];
const enemies = ["🪵", "🧊", "🛰️", "🧱", "🌪️"];
const app = document.querySelector("#app");
let installPrompt = null;
let firebaseAuth = null;
let firebaseDb = null;
let firebaseApi = null;
let currentUserId = null;
let cloudSaveTimer = null;

const defaultState = {
  parent: null,
  kids: [],
  activeKidId: null,
  view: "home",
  activeWorldId: "forest",
  mission: null,
  dashboardTab: "progress",
  narration: true,
  multiplayer: false,
  authReady: false,
  authError: "",
  authMode: "signin",
  saving: false
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return { ...defaultState, ...saved, authReady: false, authError: "", parent: null, kids: [] };
  } catch (error) {
    console.warn("Could not load KidQuest state", error);
  }

  return { ...defaultState };
}

function saveState() {
  const { authReady, authError, saving, mission, ...cacheable } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cacheable));
  queueCloudSave();
}

function createKid(name, avatar = "🧒🏽", color = "#ffe2a7") {
  return {
    id: crypto.randomUUID(),
    name,
    avatar,
    color,
    difficulty: "Grade 2",
    level: 1,
    xp: 0,
    coins: 0,
    streak: 0,
    lastPlayed: null,
    title: "Explorer",
    chosenReward: rewards[0],
    badges: [],
    unlocked: ["Forest Trail"],
    stats: {
      math: 0,
      reading: 0,
      logic: 0,
      fitness: 0,
      missions: 0,
      correct: 0
    },
    history: []
  };
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function hasFirebaseConfig() {
  const config = window.KIDQUEST_FIREBASE_CONFIG || {};
  return Boolean(
    config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId &&
      !String(config.apiKey).startsWith("REPLACE_")
  );
}

function roleForEmail(email) {
  return ADMIN_EMAILS.includes(String(email || "").toLowerCase()) ? "Admin" : "Parent";
}

function publicParentFromUser(user, fallbackName = "") {
  return {
    uid: user.uid,
    name: user.displayName || fallbackName || user.email?.split("@")[0] || "Parent",
    email: user.email,
    role: roleForEmail(user.email),
    provider: user.providerData?.[0]?.providerId || "password"
  };
}

function cloudPayload() {
  return {
    parent: state.parent,
    kids: state.kids,
    activeKidId: state.activeKidId,
    activeWorldId: state.activeWorldId,
    dashboardTab: state.dashboardTab,
    narration: state.narration,
    multiplayer: state.multiplayer,
    updatedAt: firebaseApi?.serverTimestamp ? firebaseApi.serverTimestamp() : new Date().toISOString()
  };
}

function queueCloudSave() {
  if (!firebaseDb || !firebaseApi || !currentUserId || !state.parent) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudState().catch((error) => {
      console.warn("Could not sync KidQuest state", error);
      state.authError = readableAuthError(error);
      render();
    });
  }, 250);
}

async function saveCloudState() {
  if (!firebaseDb || !firebaseApi || !currentUserId || !state.parent) return;
  state.saving = true;
  const ref = firebaseApi.doc(firebaseDb, "parents", currentUserId);
  await firebaseApi.setDoc(ref, cloudPayload(), { merge: true });
  state.saving = false;
}

async function loadCloudState(user) {
  currentUserId = user.uid;
  const parent = publicParentFromUser(user);
  const ref = firebaseApi.doc(firebaseDb, "parents", user.uid);
  const snap = await firebaseApi.getDoc(ref);

  if (!snap.exists()) {
    await firebaseApi.setDoc(ref, {
      parent,
      kids: [],
      activeKidId: null,
      activeWorldId: "forest",
      dashboardTab: "kids",
      narration: true,
      multiplayer: false,
      createdAt: firebaseApi.serverTimestamp(),
      updatedAt: firebaseApi.serverTimestamp()
    });
    return {
      ...defaultState,
      authReady: true,
      parent,
      kids: [],
      dashboardTab: "kids",
      view: "dashboard"
    };
  }

  const data = snap.data();
  const parentWithCurrentRole = {
    ...(data.parent || parent),
    uid: user.uid,
    email: user.email,
    role: roleForEmail(user.email)
  };

  return {
    ...defaultState,
    authReady: true,
    parent: parentWithCurrentRole,
    kids: data.kids || [],
    activeKidId: data.activeKidId || data.kids?.[0]?.id || null,
    activeWorldId: data.activeWorldId || "forest",
    dashboardTab: data.dashboardTab || "progress",
    narration: data.narration !== false,
    multiplayer: Boolean(data.multiplayer),
    view: (data.kids || []).length ? "home" : "dashboard"
  };
}

async function initFirebase() {
  if (!hasFirebaseConfig()) {
    state = {
      ...defaultState,
      authReady: true,
      authError: "Firebase is not configured yet. Add your Firebase web config in firebase-config.js to enable real accounts."
    };
    render();
    return;
  }

  try {
    const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
    const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`);
    const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
    const firebaseApp = appModule.initializeApp(window.KIDQUEST_FIREBASE_CONFIG);
    firebaseAuth = authModule.getAuth(firebaseApp);
    firebaseDb = firestoreModule.getFirestore(firebaseApp);
    firebaseApi = { ...authModule, ...firestoreModule };

    firestoreModule.enableIndexedDbPersistence(firebaseDb).catch(() => {});

    authModule.onAuthStateChanged(firebaseAuth, async (user) => {
      try {
        if (!user) {
          currentUserId = null;
          state = { ...defaultState, authReady: true };
          saveState();
          render();
          return;
        }
        state = await loadCloudState(user);
        saveState();
        render();
      } catch (error) {
        state = {
          ...defaultState,
          authReady: true,
          authError: readableAuthError(error)
        };
        render();
      }
    });
  } catch (error) {
    state = {
      ...defaultState,
      authReady: true,
      authError: readableAuthError(error)
    };
    render();
  }
}

async function createParentAccount({ name, email, password }) {
  if (!firebaseApi) throw new Error("Firebase is not configured.");
  const credential = await firebaseApi.createUserWithEmailAndPassword(firebaseAuth, email, password);
  await firebaseApi.updateProfile(credential.user, { displayName: name });
  const parent = publicParentFromUser(credential.user, name);
  await firebaseApi.setDoc(firebaseApi.doc(firebaseDb, "parents", credential.user.uid), {
    parent,
    kids: [],
    activeKidId: null,
    activeWorldId: "forest",
    dashboardTab: "kids",
    narration: true,
    multiplayer: false,
    createdAt: firebaseApi.serverTimestamp(),
    updatedAt: firebaseApi.serverTimestamp()
  }, { merge: true });
}

async function signInParent({ email, password }) {
  if (!firebaseApi) throw new Error("Firebase is not configured.");
  await firebaseApi.signInWithEmailAndPassword(firebaseAuth, email, password);
}

async function signInWithGoogle() {
  if (!firebaseApi) throw new Error("Firebase is not configured.");
  const provider = new firebaseApi.GoogleAuthProvider();
  await firebaseApi.signInWithPopup(firebaseAuth, provider);
}

async function signOutParent() {
  if (firebaseApi && firebaseAuth) await firebaseApi.signOut(firebaseAuth);
  localStorage.removeItem(STORAGE_KEY);
  state = { ...defaultState, authReady: true };
  render();
}

function readableAuthError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "That email already has a KidQuest parent account. Sign in instead.",
    "auth/invalid-credential": "The email or password did not match an account.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/operation-not-allowed": "Enable this sign-in provider in Firebase Authentication.",
    "permission-denied": "Firestore denied access. Check your security rules."
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
}

function activeKid() {
  return state.kids.find((kid) => kid.id === state.activeKidId) || state.kids[0] || null;
}

function activeWorld() {
  return worlds.find((world) => world.id === state.activeWorldId) || worlds[0];
}

function icon(name) {
  const icons = {
    play: "▶",
    user: "👤",
    map: "🧭",
    chart: "📊",
    plus: "+",
    sound: "🔊",
    mute: "🔇",
    trophy: "🏆",
    coin: "🪙",
    back: "←",
    home: "⌂",
    spark: "✦",
    shield: "🛡"
  };
  return icons[name] || "•";
}

function render() {
  const kid = activeKid();
  app.innerHTML = `
    <div class="app">
      ${topbar(kid)}
      ${route()}
      ${installBanner()}
    </div>
  `;
  bindGlobalEvents();
  bindScreenEvents();
}

function topbar(kid) {
  return `
    <header class="topbar">
      <button class="brand" data-action="go-home" aria-label="Go home">
        <img src="/assets/kidquest-icon.png" alt="">
        <span>
          <span class="brand-title">KidQuest</span>
          <span class="brand-subtitle">Adventure Quest Kids</span>
        </span>
      </button>
      <nav class="top-actions" aria-label="Primary">
        ${state.parent ? `<span class="pill">${state.parent.role}</span>` : ""}
        ${kid ? `<span class="pill">${kid.avatar} ${kid.name}</span><span class="pill">${icon("coin")} ${kid.coins}</span><span class="pill">🔥 ${kid.streak}</span>` : ""}
        <button class="btn icon" data-action="toggle-narration" title="Voice narration">${state.narration ? icon("sound") : icon("mute")}</button>
        ${state.parent ? `<button class="btn" data-action="show-map">${icon("map")} Map</button>` : ""}
        <a class="btn" href="/assets/kidquest-icon.png" download="kidquest-pwa-icon.png" title="Download PWA logo">⬇ Logo</a>
        ${state.parent ? `<button class="btn" data-action="show-dashboard">${icon("chart")} Parent</button><button class="btn" data-action="sign-out">Sign Out</button>` : ""}
      </nav>
    </header>
  `;
}

function route() {
  if (!state.authReady) return loadingScreen();
  if (!state.parent) return authScreen();
  if (state.view === "dashboard") return dashboardScreen();
  if (state.view === "map") return mapScreen();
  if (state.view === "challenge") return challengeScreen();
  if (state.view === "reward") return rewardScreen();
  return homeScreen();
}

function loadingScreen() {
  return `
    <main class="screen hero">
      <section class="hero-copy">
        <h1>KidQuest</h1>
        <p>Checking parent account and syncing adventure progress.</p>
      </section>
      <section class="panel auth-panel">
        <div class="section-title"><h2>Loading</h2></div>
        <div class="progress-track"><div class="progress-fill" style="--progress:65%"></div></div>
      </section>
    </main>
  `;
}

function authScreen() {
  return `
    <main class="screen hero">
      <section class="hero-copy">
        <h1>KidQuest</h1>
        <p>Parent-led adventure learning for math, reading, logic, and movement. Kids pick a profile, complete fast missions, earn rewards, and keep growing.</p>
        <div class="pill-row">
          <span class="pill">${icon("shield")} Parent account</span>
          <span class="pill">${icon("user")} Child profiles</span>
          <span class="pill">☁ Sync-ready</span>
        </div>
      </section>
      <section class="panel auth-panel">
        <div class="section-title">
          <div>
            <h2>${state.authMode === "signup" ? "Parent Sign Up" : "Parent Sign In"}</h2>
            <p>Real Firebase authentication with cloud-synced child profiles.</p>
          </div>
        </div>
        ${state.authError ? `<div class="empty">${escapeHtml(state.authError)}</div>` : ""}
        <div class="tabs">
          <button class="tab ${state.authMode !== "signup" ? "active" : ""}" data-action="auth-mode" data-mode="signin">Sign In</button>
          <button class="tab ${state.authMode === "signup" ? "active" : ""}" data-action="auth-mode" data-mode="signup">Create Account</button>
        </div>
        <form data-form="auth">
          <div class="field" ${state.authMode === "signup" ? "" : "hidden"}>
            <label for="parentName">Parent name</label>
            <input id="parentName" name="name" placeholder="Jose R. Estrella Sr." ${state.authMode === "signup" ? "required" : ""}>
          </div>
          <div class="field">
            <label for="parentEmail">Email</label>
            <input id="parentEmail" name="email" type="email" placeholder="you@example.com" required>
          </div>
          <div class="field">
            <label for="parentPassword">Password</label>
            <input id="parentPassword" name="password" type="password" minlength="6" placeholder="6+ characters" required>
          </div>
          <button class="btn primary" type="submit">${icon("play")} ${state.authMode === "signup" ? "Create Parent Account" : "Sign In"}</button>
          <button class="btn" type="button" data-action="google-login">Continue with Google</button>
        </form>
      </section>
    </main>
  `;
}

function homeScreen() {
  return `
    <main class="screen">
      <section class="hero">
        <div class="hero-copy">
          <h1>KidQuest</h1>
          <p>Choose a child profile, start a mission, complete 3 to 5 quick challenges, and unlock coins, badges, titles, skins, and family rewards.</p>
          <div class="pill-row">
            <span class="pill">🧮 Math Battle</span>
            <span class="pill">📖 Reading Quest</span>
            <span class="pill">⚡ Speed Challenge</span>
            <span class="pill">🧩 Logic Puzzle</span>
            <span class="pill">💪 Fitness Challenge</span>
            <span class="pill">✨ AI-style Questions</span>
          </div>
        </div>
        <div class="hero-art" aria-label="KidQuest adventure art"></div>
      </section>
      <section>
        <div class="section-title">
          <div>
            <h2>Choose Player</h2>
            <p>Kids do not need emails or passwords.</p>
          </div>
          <button class="btn primary" data-action="show-dashboard">${icon("plus")} Manage Kids</button>
        </div>
        <div class="grid three">
          ${state.kids.map(kidCard).join("") || `<div class="empty">Create a child profile in the parent dashboard to begin.</div>`}
        </div>
      </section>
    </main>
  `;
}

function kidCard(kid) {
  return `
    <article class="card kid-card">
      <div class="avatar" style="--avatar-bg:${kid.color}">${kid.avatar}</div>
      <div>
        <h3>${escapeHtml(kid.name)}</h3>
        <p>${kid.title} · Level ${kid.level} · ${kid.difficulty}</p>
      </div>
      <div class="pill-row">
        <span class="pill">${icon("coin")} ${kid.coins}</span>
        <span class="pill">⭐ ${kid.xp} XP</span>
        <span class="pill">🔥 ${kid.streak}</span>
      </div>
      <button class="btn primary" data-action="select-kid" data-id="${kid.id}">${icon("play")} Play</button>
    </article>
  `;
}

function mapScreen() {
  const kid = activeKid();
  return `
    <main class="screen">
      <div class="section-title">
        <div>
          <h2>World Map</h2>
          <p>${kid ? `${kid.name} is ready for a mission.` : "Choose a player to start."}</p>
        </div>
        <button class="btn" data-action="go-home">${icon("back")} Profiles</button>
      </div>
      <section class="world-map">
        ${worlds.map((world, index) => worldCard(world, kid, index)).join("")}
      </section>
    </main>
  `;
}

function worldCard(world, kid, index) {
  const unlocked = !kid || kid.level >= index + 1 || kid.unlocked.includes(world.name);
  return `
    <article class="card world-card" style="--world-bg:${world.bg}">
      <div>
        <div class="world-emoji">${world.emoji}</div>
        <h3>${world.name}</h3>
        <p>${world.skills.join(" · ")}</p>
      </div>
      <button class="btn ${unlocked ? "gold" : ""}" data-action="start-mission" data-world="${world.id}" ${unlocked ? "" : "disabled"}>
        ${unlocked ? `${icon("play")} Start Mission` : "🔒 Reach Level " + (index + 1)}
      </button>
    </article>
  `;
}

function challengeScreen() {
  const mission = state.mission;
  const kid = activeKid();
  if (!mission || !kid) return mapScreen();
  const challenge = mission.challenges[mission.index];
  const progress = Math.round((mission.index / mission.challenges.length) * 100);

  return `
    <main class="screen">
      <div class="game-layout">
        <section class="card challenge-panel">
          <div>
            <div class="section-title">
              <div>
                <div class="challenge-type">${challenge.type}</div>
                <h2>${activeWorld().emoji} ${mission.name}</h2>
              </div>
              <button class="btn" data-action="show-map">${icon("back")} Map</button>
            </div>
            <div class="progress-track" aria-label="Mission progress">
              <div class="progress-fill" style="--progress:${progress}%"></div>
            </div>
            ${challenge.type === "Math Battle" ? enemyStage(kid, challenge) : ""}
            ${challengeMarkup(challenge)}
          </div>
          <div class="pill-row">
            <span class="pill">Step ${mission.index + 1} / ${mission.challenges.length}</span>
            <span class="pill">⭐ ${mission.score} correct</span>
            <span class="pill">⏱ ${challenge.timer || "Untimed"}</span>
            ${state.multiplayer ? `<span class="pill">👥 Multiplayer mode</span>` : ""}
          </div>
        </section>
        <aside class="side-panel">
          <section class="panel">
            <div class="section-title">
              <h3>Mission</h3>
            </div>
            <div class="score-line"><span>Player</span><strong>${kid.avatar} ${kid.name}</strong></div>
            <div class="score-line"><span>Coins ready</span><strong>${mission.coins}</strong></div>
            <div class="score-line"><span>World</span><strong>${activeWorld().name}</strong></div>
          </section>
          <section class="panel">
            <div class="section-title">
              <h3>Quest Party</h3>
            </div>
            <label class="field">
              <span>Sibling/Friend Competition</span>
              <select data-action="toggle-multiplayer">
                <option value="off" ${!state.multiplayer ? "selected" : ""}>Solo mission</option>
                <option value="on" ${state.multiplayer ? "selected" : ""}>Compete together</option>
              </select>
            </label>
            <p>${state.multiplayer ? "A bonus coin is awarded for every correct answer." : "Turn on competition for sibling/friend sessions."}</p>
          </section>
        </aside>
      </div>
    </main>
  `;
}

function enemyStage(kid, challenge) {
  return `
    <div class="enemy-stage" aria-label="Math battle">
      <div class="fighter">${kid.avatar}</div>
      <div class="versus">VS</div>
      <div class="enemy">${challenge.enemy}</div>
    </div>
  `;
}

function challengeMarkup(challenge) {
  if (challenge.type === "Fitness Challenge") {
    return `
      <h3 class="challenge-question">${challenge.prompt}</h3>
      <p class="reading-text">Tap done after you complete the movement.</p>
      <button class="answer" data-action="finish-fitness">DONE</button>
    `;
  }

  return `
    ${challenge.story ? `<p class="reading-text">${challenge.story}</p>` : ""}
    <h3 class="challenge-question">${challenge.prompt}</h3>
    <div class="answer-grid">
      ${challenge.options.map((option) => `<button class="answer" data-action="answer" data-value="${escapeHtml(String(option))}">${escapeHtml(String(option))}</button>`).join("")}
    </div>
  `;
}

function rewardScreen() {
  const mission = state.mission;
  const kid = activeKid();
  if (!mission || !kid) return homeScreen();
  return `
    <main class="screen">
      <section class="card reward-showcase">
        <div class="big">🏆</div>
        <h2>Mission Complete</h2>
        <p>${kid.name} earned ${mission.coins} coins, ${mission.xp} XP, and unlocked <strong>${mission.badge}</strong>.</p>
        <div class="pill-row" style="justify-content:center">
          <span class="pill">${icon("coin")} ${kid.coins} total coins</span>
          <span class="pill">⭐ Level ${kid.level}</span>
          <span class="pill">🔥 ${kid.streak} day streak</span>
          <span class="pill">🎁 ${kid.chosenReward}</span>
        </div>
        <div class="top-actions" style="justify-content:center;margin-top:18px">
          <button class="btn primary" data-action="show-map">${icon("map")} Next Mission</button>
          <button class="btn" data-action="show-dashboard">${icon("chart")} Progress</button>
        </div>
      </section>
    </main>
  `;
}

function dashboardScreen() {
  const selected = activeKid();
  return `
    <main class="screen">
      <div class="section-title">
        <div>
          <h2>Parent Dashboard</h2>
          <p>${state.parent.name} · Parent account · Admin: Jose R. Estrella Sr.</p>
        </div>
        <button class="btn" data-action="go-home">${icon("home")} Kid Mode</button>
      </div>
      <div class="tabs">
        ${dashboardTabs().map((tab) => `<button class="tab ${state.dashboardTab === tab ? "active" : ""}" data-action="dashboard-tab" data-tab="${tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}
      </div>
      ${dashboardTab(selected)}
    </main>
  `;
}

function dashboardTabs() {
  const tabs = ["progress", "kids", "assign", "account"];
  if (state.parent?.role === "Admin") tabs.push("admin");
  return tabs;
}

function dashboardTab(kid) {
  if (state.dashboardTab === "kids") return kidsManager();
  if (state.dashboardTab === "assign") return assignmentPanel(kid);
  if (state.dashboardTab === "account") return accountPanel();
  if (state.dashboardTab === "admin" && state.parent?.role === "Admin") return adminPanel();
  return progressPanel(kid);
}

function progressPanel(kid) {
  if (!kid) return `<div class="empty">Create a child profile to track progress.</div>`;
  const statCards = [
    ["Missions", kid.stats.missions],
    ["Math", kid.stats.math],
    ["Reading", kid.stats.reading],
    ["Logic", kid.stats.logic],
    ["Fitness", kid.stats.fitness],
    ["Correct", kid.stats.correct]
  ];
  return `
    <section class="grid two">
      <article class="panel">
        <div class="section-title">
          <div>
            <h3>${kid.avatar} ${kid.name}</h3>
            <p>${kid.title} · Level ${kid.level} · ${kid.difficulty}</p>
          </div>
        </div>
        <div class="grid three">
          ${statCards.map(([label, value]) => `<div class="card stat-card"><strong>${value}</strong><p>${label}</p></div>`).join("")}
        </div>
      </article>
      <article class="panel">
        <div class="section-title"><h3>Recent Learning</h3></div>
        <div class="timeline">
          ${kid.history.slice(-6).reverse().map((item) => `
            <div class="timeline-item">
              <span>${item.icon}</span>
              <span>${item.text}</span>
              <strong>${item.date}</strong>
            </div>
          `).join("") || `<div class="empty">No missions completed yet.</div>`}
        </div>
      </article>
    </section>
  `;
}

function kidsManager() {
  return `
    <section class="grid two">
      <article class="panel">
        <div class="section-title"><h3>Add Child Profile</h3></div>
        <form data-form="kid">
          <div class="field">
            <label for="kidName">Child name</label>
            <input id="kidName" name="name" placeholder="Megan" required>
          </div>
          <div class="field">
            <label>Avatar</label>
            <div class="avatar-picker">
              ${avatars.map((avatar, index) => `<button type="button" class="avatar-option ${index === 2 ? "selected" : ""}" data-action="avatar-pick" data-avatar="${avatar}">${avatar}</button>`).join("")}
            </div>
            <input type="hidden" name="avatar" value="${avatars[2]}">
          </div>
          <div class="field">
            <label for="kidColor">Avatar color</label>
            <input id="kidColor" name="color" type="color" value="#ffe2a7">
          </div>
          <button class="btn primary" type="submit">${icon("plus")} Add Profile</button>
        </form>
      </article>
      <article class="panel">
        <div class="section-title"><h3>Profiles</h3></div>
        <div class="grid">
          ${state.kids.map((kid) => `
            <div class="card kid-card">
              <div class="avatar" style="--avatar-bg:${kid.color}">${kid.avatar}</div>
              <strong>${escapeHtml(kid.name)}</strong>
              <span>${kid.difficulty} · Reward: ${kid.chosenReward}</span>
              <button class="btn danger" data-action="remove-kid" data-id="${kid.id}">Remove</button>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function assignmentPanel(kid) {
  if (!kid) return `<div class="empty">Add a child profile first.</div>`;
  return `
    <section class="grid two">
      <article class="panel">
        <div class="section-title"><h3>Set Difficulty</h3></div>
        <form data-form="settings">
          <div class="field">
            <label for="kidSelect">Child</label>
            <select id="kidSelect" name="kidId">
              ${state.kids.map((child) => `<option value="${child.id}" ${child.id === kid.id ? "selected" : ""}>${child.name}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="difficulty">Difficulty</label>
            <select id="difficulty" name="difficulty">
              ${["Pre-K", "Kindergarten", "Grade 1", "Grade 2", "Grade 3", "Grade 4"].map((level) => `<option ${kid.difficulty === level ? "selected" : ""}>${level}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="reward">Chosen reward</label>
            <select id="reward" name="reward">
              ${rewards.map((reward) => `<option ${kid.chosenReward === reward ? "selected" : ""}>${reward}</option>`).join("")}
            </select>
          </div>
          <button class="btn primary" type="submit">Save Assignment</button>
        </form>
      </article>
      <article class="panel">
        <div class="section-title"><h3>Assign Challenge</h3></div>
        <div class="grid">
          ${worlds.map((world) => `<button class="btn" data-action="assign-world" data-world="${world.id}">${world.emoji} ${world.name}</button>`).join("")}
        </div>
      </article>
    </section>
  `;
}

function accountPanel() {
  return `
    <section class="grid two">
      <article class="panel">
        <div class="section-title"><h3>Parent Account</h3></div>
        <div class="score-line"><span>Name</span><strong>${state.parent.name}</strong></div>
        <div class="score-line"><span>Email</span><strong>${state.parent.email}</strong></div>
        <div class="score-line"><span>Role</span><strong>${state.parent.role}</strong></div>
        <div class="score-line"><span>Sync</span><strong>${state.saving ? "Saving..." : "Cloud synced"}</strong></div>
      </article>
      <article class="panel">
        <div class="section-title"><h3>PWA</h3></div>
        <p>Offline play, home screen install, Firestore cloud sync, and Vercel deployment are active in this build.</p>
        <p>Question generation is procedural and offline-ready now, with clean upgrade points for a hosted AI API later.</p>
        <a class="btn primary" href="/assets/kidquest-icon.png" download="kidquest-pwa-icon.png">Download PWA Logo/Icon</a>
        <button class="btn danger" data-action="clear-local-cache">Clear Local Cache</button>
      </article>
    </section>
  `;
}

function adminPanel() {
  return `
    <section class="grid two">
      <article class="panel">
        <div class="section-title"><h3>Creator Admin</h3></div>
        <div class="score-line"><span>Email</span><strong>${state.parent.email}</strong></div>
        <div class="score-line"><span>Role</span><strong>${state.parent.role}</strong></div>
        <div class="score-line"><span>Database access</span><strong>All parent records by rule</strong></div>
      </article>
      <article class="panel">
        <div class="section-title"><h3>Production Controls</h3></div>
        <p>Admin access is granted by Firebase Authentication email and Firestore rules, not by a password stored in this app.</p>
        <p>Use Firebase Console for password resets, disabling accounts, and reviewing sign-in providers.</p>
      </article>
    </section>
  `;
}

function installBanner() {
  return `
    <div class="install-banner" id="installBanner">
      <span><strong>Add KidQuest to Home Screen</strong><br>Play missions faster, even offline.</span>
      <button class="btn gold" data-action="install">Install</button>
    </div>
  `;
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-action='go-home']").forEach((button) => button.addEventListener("click", () => setState({ view: "home", mission: null })));
  document.querySelectorAll("[data-action='show-map']").forEach((button) => button.addEventListener("click", () => setState({ view: "map", mission: null })));
  document.querySelectorAll("[data-action='show-dashboard']").forEach((button) => button.addEventListener("click", () => setState({ view: "dashboard", mission: null })));
  document.querySelectorAll("[data-action='toggle-narration']").forEach((button) => button.addEventListener("click", () => setState({ narration: !state.narration })));
  document.querySelectorAll("[data-action='install']").forEach((button) => button.addEventListener("click", installApp));
  document.querySelectorAll("[data-action='sign-out']").forEach((button) => button.addEventListener("click", signOutParent));
  const banner = document.querySelector("#installBanner");
  if (banner && installPrompt) banner.classList.add("show");
}

function bindScreenEvents() {
  document.querySelectorAll("[data-action='auth-mode']").forEach((button) => {
    button.addEventListener("click", () => setState({ authMode: button.dataset.mode, authError: "" }));
  });

  document.querySelector("[data-form='auth']")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      state.authError = "";
      render();
      if (state.authMode === "signup") {
        await createParentAccount({
          name: form.get("name").trim(),
          email: form.get("email").trim(),
          password: form.get("password")
        });
      } else {
        await signInParent({
          email: form.get("email").trim(),
          password: form.get("password")
        });
      }
    } catch (error) {
      setState({ authError: readableAuthError(error) });
    }
  });

  document.querySelector("[data-action='google-login']")?.addEventListener("click", async () => {
    try {
      state.authError = "";
      render();
      await signInWithGoogle();
    } catch (error) {
      setState({ authError: readableAuthError(error) });
    }
  });

  document.querySelectorAll("[data-action='select-kid']").forEach((button) => {
    button.addEventListener("click", () => {
      const kid = state.kids.find((child) => child.id === button.dataset.id);
      speak(`Welcome ${kid.name}. Choose your adventure.`);
      setState({ activeKidId: kid.id, view: "map" });
    });
  });

  document.querySelectorAll("[data-action='start-mission']").forEach((button) => {
    button.addEventListener("click", () => startMission(button.dataset.world));
  });

  document.querySelectorAll("[data-action='answer']").forEach((button) => {
    button.addEventListener("click", () => submitAnswer(button));
  });

  document.querySelector("[data-action='finish-fitness']")?.addEventListener("click", (event) => {
    event.currentTarget.classList.add("correct");
    setTimeout(() => advanceChallenge(true), 350);
  });

  document.querySelector("[data-action='toggle-multiplayer']")?.addEventListener("change", (event) => {
    setState({ multiplayer: event.target.value === "on" });
  });

  document.querySelectorAll("[data-action='dashboard-tab']").forEach((button) => {
    button.addEventListener("click", () => setState({ dashboardTab: button.dataset.tab }));
  });

  document.querySelectorAll("[data-action='avatar-pick']").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".avatar-option").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      document.querySelector("input[name='avatar']").value = button.dataset.avatar;
    });
  });

  document.querySelector("[data-form='kid']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kid = createKid(form.get("name").trim(), form.get("avatar"), form.get("color"));
    setState({ kids: [...state.kids, kid], activeKidId: kid.id });
  });

  document.querySelectorAll("[data-action='remove-kid']").forEach((button) => {
    button.addEventListener("click", () => {
      const kids = state.kids.filter((kid) => kid.id !== button.dataset.id);
      setState({ kids, activeKidId: kids[0]?.id || null });
    });
  });

  document.querySelector("[data-form='settings']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kids = state.kids.map((kid) => kid.id === form.get("kidId")
      ? { ...kid, difficulty: form.get("difficulty"), chosenReward: form.get("reward") }
      : kid
    );
    setState({ kids, activeKidId: form.get("kidId") });
  });

  document.querySelector("[name='kidId']")?.addEventListener("change", (event) => {
    setState({ activeKidId: event.target.value });
  });

  document.querySelectorAll("[data-action='assign-world']").forEach((button) => {
    button.addEventListener("click", () => setState({ activeWorldId: button.dataset.world, view: "map" }));
  });

  document.querySelector("[data-action='clear-local-cache']")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = { ...state, authError: "Local cache cleared. Cloud data remains saved." };
    render();
  });
}

function startMission(worldId) {
  const kid = activeKid();
  if (!kid) {
    setState({ view: "home" });
    return;
  }
  const world = worlds.find((item) => item.id === worldId) || worlds[0];
  const count = 3 + Math.floor(Math.random() * 3);
  const challenges = Array.from({ length: count }, (_, index) => makeChallenge(world, kid, index));
  const mission = {
    id: crypto.randomUUID(),
    name: `${world.name} Mission`,
    worldId,
    challenges,
    index: 0,
    score: 0,
    coins: 0,
    xp: 0,
    badge: `${world.name} Badge`
  };
  speak(`${world.name} mission started. First challenge: ${challenges[0].type}.`);
  setState({ activeWorldId: worldId, mission, view: "challenge" });
}

function makeChallenge(world, kid, index) {
  const type = world.skills[index % world.skills.length];
  if (type === "Math Battle") return makeMath(kid);
  if (type === "Reading Quest") return makeReading(world);
  if (type === "Speed Challenge") return makeSpeed(kid);
  if (type === "Logic Puzzle") return makeLogic();
  return makeFitness();
}

function gradeNumber(kid) {
  const match = kid.difficulty.match(/\d/);
  if (kid.difficulty === "Pre-K") return 0;
  if (kid.difficulty === "Kindergarten") return 1;
  return match ? Number(match[0]) : 2;
}

function makeMath(kid) {
  const grade = gradeNumber(kid);
  const max = Math.max(8, grade * 6 + 6);
  const op = grade >= 3 && Math.random() > .55 ? "×" : Math.random() > .5 ? "+" : "-";
  let a = 1 + Math.floor(Math.random() * max);
  let b = 1 + Math.floor(Math.random() * max);
  if (op === "-" && b > a) [a, b] = [b, a];
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return {
    type: "Math Battle",
    prompt: `${a} ${op} ${b} = ?`,
    answer,
    options: shuffle([answer, answer + 1, Math.max(0, answer - 2), answer + 3]),
    enemy: enemies[Math.floor(Math.random() * enemies.length)],
    timer: "2 min"
  };
}

function makeReading(world) {
  const stories = [
    {
      story: `Mila packed a compass before walking into the ${world.name.toLowerCase()}. She used it to find the bright yellow trail marker.`,
      prompt: "What helped Mila find the trail marker?",
      answer: "A compass",
      options: ["A compass", "A sandwich", "A kite", "A drum"]
    },
    {
      story: `Ethan saw a tiny robot blocking the path. He asked it a kind question, and the robot opened the gate.`,
      prompt: "Who opened the gate?",
      answer: "The robot",
      options: ["The robot", "The moon", "The teacher", "The dragon"]
    },
    {
      story: `Megan found three glowing stones. She shared one with her brother and kept two for the team lantern.`,
      prompt: "What did Megan share?",
      answer: "One glowing stone",
      options: ["One glowing stone", "A red hat", "Two cookies", "A map"]
    }
  ];
  const item = stories[Math.floor(Math.random() * stories.length)];
  return { type: "Reading Quest", timer: "3 min", ...item };
}

function makeSpeed(kid) {
  const grade = gradeNumber(kid);
  const max = Math.max(6, grade * 5 + 5);
  const a = 1 + Math.floor(Math.random() * max);
  const b = 1 + Math.floor(Math.random() * max);
  const answer = a + b;
  return {
    type: "Speed Challenge",
    prompt: `Quick! ${a} + ${b}`,
    answer,
    options: shuffle([answer, answer + 2, Math.max(0, answer - 1), answer + 4]),
    timer: "60 sec"
  };
}

function makeLogic() {
  const patterns = [
    { prompt: "What comes next? 🔴 🔵 🔴 🔵", answer: "🔴", options: ["🔴", "🟢", "🟡", "⭐"] },
    { prompt: "What comes next? 2, 4, 6, 8", answer: "10", options: ["9", "10", "12", "6"] },
    { prompt: "Which item belongs with a spoon and plate?", answer: "Fork", options: ["Fork", "Shoe", "Pillow", "Rocket"] },
    { prompt: "What comes next? A, B, C, D", answer: "E", options: ["A", "E", "G", "Z"] }
  ];
  return { type: "Logic Puzzle", timer: "3 min", ...patterns[Math.floor(Math.random() * patterns.length)] };
}

function makeFitness() {
  const prompts = [
    "Do 10 jumping jacks",
    "Hold a plank for 20 seconds",
    "Do 8 squats",
    "Touch your toes 10 times",
    "Run in place for 20 seconds"
  ];
  return {
    type: "Fitness Challenge",
    prompt: prompts[Math.floor(Math.random() * prompts.length)],
    answer: "DONE",
    options: [],
    timer: "2 min"
  };
}

function submitAnswer(button) {
  const mission = state.mission;
  const challenge = mission.challenges[mission.index];
  const correct = String(challenge.answer) === button.dataset.value;
  button.classList.add(correct ? "correct" : "wrong");
  if (!correct) {
    document.querySelectorAll(".answer").forEach((item) => {
      if (item.dataset.value === String(challenge.answer)) item.classList.add("correct");
    });
  }
  speak(correct ? "Correct. Great attack." : `Good try. The answer is ${challenge.answer}.`);
  setTimeout(() => advanceChallenge(correct), 500);
}

function advanceChallenge(correct) {
  const mission = { ...state.mission };
  mission.score += correct ? 1 : 0;
  mission.coins += correct ? (state.multiplayer ? 7 : 5) : 2;
  mission.xp += correct ? 15 : 6;
  mission.index += 1;

  if (mission.index >= mission.challenges.length) {
    finishMission(mission);
    return;
  }

  state.mission = mission;
  saveState();
  speak(`Next challenge: ${mission.challenges[mission.index].type}.`);
  render();
}

function finishMission(mission) {
  const kid = activeKid();
  const world = activeWorld();
  const nextLevel = kid.xp + mission.xp >= kid.level * 100 ? kid.level + 1 : kid.level;
  const title = titles[Math.min(titles.length - 1, nextLevel - 1)];
  const streak = kid.lastPlayed === TODAY ? kid.streak : isYesterday(kid.lastPlayed) ? kid.streak + 1 : 1;
  const unlocked = Array.from(new Set([...kid.unlocked, world.name, worlds[Math.min(worlds.length - 1, nextLevel - 1)].name]));
  const challengeTypes = mission.challenges.map((challenge) => challenge.type);
  const updatedKid = {
    ...kid,
    coins: kid.coins + mission.coins,
    xp: kid.xp + mission.xp,
    level: nextLevel,
    title,
    streak,
    lastPlayed: TODAY,
    unlocked,
    badges: Array.from(new Set([...kid.badges, mission.badge])),
    stats: {
      ...kid.stats,
      missions: kid.stats.missions + 1,
      correct: kid.stats.correct + mission.score,
      math: kid.stats.math + challengeTypes.filter((type) => type.includes("Math") || type.includes("Speed")).length,
      reading: kid.stats.reading + challengeTypes.filter((type) => type.includes("Reading")).length,
      logic: kid.stats.logic + challengeTypes.filter((type) => type.includes("Logic")).length,
      fitness: kid.stats.fitness + challengeTypes.filter((type) => type.includes("Fitness")).length
    },
    history: [
      ...kid.history,
      {
        icon: world.emoji,
        text: `${world.name}: ${mission.score}/${mission.challenges.length} correct, +${mission.coins} coins`,
        date: TODAY
      }
    ]
  };
  const kids = state.kids.map((child) => child.id === kid.id ? updatedKid : child);
  state = { ...state, kids, mission, view: "reward" };
  saveState();
  celebrate();
  speak(`Mission complete. ${updatedKid.name} earned ${mission.coins} coins and unlocked ${mission.badge}.`);
  render();
}

function isYesterday(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - .5);
}

function speak(text) {
  if (!state.narration || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = .96;
  utterance.pitch = 1.08;
  window.speechSynthesis.speak(utterance);
}

function celebrate() {
  const wrap = document.createElement("div");
  wrap.className = "confetti";
  const colors = ["#ffbf2f", "#13a7f3", "#28a86b", "#e45246", "#7a4fd6"];
  wrap.innerHTML = Array.from({ length: 46 }, (_, index) => `<span style="left:${Math.random() * 100}%;--c:${colors[index % colors.length]};animation-delay:${Math.random() * .35}s"></span>`).join("");
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function installApp() {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  document.querySelector("#installBanner")?.classList.remove("show");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  document.querySelector("#installBanner")?.classList.add("show");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

render();
initFirebase();
