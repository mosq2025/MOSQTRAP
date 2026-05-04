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
      if (!window.supabaseClient) {
        console.warn("[History] Supabase client not initialized.");
        return;
      }

      const { data, error } = await window.supabaseClient.from('detections').select('*');
      if (error) throw error;

      // Group by date (YYYY-MM-DD)
      const rawData = {};
      data.forEach(row => {
        if (!row.timestamp) return;
        const dateStr = row.timestamp.split('T')[0];
        if (!rawData[dateStr]) {
          rawData[dateStr] = { mosquitoes: 0, lastUpdated: row.timestamp };
        }
        rawData[dateStr].mosquitoes++;
        if (row.timestamp > rawData[dateStr].lastUpdated) {
          rawData[dateStr].lastUpdated = row.timestamp;
        }
      });
      
      // Sort oldest to newest to group into windows
      const datesAsc = Object.keys(rawData).sort((a, b) => new Date(a) - new Date(b));
      
      const periods = [];
      let currentPeriod = null;

      datesAsc.forEach(dateStr => {
        if (!currentPeriod) {
           currentPeriod = {
             startDate: dateStr,
             endDate: dateStr,
             mosquitoes: rawData[dateStr].mosquitoes,
             lastUpdated: rawData[dateStr].lastUpdated,
           };
        } else {
           const startD = new Date(currentPeriod.startDate);
           const currD = new Date(dateStr);
           const diffDays = Math.floor((currD - startD) / (1000 * 60 * 60 * 24));
           
           if (diffDays < 3) { 
              // Still within the 3-day window
              currentPeriod.endDate = dateStr;
              currentPeriod.mosquitoes += rawData[dateStr].mosquitoes;
              if (rawData[dateStr].lastUpdated > currentPeriod.lastUpdated) {
                 currentPeriod.lastUpdated = rawData[dateStr].lastUpdated;
              }
           } else {
              // Finish current period and start a new one
              periods.push(currentPeriod);
              currentPeriod = {
                 startDate: dateStr,
                 endDate: dateStr,
                 mosquitoes: rawData[dateStr].mosquitoes,
                 lastUpdated: rawData[dateStr].lastUpdated,
              };
           }
        }
      });
      if (currentPeriod) periods.push(currentPeriod);

      // Sort newest to oldest for display
      periods.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

      historyData = [];
      const tbody = table.tBodies[0];
      tbody.innerHTML = '';
      
      if (periods.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No history data found</td></tr>';
        return;
      }

      periods.forEach(p => {
        // Calculate the 3-day window from the start date for a clean range string
        const startD = new Date(p.startDate);
        const endOfWindow = new Date(startD);
        endOfWindow.setDate(startD.getDate() + 2);
        
        const dateRangeStr = `${p.startDate} to ${endOfWindow.toISOString().split('T')[0]}`;
        
        const risk = classifyByThreeDay(p.mosquitoes);
        
        const lu = new Date(p.lastUpdated);
        const lastUpdatedStr = lu.toLocaleDateString() + ', ' + lu.toLocaleTimeString();

        historyData.push({
          date: dateRangeStr,
          mosquitoes: p.mosquitoes > 0 ? p.mosquitoes : '—',
          riskAssessment: risk,
          lastUpdated: lastUpdatedStr
        });
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${dateRangeStr}</td>
          <td>${p.mosquitoes}</td>
          <td>${risk}</td>
          <td>${lastUpdatedStr}</td>
        `;
        tbody.appendChild(tr);
      });
      
      // Re-apply any existing filters
      applyFilter(); 
      
      // Update pagination info (assuming display all for now, or match existing logic)
      const visibleRows = Array.from(tbody.rows).filter(r => r.style.display !== 'none').length;
      const paginationEl = document.querySelector('.pagination');
      if (paginationEl) {
         if (periods.length > 0) {
           paginationEl.textContent = `1 - ${visibleRows} of ${periods.length}`;
         } else {
           paginationEl.textContent = '0 - 0 of 0';
         }
      }

    } catch (e) {
      console.warn("[History] Could not fetch real data from Supabase:", e);
    }
  }

  fetchHistoryTable();
  // Listen for realtime inserts instead of polling
  if (window.supabaseClient) {
    window.supabaseClient.channel('history-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'detections' }, () => {
        fetchHistoryTable(); // Refresh table
      }).subscribe();
  }

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

  function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header text
    doc.setFontSize(18);
    doc.text("MOSTRAP - History Report", 14, 22);
    
    // Add subtitle with date range if filtered
    doc.setFontSize(11);
    const dateText = `Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    doc.text(dateText, 14, 30);
    
    // Get visible rows only
    const rows = Array.from(table.tBodies[0].rows).filter(r => r.style.display !== 'none');
    
    // Prepare data for autoTable
    const head = [Array.from(table.tHead.rows[0].cells).map(c => c.textContent.trim())];
    const body = rows.map(r => Array.from(r.cells).map(c => c.textContent.trim()));
    
    // Generate table
    doc.autoTable({
      head: head,
      body: body,
      startY: 35,
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [43, 179, 133], // Match MOSTRAP green color
        textColor: [255, 255, 255]
      },
      alternateRowStyles: {
        fillColor: [245, 250, 248] // Very light green for alternating rows
      }
    });
    
    // Save the PDF
    doc.save('mostrap_history.pdf');
  }

  applyBtn.addEventListener('click', applyFilter);
  downloadBtn.addEventListener('click', downloadPDF);
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
      if (confirm('Are you sure you want to sign out?')) {
        window.location.href = 'login.html';
      }
    });
  }
});
