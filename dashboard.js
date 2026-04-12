/* DATE & TIME */
function updateTime() {
  const now = new Date();
  document.getElementById("datetime").innerText =
    now.toLocaleTimeString() + " | " + now.toDateString();
}

setInterval(updateTime, 1000);
updateTime();

/* REAL-TIME TREND GRAPH */
const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

// Handle high-DPI canvases
function resizeCanvasToDisplaySize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(300, rect.width);
  const h = Math.max(120, rect.height);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  return false;
}

// tooltip element
let chartTooltip = null;
function ensureTooltip() {
  if (!chartTooltip) {
    chartTooltip = document.createElement('div');
    chartTooltip.style.position = 'fixed';
    chartTooltip.style.pointerEvents = 'none';
    chartTooltip.style.background = 'rgba(0,0,0,0.75)';
    chartTooltip.style.color = '#fff';
    chartTooltip.style.padding = '6px 8px';
    chartTooltip.style.borderRadius = '4px';
    chartTooltip.style.fontSize = '12px';
    chartTooltip.style.display = 'none';
    document.body.appendChild(chartTooltip);
  }
}

let trendData = [1, 1, 4, 2, 3, 2, 5, 2, 3, 1, 4, 2];
const maxDataPoints = 20;

function drawTrendGraph() {
  // Ensure canvas size matches display (handles high-DPI)
  resizeCanvasToDisplaySize();
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);

  const padding = 50;
  const graphWidth = cw - 2 * padding;
  const graphHeight = ch - 2 * padding;
  const steps = 4; // Low, Moderate, High, Very High
  const stepX = graphWidth / Math.max(trendData.length - 1, 1);

  // Draw faint horizontal grid lines (no left labels)
  const gridLines = 4;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(34,76,55,0.03)';
  for (let i = 0; i < gridLines; i++) {
    const y = padding + (i / (gridLines - 1)) * graphHeight;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(cw - padding, y);
    ctx.stroke();
  }

  // Build points (continuous mapping using actual values)
  const maxVal = Math.max(6, ...trendData);
  const points = trendData.map((v, i) => {
    const x = padding + i * stepX;
    // higher value -> closer to top (Very High)
    const y = padding + (1 - (v / maxVal)) * graphHeight;
    return { x, y, v };
  });

  // Draw area under smooth curve
  if (points.length) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const midX = (prev.x + cur.x) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, (prev.y + cur.y) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    // close area to bottom
    ctx.lineTo(last.x, padding + graphHeight);
    ctx.lineTo(points[0].x, padding + graphHeight);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padding, 0, padding + graphHeight);
    grad.addColorStop(0, 'rgba(31,122,67,0.08)');
    grad.addColorStop(1, 'rgba(31,122,67,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Draw smooth polyline
  if (points.length) {
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1f7a43';
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const midX = (prev.x + cur.x) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, midX, (prev.y + cur.y) / 2);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  // Draw points and store hit radius. Small baseline dots, last two highlighted.
  points.forEach((p, idx) => {
    const isLast = idx === points.length - 1;
    const isSecondLast = idx === points.length - 2;

    // baseline small green dot
    ctx.beginPath();
    ctx.fillStyle = '#1f7a43';
    const r = 3;
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // highlight last two with an outer ring (yellow/orange)
    if (isSecondLast || isLast) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = isLast ? '#de6d2b' : '#f0b33a';
      ctx.stroke();
    }

    p._hitRadius = 10;
  });

  // X-axis date labels (use recent dates)
  ctx.fillStyle = '#5a6b60';
  ctx.textAlign = 'center';
  ctx.font = '11px Arial';
  const today = new Date();
  for (let i = 0; i < trendData.length; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (trendData.length - 1 - i));
    const label = d.toISOString().slice(5, 10); // MM-DD
    const x = padding + i * stepX;
    ctx.fillText(label, x, padding + graphHeight + 18);
  }

  // attach points for tooltip handling (store on canvas)
  canvas._chartPoints = points;
}

