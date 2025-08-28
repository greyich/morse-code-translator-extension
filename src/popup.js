import { textToMorse, morseToText } from './morse/convert.js';
import { MAP_FWD as ITU_FWD } from './morse/mapping_itu.js';
import { MAP_FWD as ENG_FWD } from './morse/mapping_eng.js';
import { MAP_FWD as RUS_FWD } from './morse/mapping_ru.js';
import { normalizeMorse } from './morse/normalize.js';
import { morseToSegments, estimateDurationMs, scheduleOnline } from './audio/morseAudio.js';
import { renderWavFromSegments } from './audio/wav.js';
import { attachStuchalkaButton } from './key/stuchalka.js';
import { loadUnitMs, saveUnitMs, formatTimingHint } from './state/settings.js';

function debounce(fn, delayMs) {
  let timer;
  return function(...args) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(this, args), delayMs);
  };
}

function liveNormalizeText(value, alphabet) {
  let s = value.toUpperCase();
  if (alphabet === 'RUS') s = s.replaceAll('Ё', 'Е');
  s = s.replace(/\s{2,}/g, ' ');
  return s;
}

function hasCyrillic(s) {
  return /[\u0400-\u04FF]/.test(s);
}
function hasLatin(s) {
  return /[A-Za-z]/.test(s);
}

function getStoredAlphabet() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ alphabet: 'ITU' }, (res) => {
      resolve(res.alphabet);
    });
  });
}
function setStoredAlphabet(alphabet) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ alphabet }, () => resolve());
  });
}

function getMaps(alphabet) {
  if (alphabet === 'RUS') return RUS_FWD;
  if (alphabet === 'ENG' || alphabet === 'ITU') return ENG_FWD;
  return ENG_FWD;
}

const textInput = document.getElementById('textInput');
const morseInput = document.getElementById('morseInput');
const alphabetSelect = document.getElementById('alphabetSelect');
const infoButton = document.getElementById('infoButton');
const textPasteBtn = document.getElementById('textPaste');
const textCopyBtn = document.getElementById('textCopy');
const textClearBtn = document.getElementById('textClear');
const morsePasteBtn = document.getElementById('morsePaste');
const morseCopyBtn = document.getElementById('morseCopy');
// no central clear button
const morsePlayBtn = document.getElementById('morsePlay');
const morseSaveBtn = document.getElementById('morseSave');
const autoSwitchMsg = document.getElementById('autoSwitchMsg');
const stuchalkaBtn = document.getElementById('stuchalkaBtn');

const stuchalkaToggle = document.getElementById('stuchalkaToggle');

// Speed control elements
const unitRange = document.getElementById('unitRange');
const unitNumber = document.getElementById('unitNumber');
const speedHint = document.getElementById('speedHint');
const resetSpeed = document.getElementById('resetSpeed');

const debugInfo = document.getElementById('debugInfo');

const infoModal = document.getElementById('infoModal');
const modalClose = document.getElementById('modalClose');
const modalRules = document.getElementById('modalRules');
const modalTable = document.getElementById('modalTable');

let lastEdited = 'text';
let isSyncing = false;
let currentAlphabet = 'ITU';
let didAutoSwitchFromText = false; // lock after first decision per text session
let audioPlayer = null;
let stuchalka = null;
let currentUnitMs = 100; // Current unit duration
let stuchalkaMode = false; // Stuchalka mode state

function maybeAutoSwitchFromFirstLetters() {
  // Only when editing text, only once per session, and never from Morse input
  if (lastEdited !== 'text') return;
  if (didAutoSwitchFromText) return;
  const val = textInput.value;
  if (!val) return;
  // find first letter char
  const m = val.match(/[A-Za-z\u0400-\u04FF]/);
  if (!m) return;
  const ch = m[0];
  if (currentAlphabet !== 'RUS' && /[\u0400-\u04FF]/.test(ch)) {
    currentAlphabet = 'RUS';
    alphabetSelect.value = 'RUS';
    setStoredAlphabet('RUS');
    didAutoSwitchFromText = true;
    showAutoSwitchMsg('Switched to RUS based on first Cyrillic letter');
  } else if (currentAlphabet === 'RUS' && /[A-Za-z]/.test(ch)) {
    currentAlphabet = 'ITU';
    alphabetSelect.value = 'ITU';
    setStoredAlphabet('ITU');
    didAutoSwitchFromText = true;
    showAutoSwitchMsg('Switched to ITU based on first Latin letter');
  }
}

