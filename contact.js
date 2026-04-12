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
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        hamburger.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });

    if (overlay) overlay.addEventListener('click', closeSidebar);

    document.addEventListener('click', (e) => {
        if (window.innerWidth > 900) return;
        if (!sidebar.classList.contains('open')) return;
        if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
            closeSidebar();
        }
    });

    // NAVIGATION HANDLERS
    // Main Dashboard
    const navDashboard = document.getElementById('navDashboard');
    if (navDashboard) {
        navDashboard.style.cursor = 'pointer';
        navDashboard.addEventListener('click', function () {
            window.location.href = 'dashboard.html';
        });
    }
    // History
    const navHistory = document.getElementById('navHistory');
    if (navHistory) {
        navHistory.style.cursor = 'pointer';
        navHistory.addEventListener('click', function () {
            window.location.href = 'history.html';
        });
    }
    // Manual (optional, if you want to add navigation)
    const navManual = document.getElementById('navManual');
    if (navManual) {
        navManual.style.cursor = 'pointer';
        navManual.addEventListener('click', function () {
            window.location.href = 'manual.html';
        });
    }
    // Contact (active)
    const navContact = document.getElementById('navContact');
    if (navContact) {
        navContact.style.cursor = 'pointer';
        navContact.addEventListener('click', function () {
            window.location.href = 'contact.html';
        });
    }

    // Sign out button
    const signOutBtn = document.getElementById('signoutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', function () {
            window.location.href = 'login.html';
        });
    }

    // Contact form submission
    const supportForm = document.getElementById('supportForm');
    if (supportForm) {
        supportForm.addEventListener('submit', function (e) {
            e.preventDefault();
            alert('Your message has been sent!');
            supportForm.reset();
        });
    }
});