// Tooltip / hover handling
ensureTooltip();
canvas.addEventListener('mousemove', (e) => {
  const points = canvas._chartPoints || [];
  if (!points.length) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  let found = null;
  for (let p of points) {
    const dx = mx - p.x;
    const dy = my - p.y;
    if (dx * dx + dy * dy <= (p._hitRadius || 8) * (p._hitRadius || 8)) {
      found = p;
      break;
    }
  }
  if (found) {
    const today = new Date();
    const idx = points.indexOf(found);
    const d = new Date(today);
    d.setDate(d.getDate() - (points.length - 1 - idx));
    chartTooltip.style.left = (e.clientX + 10) + 'px';
    chartTooltip.style.top = (e.clientY + 10) + 'px';
    chartTooltip.style.display = 'block';
    chartTooltip.innerText = `${d.toISOString().slice(0, 10)} — ${found.v} mosq`;
  } else {
    chartTooltip.style.display = 'none';
  }
});

canvas.addEventListener('mouseout', () => {
  if (chartTooltip) chartTooltip.style.display = 'none';
});

// CHART HOVER: Show risk assessment details
const riskDetailTooltip = document.createElement('div');
riskDetailTooltip.style.position = 'fixed';
riskDetailTooltip.style.background = '#ffffff';
riskDetailTooltip.style.border = '1px solid rgba(22,61,46,0.1)';
riskDetailTooltip.style.borderRadius = '8px';
riskDetailTooltip.style.padding = '16px';
riskDetailTooltip.style.boxShadow = '0 10px 30px rgba(20,60,40,0.1)';
riskDetailTooltip.style.maxWidth = '350px';
riskDetailTooltip.style.fontSize = '13px';
riskDetailTooltip.style.color = '#163d2e';
riskDetailTooltip.style.display = 'none';
riskDetailTooltip.style.zIndex = '1000';
riskDetailTooltip.style.lineHeight = '1.6';
document.body.appendChild(riskDetailTooltip);

canvas.addEventListener('mouseenter', (e) => {
  const riskCategoryEl = document.querySelector('.risk-box p strong');
  const riskCategory = riskCategoryEl ? riskCategoryEl.innerText : 'Safe';
  const fogCount = document.getElementById('fogCount') ? document.getElementById('fogCount').innerText : '0';

  const details = {
    'Safe': {
      range: '0-6 mosquitoes',
      level: '🟢 Low Risk',
      action: 'Routine Monitoring',
      color: '#0f6f45'
    },
    'Needs Cleaning': {
      range: '7-15 mosquitoes',
      level: '🟡 Moderate Risk',
      action: 'Environmental Cleaning',
      color: '#f0a84a'
    },
    'Needs Thorough Cleaning & Disinfecting': {
      range: '16-30 mosquitoes',
      level: '🔴 High Risk',
      action: 'Deep Cleaning + Larval Control',
      color: '#de6d2b'
    },
    'Subject for Fogging': {
      range: '30+ mosquitoes',
      level: '⛔ Critical Risk',
      action: 'Fogging + Community Intervention',
      color: '#c33'
    }
  };

  const info = details[riskCategory] || details['Safe'];

  riskDetailTooltip.innerHTML = `
    <div style="font-weight: 700; color: ${info.color}; margin-bottom: 10px; font-size: 14px;">${info.level}</div>
    <div style="margin-bottom: 6px;"><strong>Current Count:</strong> ${fogCount}</div>
    <div style="margin-bottom: 6px;"><strong>Range:</strong> ${info.range}</div>
    <div style="border-top: 1px solid rgba(22,61,46,0.15); padding-top: 8px; margin-top: 8px;">
      <strong style="color: ${info.color};">Recommended:</strong> ${info.action}
    </div>
  `;
  riskDetailTooltip.style.display = 'block';
});

canvas.addEventListener('mousemove', (e) => {
  const offsetX = 15;
  const offsetY = 10;
  let left = e.clientX + offsetX;
  let top = e.clientY + offsetY;

  // Prevent tooltip from going off-screen on the right
  if (left + riskDetailTooltip.offsetWidth > window.innerWidth) {
    left = e.clientX - riskDetailTooltip.offsetWidth - offsetX;
  }

  // Prevent tooltip from going off-screen on the bottom
  if (top + riskDetailTooltip.offsetHeight > window.innerHeight) {
    top = e.clientY - riskDetailTooltip.offsetHeight - offsetY;
  }

  riskDetailTooltip.style.left = left + 'px';
  riskDetailTooltip.style.top = top + 'px';
});

canvas.addEventListener('mouseleave', () => {
  riskDetailTooltip.style.display = 'none';
});

