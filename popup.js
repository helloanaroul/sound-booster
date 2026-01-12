function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}


// Slider 0–1000  →  internal gain 0–10
function toGain(sliderVal) {
  return clamp(Number(sliderVal) / 100, 0, 10);
}

function toSlider(gain) {
  return Math.round(clamp(gain, 0, 10) * 100);
}


// Cross-browser helper to get the active tab (supports Promise-based `browser` and callback-based `chrome`).
function getActiveTab() {
  const query = { active: true, currentWindow: true };
  if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
    return browser.tabs.query(query).then(tabs => tabs[0]);
  }
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    return new Promise(resolve => {
      chrome.tabs.query(query, function(tabs) { resolve(tabs[0]); });
    });
  }
  return Promise.resolve(null);
}

// Cross-browser helper to send a message to a tab and wait for response if available.
function sendMessageToTab(tabId, message) {
  if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.sendMessage) {
    return browser.tabs.sendMessage(tabId, message);
  }
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.sendMessage) {
    return new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(tabId, message, function(response) { resolve(response); });
      } catch (e) {
        // Some chrome environments throw if no receiver; resolve anyway.
        resolve();
      }
    });
  }
  return Promise.resolve();
}

// Cross-browser storage helpers
function getStorage(keys) {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local && browser.storage.local.get) {
    return browser.storage.local.get(keys);
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.get) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, function(result) { resolve(result || {}); });
    });
  }
  return Promise.resolve({});
}

function setStorage(obj) {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local && browser.storage.local.set) {
    return browser.storage.local.set(obj);
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.set) {
    return new Promise(resolve => {
      chrome.storage.local.set(obj, function() { resolve(); });
    });
  }
  return Promise.resolve();
}

function siteKeyFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

// DOM Elements
const gainInput = document.getElementById('boostRange');
// Some markup uses "boostDisplay" while older code referenced "boostValue".
// Use the existing element and fall back to the other id for compatibility.
const gainLabel = document.getElementById('boostValue') || document.getElementById('boostDisplay');

const toggleSwitch = document.getElementById('toggleSwitch');
const statusDisplay = document.getElementById('statusDisplay');
const boostDisplay = document.getElementById('boostDisplay');
const bassControl = document.getElementById('bassControl');
const bassValue = document.getElementById('bassValue');
const trebleControl = document.getElementById('trebleControl');
const trebleValue = document.getElementById('trebleValue');



/* =========================
   GET ACTIVE TAB + SITE KEY + INITIALIZE
========================= */
(async () => {
  const tab = await getActiveTab();
  const siteKey = (tab && tab.url) ? siteKeyFromUrl(tab.url) : '__global__';

  const DEFAULT_GAIN = 1.0; // 100%
  gainInput.step = 10;

  /* =========================
     LOAD ALL SETTINGS
  ========================= */
  const stored = await getStorage([
    siteKey,
    'isEnabled',
    'bassLevel',
    'trebleLevel'
  ]);

  // Load gain from site-specific storage
  const gain = typeof stored[siteKey] === 'number' ? stored[siteKey] : DEFAULT_GAIN;
  const sliderVal = toSlider(gain);
  
  // Load toggle and audio controls
  const isEnabled = stored.isEnabled !== undefined ? stored.isEnabled : false;
  const bassLevel = stored.bassLevel !== undefined ? stored.bassLevel : 0;
  const trebleLevel = stored.trebleLevel !== undefined ? stored.trebleLevel : 0;

  // Update UI elements
  gainInput.value = sliderVal;
  gainLabel.textContent = sliderVal + '%';
  boostDisplay.textContent = `${sliderVal}%`;

  toggleSwitch.checked = isEnabled;
  
  bassControl.value = bassLevel;
  bassValue.textContent = bassLevel + "dB";
  
  trebleControl.value = trebleLevel;
  trebleValue.textContent = trebleLevel + "dB";

  // Update status display
  statusDisplay.textContent = isEnabled ? 'ON' : 'OFF';
  statusDisplay.className = isEnabled ? 'status-display status-on' : 'status-display status-off';

  // Attach event listeners AFTER initialization
  setupEventListeners();

  /* =========================
     APPLY STORED GAIN TO TAB
  ========================= */
  try {
    if (tab && tab.id) {
      await sendMessageToTab(tab.id, {
        type: 'SOUND_BOOSTER_SET',
        gain
      });
    }
  } catch (e) {
    // content script may not be ready yet — ignore
  }

  if (isEnabled) {
    updateExtensionState(isEnabled, sliderVal, bassLevel, trebleLevel);
  }
})();

