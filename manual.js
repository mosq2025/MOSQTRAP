/* DATE & TIME */
function updateTime() {
  const datetimeEl = document.getElementById("datetime");
  if (datetimeEl) {
    const now = new Date();
    datetimeEl.innerText = now.toLocaleTimeString() + " | " + now.toDateString();
  }
}

setInterval(updateTime, 1000);
updateTime();

// Smooth scrolling for TOC and nav links
document.addEventListener('DOMContentLoaded', () => {
  const allLinks = document.querySelectorAll('a[href^="#"]');
  allLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        const headerOffset = 80; // Account for fixed header if any
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

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

  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Close sidebar when clicking outside on small screens
  document.addEventListener('click', (e) => {
    if (window.innerWidth > 900) return;
    if (!sidebar.classList.contains('open')) return;
    const target = e.target;
    if (!sidebar.contains(target) && !hamburger.contains(target)) {
      closeSidebar();
    }
  });

  // NAV: open dashboard page when clicking the Main Dashboard nav item
  const navDashboard = document.getElementById('navDashboard');
  if (navDashboard) {
    navDashboard.style.cursor = 'pointer';
    navDashboard.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }

  // NAV: open history page when clicking the History nav item
  const navHistory = document.getElementById('navHistory');
  if (navHistory) {
    navHistory.style.cursor = 'pointer';
    navHistory.addEventListener('click', () => {
      window.location.href = 'history.html';
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
});