// Update trend with new data every 3 seconds
function updateTrendData() {
  const newValue = Math.floor(Math.random() * 6) + 1; // Random value 1-6
  trendData.push(newValue);

  if (trendData.length > maxDataPoints) {
    trendData.shift();
  }

  // Update mosquito count display
  document.getElementById("mosquitoCount").innerText = newValue;
  document.getElementById("fogCount").innerText = Math.max(newValue - 2, 0);

  // Recompute 3-day totals and classification
  const lastN = trendData.slice(-3);
  const threeDayTotal = lastN.reduce((s, v) => s + v, 0);
  const threeDayAvg = (threeDayTotal / Math.max(1, lastN.length));

  // Classification based on 3-day total (from provided table)
  function classifyByThreeDay(total) {
    if (total <= 6) return { category: 'Safe', action: 'Routine Monitoring' };
    if (total <= 15) return { category: 'Needs Cleaning', action: 'Environmental Cleaning' };
    if (total <= 30) return { category: 'Needs Thorough Cleaning & Disinfecting', action: 'Deep cleaning + larval control' };
    return { category: 'Subject for Fogging', action: 'Fogging + community-level intervention' };
  }

  const cls = classifyByThreeDay(threeDayTotal);

  // Update risk assessment UI
  const riskTitleEl = document.querySelector('.risk-box p strong');
  if (riskTitleEl) riskTitleEl.innerText = cls.category;
  const fogCountEl = document.getElementById('fogCount');
  if (fogCountEl) fogCountEl.innerText = threeDayTotal;

  // Update recommendation actions box (second .risk-box)
  const riskBoxes = document.querySelectorAll('.risk-grid .risk-box');
  if (riskBoxes && riskBoxes.length > 1) {
    const recBox = riskBoxes[1];
    recBox.innerHTML = '<h3>RECOMMENDATION ACTIONS</h3>' +
      '<ul><li>' + cls.action + '</li></ul>';
  }

  // Update the small SAFE/status box next to mosquito count
  const safeEl = document.querySelector('.safe');
  if (safeEl) {
    // Map category to small label and colors
    const map = {
      'Safe': { text: 'SAFE', color: '#0f6f45', bg: '#f3faf6', border: '2px solid #dff6e6' },
      'Needs Cleaning': { text: 'CLEAN', color: '#f0a84a', bg: '#fff8ef', border: '2px solid #fde6c8' },
      'Needs Thorough Cleaning & Disinfecting': { text: 'THOROUGH', color: '#de6d2b', bg: '#fff5f0', border: '2px solid #f7d5c7' },
      'Subject for Fogging': { text: 'FOGGING', color: '#c33', bg: '#fff0f0', border: '2px solid #f3c6c6' }
    };
    const info = map[cls.category] || map['Safe'];
    safeEl.innerText = info.text;
    safeEl.style.color = info.color;
    safeEl.style.background = info.bg;
    safeEl.style.border = info.border;
  }

  drawTrendGraph();
}

drawTrendGraph();
// Simulation is off by default. It will only start if Python is completely disconnected.
let simulationInterval = null;

/* =====================================================================
   3-DAY MOSQUITO TRACKING SYSTEM
   - MOSQUITO COUNT card  = today's detected mosquitoes
   - RISK ASSESSMENT count = rolling 3-day window total
   - After 3 full days the window resets to 0 automatically
   - Data survives page reloads via localStorage
   ===================================================================== */
const mostrapTracking = (function () {
  const KEY = 'mostrap_tracking';
  const DAY_MS = 24 * 60 * 60 * 1000;

  function dayStr(date) {
    return (date || new Date()).toISOString().slice(0, 10);
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { windowStart: dayStr(), daily: {} };
    } catch {
      return { windowStart: dayStr(), daily: {} };
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  let state = load();

  // Check if the current 3-day window has expired and reset if so
  function checkReset() {
    const today = dayStr();
    const start = new Date(state.windowStart);
    const elapsed = Math.floor((Date.now() - start.getTime()) / DAY_MS);
    if (elapsed >= 3) {
      state = { windowStart: today, daily: {} };
      save(state);
      console.log('[MOSTRAP] 3-day window reset — new window starts', today);
    }
  }

  // Schedule next check at midnight
  function scheduleMidnightCheck() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    setTimeout(() => {
      checkReset();
      scheduleMidnightCheck();
    }, midnight.getTime() - now.getTime());
  }

  checkReset();
  scheduleMidnightCheck();

  return {
    /** Today's detection count */
    getTodayCount() {
      return state.daily[dayStr()] || 0;
    },

    /** Sum of all detections in the current 3-day window */
    getWindowTotal() {
      const start = new Date(state.windowStart);
      let total = 0;
      for (let i = 0; i < 3; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        total += state.daily[dayStr(d)] || 0;
      }
      return total;
    },

    /** Which day of the window are we on? (1, 2, or 3) */
    getWindowDay() {
      const start = new Date(state.windowStart);
      return Math.min(Math.floor((Date.now() - start.getTime()) / DAY_MS) + 1, 3);
    },

    /** Increment today's count by 1, return new today count */
    incrementToday() {
      const today = dayStr();
      state.daily[today] = (state.daily[today] || 0) + 1;
      save(state);
      return state.daily[today];
    },

    /** Hard reset the entire window */
    resetAll() {
      state = { windowStart: dayStr(), daily: {} };
      save(state);
    },
  };
})();