function showAutoSwitchMsg(text) {
  // Auto-switch messages disabled
}

function hasValidMorse(morse) {
  return /[.-]/.test(morse);
}

function updateAudioButtons() {
  const hasMorse = hasValidMorse(morseInput.value);
  const isPlaying = audioPlayer && audioPlayer.isPlaying();
  
  morsePlayBtn.disabled = !hasMorse;
  morseSaveBtn.disabled = !hasMorse;
  
  // Disable speed controls during playback
  setSpeedControlsEnabled(!isPlaying && !stuchalkaMode);
  
  if (isPlaying) {
    morsePlayBtn.textContent = '⏹';
    morsePlayBtn.classList.add('playing');
    morsePlayBtn.title = 'Stop audio';
  } else {
    morsePlayBtn.textContent = '▶';
    morsePlayBtn.classList.remove('playing');
    morsePlayBtn.title = 'Play audio';
  }
}

function stopAudio() {
  if (audioPlayer) {
    audioPlayer.stop();
    audioPlayer = null;
    updateAudioButtons();
  }
  // Also stop Stuchalka audio
  if (stuchalka) {
    stuchalka.deactivate();
  }
  
  // Re-enable speed controls if not in Stuchalka mode
  if (!stuchalkaMode) {
    setSpeedControlsEnabled(true);
  }
}

function updateMorseFromText() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const out = textToMorse(textInput.value, { alphabet: currentAlphabet });
    morseInput.value = out;
    updateAudioButtons();
  } finally {
    isSyncing = false;
  }
}

function updateTextFromMorse() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const out = morseToText(morseInput.value, { alphabet: currentAlphabet });
    textInput.value = out;
  } finally {
    isSyncing = false;
  }
}

// Initialize speed control
function initSpeedControl() {
  if (!unitRange || !unitNumber || !speedHint) return;
  
  // Load saved unit duration
  loadUnitMs().then((unitMs) => {
    currentUnitMs = unitMs;
    updateSpeedControls(unitMs);
  });
  
  // Sync range and number inputs
  const syncInputs = (value) => {
    unitRange.value = value.toString();
    unitNumber.value = value.toString();
    speedHint.textContent = formatTimingHint(value);
  };
  
  // Handle range input changes
  unitRange.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    syncInputs(value);
    updateUnitMs(value);
  });
  
  // Handle number input changes
  unitNumber.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    syncInputs(value);
    updateUnitMs(value);
  });
  
  // Handle reset button
  if (resetSpeed) {
    resetSpeed.addEventListener('click', () => {
      const defaultValue = 100; // Default unit duration
      syncInputs(defaultValue);
      updateUnitMs(defaultValue);
    });
  }
  

}

function updateSpeedControls(unitMs) {
  if (!unitRange || !unitNumber || !speedHint) return;
  
  unitRange.value = unitMs.toString();
  unitNumber.value = unitMs.toString();
  speedHint.textContent = formatTimingHint(unitMs);
}

// Enable/disable speed controls
function setSpeedControlsEnabled(enabled) {
  if (unitRange) {
    unitRange.disabled = !enabled;
  }
  if (unitNumber) {
    unitNumber.disabled = !enabled;
  }
  if (resetSpeed) {
    resetSpeed.disabled = !enabled;
  }
}

function updateUnitMs(unitMs) {
  currentUnitMs = unitMs;
  saveUnitMs(unitMs);
  
  // Update Stuchalka if it exists
  if (stuchalka) {
    stuchalka.destroy();
    stuchalka = null; // Clear the reference
    initStuchalka();
  }
}

