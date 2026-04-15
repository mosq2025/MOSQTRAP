// wifi-check.js
document.addEventListener("DOMContentLoaded", () => {
  // Create offline overlay
  const overlay = document.createElement("div");
  overlay.id = "wifiOfflineOverlay";
  overlay.className = "wifi-offline-overlay";
  
  const content = document.createElement("div");
  content.className = "wifi-offline-content";
  
  const icon = document.createElement("div");
  icon.className = "wifi-icon-container";
  icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-wifi-off"><line x1="2" y1="2" x2="22" y2="22"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`;
  
  const title = document.createElement("h2");
  title.textContent = "No Internet Connection";
  
  const text = document.createElement("p");
  text.textContent = "Please connect to a Wi-Fi or cellular network to access MOSTRAP.";
  
  const retryBtn = document.createElement("button");
  retryBtn.textContent = "Retry Connection";
  retryBtn.onclick = () => {
    retryBtn.textContent = "Checking...";
    setTimeout(() => {
      checkConnection();
      retryBtn.textContent = "Retry Connection";
    }, 500);
  };

  content.appendChild(icon);
  content.appendChild(title);
  content.appendChild(text);
  content.appendChild(retryBtn);
  overlay.appendChild(content);
  
  document.body.appendChild(overlay);

  function checkConnection() {
    if (!navigator.onLine) {
      overlay.classList.add("active");
    } else {
      overlay.classList.remove("active");
    }
  }

  // Initial check
  checkConnection();

  // Listeners for network status changes
  window.addEventListener("online", checkConnection);
  window.addEventListener("offline", checkConnection);
});