// HAMBURGER TOGGLE
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (!hamburger || !sidebar) return;

  function openSidebar() {
    sidebar.classList.add('open');
    hamburger.classList.add('active');
    if (overlay) overlay.classList.add('active');
    hamburger.setAttribute('aria-expanded', 'true');
    const container = document.querySelector('.container');
    if (container) container.classList.remove('sidebar-collapsed');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    hamburger.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    const container = document.querySelector('.container');
    if (container) container.classList.add('sidebar-collapsed');
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('open') ||
      (window.innerWidth > 900 && !document.querySelector('.container').classList.contains('sidebar-collapsed'))) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSidebar();
  });

  // Tap overlay to close sidebar on mobile
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Close sidebar when clicking outside on small screens (fallback)
  document.addEventListener('click', (e) => {
    if (window.innerWidth > 900) return;
    if (!sidebar.classList.contains('open')) return;
    const target = e.target;
    if (!sidebar.contains(target) && !hamburger.contains(target)) {
      closeSidebar();
    }
  });

  // NAV: open history page when clicking the History nav item
  const navHistory = document.getElementById('navHistory');
  if (navHistory) {
    navHistory.style.cursor = 'pointer';
    navHistory.addEventListener('click', () => {
      window.location.href = 'history.html';
    });
  }

  // NAV: open manual page when clicking the Manual nav item
  const navManual = document.getElementById('navManual');
  if (navManual) {
    navManual.style.cursor = 'pointer';
    navManual.addEventListener('click', () => {
      window.location.href = 'manual.html';
    });
  }

  // NAV: open contact page when clicking the Contact nav item
  const navContact = document.getElementById('navContact');
  if (navContact) {
    navContact.style.cursor = 'pointer';
    navContact.addEventListener('click', () => {
      window.location.href = 'contact.html';
    });
  }

  // SIGN OUT: navigate back to login
  const signoutBtn = document.getElementById('signoutBtn');
  if (signoutBtn) {
    signoutBtn.style.cursor = 'pointer';
    signoutBtn.addEventListener('click', () => {
      window.location.href = 'login.html';
    });
  }

  // NOTIFICATIONS BELL
  const notifications = [
    {
      title: 'Subject for Fogging',
      count: 35,
      actions: 'Fogging & community-level intervention · Notify local vector control teams',
      date: '1/7/2026',
      color: '#c33',
      bgColor: '#fff0f0'
    },
    {
      title: 'Needs Thorough Cleaning & Disinfecting',
      count: 22,
      actions: 'Deep cleaning + larval source reduction (remove/cover stagnant water) · Consider larval treatments (Bti) and',
      date: '1/6/2026',
      color: '#de6d2b',
      bgColor: '#fff5f0'
    },
    {
      title: 'Needs Cleaning',
      count: 18,
      actions: 'Environmental cleaning and disinfection · Focus on removing breeding sites',
      date: '1/5/2026',
      color: '#f0a84a',
      bgColor: '#fff8ef'
    }
  ];

  const notificationBell = document.getElementById('notificationBell');
  const notificationsModal = document.getElementById('notificationsModal');
  const closeNotifications = document.getElementById('closeNotifications');
  const notificationsContainer = document.getElementById('notificationsContainer');

  // Populate notifications
  notificationsContainer.innerHTML = notifications.map((notif, idx) => `
    <div style="display: flex; gap: 12px; margin-bottom: 16px; padding: 12px; background: ${notif.bgColor}; border-radius: 8px;">
      <div style="width: 40px; height: 40px; background: ${notif.color}; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; flex-shrink: 0;">
        !
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 700; color: #163d2e; margin-bottom: 4px;">${notif.title}</div>
        <div style="font-size: 13px; color: #999; margin-bottom: 6px;">Total Mosquito Count: ${notif.count}</div>
        <div style="font-size: 12px; color: #666; line-height: 1.5; margin-bottom: 8px;">
          Actions: ${notif.actions}
        </div>
        <div style="font-size: 11px; color: #bbb;">${notif.date}</div>
      </div>
    </div>
  `).join('');

  notificationBell.addEventListener('click', () => {
    notificationsModal.style.display = 'block';
  });

  closeNotifications.addEventListener('click', () => {
    notificationsModal.style.display = 'none';
  });

  notificationsModal.addEventListener('click', (e) => {
    if (e.target === notificationsModal) {
      notificationsModal.style.display = 'none';
    }
  });
});