// Toggle Stuchalka mode
function toggleStuchalkaMode(enabled) {
  stuchalkaMode = enabled;
  
  // Update UI
  stuchalkaBtn.disabled = !enabled;
  textInput.disabled = enabled;
  morseInput.disabled = enabled;
  
  // Disable speed controls in Stuchalka mode
  setSpeedControlsEnabled(!enabled);
  
  // Update button titles
  if (enabled) {
    stuchalkaBtn.title = 'Hold to send morse';
    textInput.title = 'Text input disabled in Telegraph Key mode';
    morseInput.title = 'Morse input disabled in Telegraph Key mode';
  } else {
    stuchalkaBtn.title = 'Hold to send morse (enable Telegraph Key mode first)';
    textInput.title = 'Enter text to convert to Morse code';
    morseInput.title = 'Enter Morse code to convert to text';
  }
  
  // Activate/deactivate Stuchalka
  if (stuchalka) {
    if (enabled) {
      stuchalka.activate();
    } else {
      stuchalka.deactivate();
    }
  }
}

// Initialize Stuchalka
function initStuchalka() {
  if (!stuchalkaBtn) return;
  
  stuchalka = attachStuchalkaButton(stuchalkaBtn, {
    onSymbol: (symbol) => {
      // Insert symbol at cursor position
      const cursorPos = morseInput.selectionStart || 0;
      const currentValue = morseInput.value;
      
      // Insert symbol at cursor position
      const newValue = currentValue.slice(0, cursorPos) + symbol + currentValue.slice(cursorPos);
      morseInput.value = newValue;
      
      // Update cursor position
      const newCursorPos = cursorPos + symbol.length;
      morseInput.setSelectionRange(newCursorPos, newCursorPos);
      
      // Update text field
      lastEdited = 'morse';
      updateTextFromMorse();
      updateAudioButtons();
      
      // Focus back to morse input
      morseInput.focus();
      
      // Debug info
      if (debugInfo) {
        debugInfo.textContent = `Symbol added: "${symbol}" at ${new Date().toLocaleTimeString()}`;
      }
    },
    onAudioStart: () => {
      stuchalkaBtn?.classList.add('sending');
    },
    onAudioStop: () => {
      stuchalkaBtn?.classList.remove('sending');
    },
    onPressStart: () => {
      // Debug info
      if (debugInfo) {
        debugInfo.textContent = `Press started at ${new Date().toLocaleTimeString()}`;
      }
    },
    onPressEnd: (symbol) => {
      // Debug info
      if (debugInfo) {
        debugInfo.textContent = `Press ended: "${symbol}" at ${new Date().toLocaleTimeString()}`;
      }
    },
    onGapDetected: (symbol) => {
      // Debug info
      if (debugInfo) {
        debugInfo.textContent = `Gap detected: "${symbol}" at ${new Date().toLocaleTimeString()}`;
      }
    }
  }, {
    unitMs: currentUnitMs
  });
  
  // Don't activate automatically - wait for toggle
}



const debouncedText = debounce(updateMorseFromText, 40);
const debouncedMorse = debounce(updateTextFromMorse, 40);

textInput.addEventListener('input', () => {
  maybeAutoSwitchFromFirstLetters();
  const norm = liveNormalizeText(textInput.value, currentAlphabet);
  if (norm !== textInput.value) {
    const pos = textInput.selectionStart;
    textInput.value = norm;
    if (typeof pos === 'number') {
      const left = liveNormalizeText(textInput.value.slice(0, pos), currentAlphabet).length;
      textInput.selectionStart = textInput.selectionEnd = Math.min(left, textInput.value.length);
    }
  }
  lastEdited = 'text';
  debouncedText();
});

morseInput.addEventListener('input', () => {
  const replaced = morseInput.value
    .replace(/[·•]/g, '.')
    .replace(/[–—]/g, '-');
  if (replaced !== morseInput.value) {
    const pos = morseInput.selectionStart;
    morseInput.value = replaced;
    if (typeof pos === 'number') {
      morseInput.selectionStart = morseInput.selectionEnd = Math.min(pos, morseInput.value.length);
    }
  }
  lastEdited = 'morse';
  debouncedMorse();
  updateAudioButtons();
});

