// Initialize Supabase Client
const supabaseUrl = 'https://zcdazfkwlkgiyyajnisw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZGF6Zmt3bGtnaXl5YWpuaXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODc2MTYsImV4cCI6MjA5MDI2MzYxNn0.wNhd6C_txAXrmm1Va41r7qL8NSnUmui1IQJ8eXjb5FU';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Signup form handler
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

  const signupBtn = document.getElementById('signupBtn');
  const nameInput = document.getElementById('nameInput');
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const confirmPasswordInput = document.getElementById('confirmPasswordInput');
  const agreeTerms = document.getElementById('agreeTerms');
  
  if (signupBtn) {
    signupBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const name = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const confirmPassword = confirmPasswordInput.value.trim();
      const agreed = agreeTerms.checked;
      
      // Validation
      if (!name || !email || !password || !confirmPassword) {
        alert('Please fill in all fields');
        return;
      }
      
      if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
      }
      
      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }
      
      if (!agreed) {
        alert('Please agree to the terms and conditions');
        return;
      }
      
      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
      }
      
      // Disable button while processing
      signupBtn.disabled = true;
      const originalText = signupBtn.textContent;
      signupBtn.textContent = 'Creating Account...';

      try {
        // Sign up with Supabase
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              full_name: name
            }
          }
        });

        if (error) {
          alert('Error: ' + error.message);
        } else {
          // If the user is successfully created
          if (data.session) {
            // User was created and a session established (no email verification required)
            alert('Account created successfully! Redirecting to dashboard...');
            window.location.href = 'dashboard.html';
          } else {
            // User created but requires email verification
            alert('Account created successfully! Please check your email inbox to verify your account.');
            // Redirect to login
            window.location.href = 'login.html';
          }
        }
      } catch (err) {
        console.error('Unexpected Signup Error:', err);
        alert('An unexpected error occurred. Please try again later.');
      } finally {
        // Re-enable button
        signupBtn.disabled = false;
        signupBtn.textContent = originalText;
      }
    });
  }
});
