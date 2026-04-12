// Client-side filtering and CSV download for History page
document.addEventListener('DOMContentLoaded', function () {
  // Sidebar navigation handlers
  const navContact = document.getElementById('navContact');
  if (navContact) {
    navContact.style.cursor = 'pointer';
    navContact.addEventListener('click', function () {
      window.location.href = 'contact.html';
    });
  }
  // DATE & TIME (match dashboard behavior)
  function updateTime() {
    const now = new Date();
    const el = document.getElementById('datetime');
    if (!el) return;
    el.innerText = now.toLocaleTimeString() + ' | ' + now.toDateString();
  }
  updateTime();
  setInterval(updateTime, 1000);

  const applyBtn = document.getElementById('applyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const searchInput = document.getElementById('searchDate');
  const startInput = document.getElementById('startDate');
  const endInput = document.getElementById('endDate');
  const table = document.getElementById('historyTable');

  // REAL-TIME HISTORY DATA from Python Backend
  let historyData = [];

  function classifyByThreeDay(total) {
    if (total <= 6) return 'Safe';
    if (total <= 15) return 'Needs Cleaning';
    if (total <= 30) return 'Needs Thorough Cleaning & Disinfecting';
    return 'Subject for Fogging';
  }

  async function fetchHistoryTable() {
    try {
      const res = await fetch("http://localhost:5000/api/history");
      if (!res.ok) throw new Error("Server not responding");
      const rawData = await res.json();
      
      const dates = Object.keys(rawData).sort((a, b) => new Date(b) - new Date(a));
      historyData = [];
      
      const tbody = table.tBodies[0];
      tbody.innerHTML = '';
      
      if (dates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No history data found</td></tr>';
        return;
      }

      dates.forEach(dateStr => {
        const item = rawData[dateStr];
        
        // Calculate 3-day total for risk assessment
        let threeDayTotal = item.mosquitoes;
        for (let offset = 1; offset <= 2; offset++) {
          const d = new Date(dateStr);
          d.setDate(d.getDate() - offset);
          const pastStr = d.toISOString().split('T')[0];
          if (rawData[pastStr]) {
            threeDayTotal += rawData[pastStr].mosquitoes;
          }
        }
        
        const risk = classifyByThreeDay(threeDayTotal);
        
        historyData.push({
          date: dateStr,
          mosquitoes: threeDayTotal > 0 ? threeDayTotal : '—',
          riskAssessment: risk,
          lastUpdated: item.lastUpdated || ''
        });
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${dateStr}</td>
          <td>${threeDayTotal}</td>
          <td>${risk}</td>
          <td>${item.lastUpdated || ''}</td>
        `;
        tbody.appendChild(tr);
      });
      
      // Re-apply any existing filters
      applyFilter(); 
      
      // Update pagination info (assuming display all for now, or match existing logic)
      const visibleRows = Array.from(tbody.rows).filter(r => r.style.display !== 'none').length;
      const paginationEl = document.querySelector('.pagination');
      if (paginationEl) {
         if (dates.length > 0) {
           paginationEl.textContent = `1 - ${visibleRows} of ${dates.length}`;
         } else {
           paginationEl.textContent = '0 - 0 of 0';
         }
      }

    } catch (e) {
      console.warn("[History] Could not fetch real data from server:", e);
    }
  }

  fetchHistoryTable();
  setInterval(fetchHistoryTable, 5000);

  function rowMatches(row, q, start, end) {
    const dateText = row.cells[0].textContent.trim();
    // exact-match substring for search box
    if (q && !dateText.includes(q)) return false;
    if (start || end) {
      const d = new Date(dateText);
      if (start && d < new Date(start)) return false;
      if (end && d > new Date(end)) return false;
    }
    return true;
  }

  function applyFilter() {
    const q = searchInput.value.trim();
    const start = startInput.value || null;
    const end = endInput.value || null;
    Array.from(table.tBodies[0].rows).forEach(row => {
      row.style.display = rowMatches(row, q, start, end) ? '' : 'none';
    });
  }

  function downloadCSV() {
    const rows = Array.from(table.tBodies[0].rows).filter(r => r.style.display !== 'none');
    const cols = Array.from(table.tHead.rows[0].cells).map(c => c.textContent.trim());
    const lines = [cols.join(',')];
    rows.forEach(r => {
      const vals = Array.from(r.cells).map(c => `"${c.textContent.replace(/"/g, '""')}"`);
      lines.push(vals.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'history.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  applyBtn.addEventListener('click', applyFilter);
  downloadBtn.addEventListener('click', downloadCSV);
  // small convenience: filter as you type (debounced)
  let t;
  searchInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilter, 300) });

  // HAMBURGER + SIDEBAR behavior (matching dashboard)
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (hamburger && sidebar) {
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

    if (overlay) overlay.addEventListener('click', closeSidebar);

    document.addEventListener('click', (e) => {
      if (window.innerWidth > 900) return;
      if (!sidebar.classList.contains('open')) return;
      const target = e.target;
      if (!sidebar.contains(target) && !hamburger.contains(target)) {
        closeSidebar();
      }
    });
  }

  // NAV: wire dashboard/history navigation
  const navHistory = document.getElementById('navHistory');
  if (navHistory) {
    navHistory.style.cursor = 'pointer';
    navHistory.addEventListener('click', () => {
      // already on history, ensure active state
      // highlight briefly
      navHistory.classList.add('active');
      setTimeout(() => navHistory.classList.remove('active'), 300);
    });
  }

  // NAV: Manual - navigate to manual page
  const navManual = document.getElementById('navManual');
  if (navManual) {
    navManual.style.cursor = 'pointer';
    navManual.addEventListener('click', () => {
      window.location.href = 'manual.html';
    });
  }

  // NAV: Main Dashboard - navigate back when clicked
  const navMain = document.getElementById('navMain');
  if (navMain) {
    navMain.style.cursor = 'pointer';
    navMain.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
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
});