alphabetSelect.addEventListener('change', async () => {
  const a = alphabetSelect.value || 'ITU';
  currentAlphabet = a;
  await setStoredAlphabet(a);
  // manual change resets session auto-switch lock
  didAutoSwitchFromText = false;
  if (lastEdited === 'text') {
    const norm = liveNormalizeText(textInput.value, currentAlphabet);
    if (norm !== textInput.value) textInput.value = norm;
    updateMorseFromText();
  } else {
    const norm = normalizeMorse(morseInput.value);
    if (norm !== morseInput.value) morseInput.value = norm;
    updateTextFromMorse();
  }
  if (!infoModal.hasAttribute('hidden')) renderInfoModal();
});

textPasteBtn.addEventListener('click', async () => {
  try {
    const clip = await navigator.clipboard.readText();
    // Detect on first letters in pasted content if not locked yet
    if (!didAutoSwitchFromText) {
      const m = clip.match(/[A-Za-z\u0400-\u04FF]/);
      if (m) {
        if (currentAlphabet !== 'RUS' && /[\u0400-\u04FF]/.test(m[0])) {
          currentAlphabet = 'RUS';
          alphabetSelect.value = 'RUS';
          setStoredAlphabet('RUS');
          didAutoSwitchFromText = true;
          showAutoSwitchMsg('Switched to RUS based on first Cyrillic letter');
          // Update info modal if it's open
          if (!infoModal.hasAttribute('hidden')) renderInfoModal();
        } else if (currentAlphabet === 'RUS' && /[A-Za-z]/.test(m[0])) {
          currentAlphabet = 'ITU';
          alphabetSelect.value = 'ITU';
          setStoredAlphabet('ITU');
          didAutoSwitchFromText = true;
          showAutoSwitchMsg('Switched to ITU based on first Latin letter');
          // Update info modal if it's open
          if (!infoModal.hasAttribute('hidden')) renderInfoModal();
        }
      }
    }
    const norm = liveNormalizeText(clip, currentAlphabet);
    textInput.value = norm;
    lastEdited = 'text';
    updateMorseFromText();
  } catch (e) {
    console.error('Paste failed', e);
  }
});

textCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(textInput.value);
  } catch (e) {
    console.error('Copy failed', e);
  }
});

textClearBtn.addEventListener('click', () => {
  textInput.value = '';
  morseInput.value = '';
  lastEdited = 'text';
  didAutoSwitchFromText = false;
  updateMorseFromText();
  updateAudioButtons();
});

morsePasteBtn.addEventListener('click', async () => {
  try {
    const clip = await navigator.clipboard.readText();
    const norm = normalizeMorse(clip);
    morseInput.value = norm;
    lastEdited = 'morse';
    updateTextFromMorse();
  } catch (e) {
    console.error('Paste failed', e);
  }
});

morseCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(morseInput.value);
  } catch (e) {
    console.error('Copy failed', e);
  }
});


morsePlayBtn.addEventListener('click', () => {
  const morse = morseInput.value;
  if (!hasValidMorse(morse)) return;
  
  if (audioPlayer && audioPlayer.isPlaying()) {
    stopAudio();
    return;
  }
  
  const segments = morseToSegments(morse, { unitMs: currentUnitMs });
  const duration = estimateDurationMs(segments);
  
  // Debug: log duration
  console.log(`Morse duration: ${duration}ms (${(duration/1000).toFixed(3)}s)`);
  console.log(`5 minute limit: ${5 * 60 * 1000}ms`);
  console.log(`Exceeds limit: ${duration > 5 * 60 * 1000}`);
  
  // Check 10 minute limit (increased from 5)
  if (duration > 10 * 60 * 1000) {
    morsePlayBtn.title = 'Audio too long (> 10 min)';
    morsePlayBtn.disabled = true;
    morseSaveBtn.title = 'Audio too long (> 10 min)';
    morseSaveBtn.disabled = true;
    return;
  }
  
  audioPlayer = scheduleOnline(segments, { 
    unitMs: currentUnitMs,
    onComplete: () => {
      audioPlayer = null;
      updateAudioButtons();
    }
  });
  audioPlayer.start();
  updateAudioButtons();
});

