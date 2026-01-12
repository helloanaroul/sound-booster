// Sound Booster Content Script
console.log("Sound Booster content script loaded");

let audioContext;
let masterGainNode;
let bassFilter;
let trebleFilter;
let isEnabled = false;
let volumeMultiplier = 1.0;
let bassLevel = 0;
let trebleLevel = 0;

// Audio graph nodes
let nodes = {};

// Listen for messages from popup
// Use a tolerant message listener: supports both `type` and `action` fields.
(browser || chrome).runtime.onMessage.addListener(function(request, sender, sendResponse) {
  const msg = request || {};
  const cmd = msg.type || msg.action;
  switch (cmd) {
    case 'SOUND_BOOSTER_SET':
      if (msg.gain !== undefined) {
        isEnabled = true;
        volumeMultiplier = msg.gain;
        setupAudioProcessing();
      }
      break;
    case 'enableBoost':
      isEnabled = true;
      volumeMultiplier = msg.volume || 1.0;
      bassLevel = msg.bass || 0;
      trebleLevel = msg.treble || 0;
      setupAudioProcessing();
      break;
    case 'disableBoost':
      isEnabled = false;
      if (masterGainNode) {
        masterGainNode.gain.value = 1.0;
      }
      // Disconnect any connected media element nodes
      document.querySelectorAll('audio, video').forEach(element => {
        if (element.audioNode) {
          try { element.audioNode.disconnect(); } catch (e) {}
          element.audioNode = null;
        }
      });
      break;
    case 'updateVolume':
      volumeMultiplier = msg.volume || 1.0;
      bassLevel = msg.bass || 0;
      trebleLevel = msg.treble || 0;
      if (isEnabled) updateAudioSettings(volumeMultiplier, bassLevel, trebleLevel);
      break;
    default:
      // ignore unknown messages
      break;
  }
});

// Setup audio processing when enabled
function setupAudioProcessing() {
  if (!isEnabled) return;
  
  try {
    // Create audio context if it doesn't exist
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Create the audio processing chain: media source -> bass filter -> treble filter -> master gain -> destination
    if (!masterGainNode) {
      masterGainNode = audioContext.createGain();
    }
    
    if (!bassFilter) {
      bassFilter = audioContext.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200; // Frequency for bass control
      bassFilter.gain.value = bassLevel;
    }
    
    if (!trebleFilter) {
      trebleFilter = audioContext.createBiquadFilter();
      trebleFilter.type = 'highshelf';
      trebleFilter.frequency.value = 2000; // Frequency for treble control
      trebleFilter.gain.value = trebleLevel;
    }
    
    // Connect the audio processing chain
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(masterGainNode);
    masterGainNode.connect(audioContext.destination);
    
    // Set the master gain value
    masterGainNode.gain.value = volumeMultiplier;
    
    // Update filters
    updateFilters(bassLevel, trebleLevel);
    
    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Process all possible audio sources on the page
    processAllAudioSources();
    
    // Watch for new audio/video elements
    watchForNewMediaElements();
    
  } catch (error) {
    console.error('Error setting up audio processing:', error);
  }
}

// Update audio settings
function updateAudioSettings(newVolumeMultiplier, newBassLevel, newTrebleLevel) {
  volumeMultiplier = newVolumeMultiplier;
  bassLevel = newBassLevel;
  trebleLevel = newTrebleLevel;
  
  if (masterGainNode) {
    masterGainNode.gain.value = volumeMultiplier;
    updateFilters(bassLevel, trebleLevel);
    updateVolumeForAllMedia();
  }
}

// Update filter settings
function updateFilters(bass, treble) {
  if (bassFilter) {
    bassFilter.gain.value = bass;
  }
  if (trebleFilter) {
    trebleFilter.gain.value = treble;
  }
}

// Process existing audio/video elements
function processExistingAudioElements() {
  const mediaElements = document.querySelectorAll('audio, video');
  mediaElements.forEach(element => {
    // Only process elements that are not already connected
    if (!element.audioNode) {
      connectToGainNode(element);
    }
  });
}

// Process all possible audio sources in the tab
function processAllAudioSources() {
  // Process audio and video elements
  processExistingAudioElements();
  
  // Process iframe elements that might contain audio
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        const iframeMediaElements = iframeDoc.querySelectorAll('audio, video');
        iframeMediaElements.forEach(element => {
          if (!element.audioNode) {
            connectToGainNode(element);
          }
        });
      }
    } catch (e) {
      // Cross-origin iframe, skip processing
      console.debug('Could not access iframe content:', e.message);
    }
  });
}

// Watch for new audio/video elements
function watchForNewMediaElements() {
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
            connectToGainNode(node);
          }
          // Check for audio/video elements within the added node
          const mediaElements = node.querySelectorAll && node.querySelectorAll('audio, video');
          if (mediaElements) {
            mediaElements.forEach(element => connectToGainNode(element));
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Connect media element to the audio processing chain
function connectToGainNode(mediaElement) {
  if (!isEnabled || !audioContext || !masterGainNode) return;
  
  try {
    // Disconnect if already connected
    if (mediaElement.audioNode) {
      mediaElement.audioNode.disconnect();
    }
    
    // Create media element source
    const source = audioContext.createMediaElementSource(mediaElement);
    
    // Connect source -> bass filter -> treble filter -> master gain -> destination
    source.connect(bassFilter);
    
    // Store reference to the source node
    mediaElement.audioNode = source;
    
    // Don't modify the media element's volume directly when using Web Audio API
    // The volume is controlled through the master gain node in the audio processing chain
    
  } catch (error) {
    console.warn('Could not connect media element to audio processing chain:', error);
  }
}

// Update volume for all connected media elements
function updateVolumeForAllMedia() {
  if (!masterGainNode) return;
  
  // Update the master gain node value
  masterGainNode.gain.value = volumeMultiplier;
  
  // We rely solely on the Web Audio API chain for volume control
  // Direct media element volume changes are not needed when using the audio processing chain
}

// Cleanup audio processing
function cleanupAudioProcessing() {
  try {
    if (masterGainNode) {
      masterGainNode.disconnect();
      masterGainNode = null;
    }
    if (bassFilter) {
      bassFilter.disconnect();
      bassFilter = null;
    }
    if (trebleFilter) {
      trebleFilter.disconnect();
      trebleFilter = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    // Disconnect all stored audio nodes
    const mediaElements = document.querySelectorAll('audio, video');
    mediaElements.forEach(element => {
      if (element.audioNode) {
        element.audioNode.disconnect();
        element.audioNode = null;
      }
    });
    
  } catch (error) {
    console.error('Error cleaning up audio processing:', error);
  }
}

// Initialize with default settings
(browser || chrome).storage.local.get(['isEnabled', 'volumeBoost', 'bassLevel', 'trebleLevel'], function(result) {
  if (result.isEnabled) {
    isEnabled = result.isEnabled;
    volumeMultiplier = Math.min(Math.max((result.volumeBoost || 100) / 100, 0), 10);
    bassLevel = result.bassLevel || 0;
    trebleLevel = result.trebleLevel || 0;
    setupAudioProcessing();
  }
});