/* =========================
   SETUP EVENT LISTENERS
========================= */
function setupEventListeners() {
  // Toggle switch event listener
  toggleSwitch.addEventListener('change', async function() {
    const isEnabled = this.checked;
    const volumeBoost = gainInput.value;
    
    // Get site key for per-site storage
      const tab = await getActiveTab();
      const siteKey = (tab && tab.url) ? siteKeyFromUrl(tab.url) : '__global__';
    
    // Update status display
    statusDisplay.textContent = isEnabled ? 'ON' : 'OFF';
    statusDisplay.className = isEnabled ? 'status-display status-on' : 'status-display status-off';
    
    // Convert slider value to gain for storage and persist
    const gain = toGain(volumeBoost);
    await setStorage({
      isEnabled: isEnabled,
      [siteKey]: gain, // Store gain by site key
      bassLevel: bassControl.value,
      trebleLevel: trebleControl.value
    });

    await updateExtensionState(isEnabled, volumeBoost, bassControl.value, trebleControl.value);
  });

  // Range slider event listener
  gainInput.addEventListener("input", async () => {
    gainLabel.textContent = gainInput.value + "%";
    boostDisplay.textContent = `${gainInput.value}%`;
    
    const tab = await getActiveTab();
    const siteKey = (tab && tab.url) ? siteKeyFromUrl(tab.url) : '__global__';

    const isEnabled = toggleSwitch.checked;
    const gain = toGain(gainInput.value);

    await setStorage({
      [siteKey]: gain,
      isEnabled: isEnabled,
      bassLevel: bassControl.value,
      trebleLevel: trebleControl.value
    });

    await updateExtensionState(isEnabled, gainInput.value, bassControl.value, trebleControl.value);

    if (isEnabled && tab && tab.id) {
      await sendMessageToTab(tab.id, {
        action: "updateVolume",
        volume: gain,
        bass: bassControl.value,
        treble: trebleControl.value
      });
    }
  });

  // Bass control event listener
  bassControl.addEventListener("input", async () => {
    bassValue.textContent = bassControl.value + "dB";

    const tab = await getActiveTab();
    const siteKey = (tab && tab.url) ? siteKeyFromUrl(tab.url) : '__global__';

    const isEnabled = toggleSwitch.checked;
    const gain = toGain(gainInput.value);

    await setStorage({
      [siteKey]: gain,
      isEnabled: isEnabled,
      bassLevel: bassControl.value,
      trebleLevel: trebleControl.value
    });

    await updateExtensionState(isEnabled, gainInput.value, bassControl.value, trebleControl.value);

    if (isEnabled && tab && tab.id) {
      await sendMessageToTab(tab.id, {
        action: "updateVolume",
        volume: gain,
        bass: bassControl.value,
        treble: trebleControl.value
      });
    }
  });

  // Treble control event listener
  trebleControl.addEventListener("input", async () => {
    trebleValue.textContent = trebleControl.value + "dB";

    const tab = await getActiveTab();
    const siteKey = (tab && tab.url) ? siteKeyFromUrl(tab.url) : '__global__';

    const isEnabled = toggleSwitch.checked;
    const gain = toGain(gainInput.value);

    await setStorage({
      [siteKey]: gain,
      isEnabled: isEnabled,
      bassLevel: bassControl.value,
      trebleLevel: trebleControl.value
    });

    await updateExtensionState(isEnabled, gainInput.value, bassControl.value, trebleControl.value);

    if (isEnabled && tab && tab.id) {
      await sendMessageToTab(tab.id, {
        action: "updateVolume",
        volume: gain,
        bass: bassControl.value,
        treble: trebleControl.value
      });
    }
  });
}


// Function to update extension state
async function updateExtensionState(isEnabled, volumeBoost, bassLevel, trebleLevel) {
  // Send message to content script to enable/disable volume boost
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  try {
    await sendMessageToTab(tab.id, {
      action: isEnabled ? "enableBoost" : "disableBoost",
      volume: toGain(volumeBoost),
      bass: bassLevel,
      treble: trebleLevel
    });
  } catch (e) {
    // ignore
  }
}