morseSaveBtn.addEventListener('click', async () => {
  const morse = morseInput.value;
  if (!hasValidMorse(morse)) return;
  
  const segments = morseToSegments(morse, { unitMs: currentUnitMs });
  const duration = estimateDurationMs(segments);
  
  // Debug: log duration for save
  console.log(`Save - Morse duration: ${duration}ms (${(duration/1000).toFixed(3)}s)`);
  console.log(`Save - 5 minute limit: ${5 * 60 * 1000}ms`);
  console.log(`Save - Exceeds limit: ${duration > 5 * 60 * 1000}`);
  
  // Check 10 minute limit (increased from 5)
  if (duration > 10 * 60 * 1000) {
    morseSaveBtn.title = 'Audio too long (> 10 min)';
    morseSaveBtn.disabled = true;
    return;
  }
  
  try {
    const blob = await renderWavFromSegments(segments, { unitMs: currentUnitMs });
    
    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') + '-' +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    
    const filename = `morse-${timestamp}.wav`;
    
    // Download the file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to save WAV file:', error);
  }
});

infoButton.addEventListener('click', () => {
  renderInfoModal();
  infoModal.removeAttribute('hidden');
  modalClose.focus();
  
  // Update modal title to show current alphabet
  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) {
    const alphabetNames = {
      'ITU': 'International (ITU)',
      'ENG': 'English',
      'RUS': 'Russian (Cyrillic)'
    };
    const alphabetName = alphabetNames[currentAlphabet] || currentAlphabet;
    modalTitle.textContent = `Morse Code - ${alphabetName}`;
  }
});

modalClose.addEventListener('click', () => {
  infoModal.setAttribute('hidden', '');
  infoButton.focus();
});

infoModal.addEventListener('click', (ev) => {
  const target = ev.target;
  if (target && target.getAttribute('data-close') === 'true') {
    infoModal.setAttribute('hidden', '');
    infoButton.focus();
  }
});

function renderInfoModal() {
  modalRules.innerHTML = '';
  const rules = document.createElement('div');
  
  // Get alphabet name for display
  const alphabetNames = {
    'ITU': 'International (ITU)',
    'ENG': 'English',
    'RUS': 'Russian (Cyrillic)'
  };
  const alphabetName = alphabetNames[currentAlphabet] || currentAlphabet;
  
  rules.innerHTML = [
    `<strong>Morse Code Reference - ${alphabetName} Alphabet:</strong>`,
    'Letters are separated by a single space.',
    'Words are separated by <code>/</code> (you can also type <code>\\</code>).',
    'Entering an unknown character or sequence shows <code>□</code>.'
  ].map((t) => `<div>${t}</div>`).join('');
  modalRules.appendChild(rules);

  modalTable.innerHTML = '';
  const fwd = getMaps(currentAlphabet);
  const section = document.createElement('div');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Char</th><th>Morse</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  const entries = Object.entries(fwd);
  const letters = entries.filter(([k]) => /[A-ZА-Я]/.test(k));
  const digits = entries.filter(([k]) => /[0-9]/.test(k));
  const punct = entries.filter(([k]) => !((/[A-ZА-Я]/.test(k) || /[0-9]/.test(k))));

  const collator = new Intl.Collator(currentAlphabet === 'RUS' ? 'ru' : 'en', { sensitivity: 'base' });
  letters.sort(([a], [b]) => collator.compare(a, b));
  digits.sort(([a], [b]) => a.localeCompare(b));
  punct.sort(([a], [b]) => a.localeCompare(b));

  for (const [ch, code] of [...letters, ...digits, ...punct]) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = ch;
    const td2 = document.createElement('td');
    td2.textContent = code;
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  section.appendChild(table);
  modalTable.appendChild(section);
}

// Handle popup visibility changes to stop audio
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAudio();
  }
});

// Handle Stuchalka toggle
stuchalkaToggle.addEventListener('change', (e) => {
  const enabled = e.target.checked;
  toggleStuchalkaMode(enabled);
});

// Handle beforeunload to stop audio
window.addEventListener('beforeunload', () => {
  stopAudio();
  if (stuchalka) {
    stuchalka.destroy();
  }
});

(async function init() {
  currentAlphabet = await getStoredAlphabet();
  alphabetSelect.value = currentAlphabet;
  didAutoSwitchFromText = false;
  updateMorseFromText();
  updateAudioButtons();
  initSpeedControl();
  initStuchalka();
  
  // Initialize Stuchalka mode state
  toggleStuchalkaMode(false);
})();