/* ============================================================
   SUPABASE CLOUD INTEGRATION
   Connects to Supabase Realtime instead of Localhost.
   This allows the Vercel dashboard to work from ANY device.
   ============================================================ */

(function initCloudBackend() {
  // ── Status pill ──────────────────────────────────────────────────────────────
  const indicator = document.createElement('div');
  indicator.id = 'pyStatus';
  indicator.style.cssText = `
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: #1a1a1a; color: #fff; font-size: 12px; font-weight: 600;
    padding: 7px 16px; border-radius: 20px; z-index: 5000;
    border-left: 4px solid #888; display: none; gap: 8px; align-items: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3); transition: all 0.3s;
  `;
  document.body.appendChild(indicator);

  function setStatus(msg, color, autohide = true) {
    indicator.style.display = 'flex';
    indicator.style.borderLeftColor = color;
    indicator.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span> ${msg}`;
    if (autohide) setTimeout(() => { indicator.style.display = 'none'; }, 5000);
  }

  // Ensure Supabase is loaded
  if (!window.supabase || !supabaseClient) {
    setStatus('Supabase not configured', '#e03131');
    return;
  }

  let currentTodayCount = 0;
  let currentWindowTotal = 0;

  // Initialize data on load
  async function fetchInitialData() {
    try {
      // Pause generic simulation since we are checking cloud
      clearInterval(simulationInterval);
      simulationInterval = null;

      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);

      const todayStr = today.toISOString().split('T')[0];
      const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

      // Fetch last 3 days of detections
      const { data, error } = await supabaseClient
        .from('detections')
        .select('*')
        .gte('timestamp', threeDaysAgoStr + 'T00:00:00');

      if (error) {
        console.error("Supabase fetch error:", error);
        setStatus('Cloud connect error', '#e03131');
        return;
      }
      
      setStatus('🟢 Connected to Cloud', '#4dda7a');

      // Calculate totals
      let tCount = 0;
      let wTotal = 0;

      data.forEach(d => {
        wTotal++;
        if (d.timestamp && d.timestamp.startsWith(todayStr)) {
          tCount++;
        }
      });

      currentTodayCount = tCount;
      currentWindowTotal = wTotal;

      refreshDashboardUI(currentTodayCount, currentWindowTotal);
    } catch (err) {
      console.error(err);
    }
  }

  fetchInitialData();

  // ── Live detection from Cloud (Supabase Realtime) ────────────────────────────
  const detectionsChannel = supabaseClient.channel('custom-insert-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'detections' },
      (payload) => {
        console.log('New detection received:', payload);
        const newRecord = payload.new;
        
        currentTodayCount++;
        currentWindowTotal++;
        
        const species = newRecord.species || 'mosquito';
        const snapshotUrl = newRecord.snapshot_url;

        // MOSQUITO COUNT exactly syncs with db
        refreshDashboardUI(currentTodayCount, currentWindowTotal);
        flashCountBox();
        
        const toastData = {
          species: species,
          snapshot: snapshotUrl
        };
        showDetectionToast(toastData, currentTodayCount, currentWindowTotal);
      }
    )
    .subscribe();

  // ── Core UI update ────────────────────────────────────────────────────────────
  // sessionCount  = Python's session count (matches camera window)
  // windowTotal   = 3-day accumulated total from backend API / history.json
  function refreshDashboardUI(sessionCount, windowTotal = 0) {
    // MOSQUITO COUNT card = same as camera window
    const countEl = document.getElementById('mosquitoCount');
    if (countEl) countEl.innerText = sessionCount;

    // Push session count into chart
    trendData.push(sessionCount);
    if (trendData.length > maxDataPoints) trendData.shift();

    // RISK ASSESSMENT — based on 3-day window total
    let category, action;
    if (windowTotal <= 6)       { category = 'Safe';                                    action = 'Routine Monitoring'; }
    else if (windowTotal <= 15) { category = 'Needs Cleaning';                          action = 'Environmental Cleaning'; }
    else if (windowTotal <= 30) { category = 'Needs Thorough Cleaning & Disinfecting';  action = 'Deep cleaning + larval control'; }
    else                        { category = 'Subject for Fogging';                     action = 'Fogging + community-level intervention'; }

    const riskTitleEl = document.querySelector('.risk-box p strong');
    if (riskTitleEl) riskTitleEl.innerText = category;

    // fogCount = 3-day window total
    const fogCountEl = document.getElementById('fogCount');
    if (fogCountEl) fogCountEl.innerText = windowTotal;

    // Update heading to show current day in window
    const assessmentHeading = document.querySelector('.risk-box h3');
    if (assessmentHeading) assessmentHeading.innerText = `3 DAY ASSESSMENT`;

    const riskBoxes = document.querySelectorAll('.risk-grid .risk-box');
    if (riskBoxes && riskBoxes.length > 1) {
      riskBoxes[1].innerHTML = '<h3>RECOMMENDATION ACTIONS</h3><ul><li>' + action + '</li></ul>';
    }

    const safeEl = document.querySelector('.safe');
    if (safeEl) {
      const map = {
        'Safe':                                   { text: 'SAFE',     color: '#0f6f45', bg: '#f3faf6', border: '2px solid #dff6e6' },
        'Needs Cleaning':                         { text: 'CLEAN',    color: '#f0a84a', bg: '#fff8ef', border: '2px solid #fde6c8' },
        'Needs Thorough Cleaning & Disinfecting': { text: 'THOROUGH', color: '#de6d2b', bg: '#fff5f0', border: '2px solid #f7d5c7' },
        'Subject for Fogging':                    { text: 'FOGGING',  color: '#c33',    bg: '#fff0f0', border: '2px solid #f3c6c6' },
      };
      const info = map[category] || map['Safe'];
      safeEl.innerText        = info.text;
      safeEl.style.color      = info.color;
      safeEl.style.background = info.bg;
      safeEl.style.border     = info.border;
    }

    drawTrendGraph();
  }


  // ── Flash count box briefly on detection ───────────────────────────────────────
  function flashCountBox() {
    const countEl = document.getElementById('mosquitoCount');
    if (!countEl) return;
    countEl.style.transition = 'color 0.1s';
    countEl.style.color = '#e03131';
    setTimeout(() => { countEl.style.color = ''; }, 700);
  }

  // ── Toast notification with snapshot link ───────────────────────────────────--
  function showDetectionToast(data, todayCount, windowTotal) {
    const toast = document.createElement('div');
    const species = data.species || 'mosquito';

    // Color-code by species
    const speciesColors = {
      'Aedes aegypti':           '#e03131',
      'Aedes albopictus':        '#de6d2b',
      'Culex quinquefasciatus':  '#f0a84a',
      'anopheles':               '#7c3aed',
    };
    const accentColor = speciesColors[species] || '#e03131';

    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      background: #1a1a1a; color: #fff;
      padding: 14px 18px; border-radius: 10px;
      font-size: 14px; font-weight: 600;
      box-shadow: 0 8px 30px rgba(0,0,0,0.35);
      border-left: 4px solid ${accentColor};
      transform: translateY(20px); opacity: 0;
      transition: all 0.3s ease; z-index: 9999; max-width: 320px;
      display: flex; flex-direction: column; gap: 4px;
    `;

    const snapshotLink = data.snapshot
      ? `<a href="${data.snapshot}"
            target="_blank"
            style="color:#4dda7a;text-decoration:none;font-size:12px;">
            📷 View snapshot →
         </a>`
      : '';

    toast.innerHTML = `
      <span>🦟 <strong style="color:${accentColor}">${species}</strong> detected!</span>
      <span style="font-size:12px;font-weight:400;color:#ccc">Today: <strong style="color:#fff">${todayCount}</strong> &nbsp;|&nbsp; 3-day total: <strong style="color:#f0a84a">${windowTotal}</strong></span>
      ${snapshotLink}
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      });
    });

    setTimeout(() => {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, 5000);
  }
})();
