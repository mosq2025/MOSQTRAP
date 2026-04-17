// Initialize Supabase Client
const supabaseUrl = 'https://zcdazfkwlkgiyyajnisw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZGF6Zmt3bGtnaXl5YWpuaXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODc2MTYsImV4cCI6MjA5MDI2MzYxNn0.wNhd6C_txAXrmm1Va41r7qL8NSnUmui1IQJ8eXjb5FU';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Lantern rotation based on horizontal cursor movement (left/right only)
const leftPanel = document.querySelector(".left-panel");
const lantern = document.querySelector(".lantern");
let targetRotation = 0;
let currentRotation = 0;
const maxAngle = 18; // maximum left/right rotation in degrees

function setLanternTargetFromPointer(clientX) {
  if (!leftPanel) return;
  const rect = leftPanel.getBoundingClientRect();
  const norm = (clientX - rect.left) / rect.width; // 0..1
  const offset = (norm - 0.5) * 2; // -1..1
  targetRotation = Math.max(-1, Math.min(1, offset)) * maxAngle;
}

// Rotation only while clicking/dragging (mouse/touch)
let isDragging = false;

function onPointerMove(e) {
  const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
  if (clientX !== undefined) setLanternTargetFromPointer(clientX);
}

// Start drag on mousedown or touchstart inside left panel
leftPanel.addEventListener("mousedown", (e) => {
  isDragging = true;
  setLanternTargetFromPointer(e.clientX);
  document.addEventListener("mousemove", onPointerMove);
});
leftPanel.addEventListener("touchstart", (e) => {
  isDragging = true;
  if (e.touches && e.touches[0]) setLanternTargetFromPointer(e.touches[0].clientX);
  document.addEventListener("touchmove", onPointerMove, {passive: true});
}, {passive: true});

// Stop drag on mouseup/touchend anywhere
document.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  document.removeEventListener("mousemove", onPointerMove);
  targetRotation = 0; // ease back to center
});
document.addEventListener("touchend", () => {
  if (!isDragging) return;
  isDragging = false;
  document.removeEventListener("touchmove", onPointerMove);
  targetRotation = 0;
});

// Reset when leaving left panel (safety)
leftPanel.addEventListener("mouseleave", () => { if (!isDragging) targetRotation = 0; });

function updateLanternRotation() {
  // simple easing (lerp)
  currentRotation += (targetRotation - currentRotation) * 0.12;
  if (lantern) lantern.style.transform = `rotate(${currentRotation}deg)`;
  requestAnimationFrame(updateLanternRotation);
}

updateLanternRotation();
// LOGIN FORM HANDLER
document.addEventListener('DOMContentLoaded', () => {
  // --- Welcome Loading Overlay Logic ---
  const welcomeOverlay = document.getElementById('welcomeOverlay');
  if (welcomeOverlay) {
    // Show the loading screen for 1.8 seconds, then fade it out
    setTimeout(() => {
      welcomeOverlay.classList.add('fade-out');
      // Remove it from the DOM after the fade transition (0.8s) so it doesn't block clicks
      setTimeout(() => {
        welcomeOverlay.style.display = 'none';
      }, 800);
    }, 1800);
  }

  const loginBtn = document.getElementById('loginBtn');
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  
  if (loginBtn) {
    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      
      // Basic validation
      if (!email || !password) {
        alert('Please enter email and password');
        return;
      }
      
      // Disable button while processing
      loginBtn.disabled = true;
      const originalText = loginBtn.textContent;
      loginBtn.textContent = 'Logging In...';

      try {
        // Sign in with Supabase
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password
        });

        if (error) {
          alert('Login Error: ' + error.message);
        } else if (data.session) {
          // Navigate to dashboard on successful login
          window.location.href = 'dashboard.html';
        }
      } catch (err) {
        console.error('Unexpected Login Error:', err);
        alert('An unexpected error occurred. Please try again later.');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = originalText;
      }
    });
  }
});