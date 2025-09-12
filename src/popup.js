import { textToMorse, morseToText } from './morse/convert.js';
import { MAP_FWD as ITU_FWD } from './morse/mapping_itu.js';
import { MAP_FWD as ENG_FWD } from './morse/mapping_eng.js';
import { MAP_FWD as RUS_FWD } from './morse/mapping_ru.js';
import { MAP_FWD as DEU_FWD } from './morse/mapping_de.js';
import { MAP_FWD as FRA_FWD } from './morse/mapping_fr.js';
import { MAP_FWD as ESP_FWD } from './morse/mapping_es.js';
import { MAP_FWD as ITA_FWD } from './morse/mapping_it.js';
import { MAP_FWD as SWE_FWD } from './morse/mapping_swe.js';
import { MAP_FWD as DAN_FWD } from './morse/mapping_dan.js';
import { MAP_FWD as NOR_FWD } from './morse/mapping_nor.js';
import { MAP_FWD as FIN_FWD } from './morse/mapping_fin.js';
import { MAP_FWD as POL_FWD } from './morse/mapping_pl.js';
import { MAP_FWD as BEL_FWD } from './morse/mapping_bel.js';
import { MAP_FWD as GRE_FWD } from './morse/mapping_gre.js';
import { MAP_FWD as AR_FWD } from './morse/mapping_ar.js';
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
  let s = value;
  const shouldUpper = alphabet === 'ENG' || alphabet === 'ITU' || alphabet === 'RUS' || alphabet === 'DEU' || alphabet === 'GRE';
  if (alphabet === 'AR') {
    s = s.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
    s = s
      .replace(/[\u0622\u0623\u0625]/g, '\u0627')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0624/g, '\u0648')
      .replace(/\u0626/g, '\u064A');
  }
  if (shouldUpper) s = s.toUpperCase();
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
      const allowed = new Set(['ITU', 'ENG', 'RUS', 'DEU', 'FRA', 'ESP', 'ITA', 'SWE', 'DAN', 'NOR', 'FIN', 'POL', 'BEL', 'GRE', 'AR']);
      let value = res.alphabet || 'ITU';
      if (!allowed.has(value)) {
        value = 'ITU';
        chrome.storage.local.set({ alphabet: value }, () => resolve(value));
      } else {
        resolve(value);
      }
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
  if (alphabet === 'BEL') return BEL_FWD;
  if (alphabet === 'DEU') return DEU_FWD;
  if (alphabet === 'FRA') return FRA_FWD;
  if (alphabet === 'ESP') return ESP_FWD;
  if (alphabet === 'ITA') return ITA_FWD;
  if (alphabet === 'SWE') return SWE_FWD;
  if (alphabet === 'DAN') return DAN_FWD;
  if (alphabet === 'NOR') return NOR_FWD;
  if (alphabet === 'FIN') return FIN_FWD;
  if (alphabet === 'POL') return POL_FWD;
  if (alphabet === 'AR') return AR_FWD;
  if (alphabet === 'GRE') return GRE_FWD;
  if (alphabet === 'ENG' || alphabet === 'ITU') return ENG_FWD;
  return ENG_FWD;
}

const textInput = document.getElementById('textInput');
const morseInput = document.getElementById('morseInput');
const alphabetSelect = document.getElementById('alphabetSelect');
const alphabetButton = document.getElementById('alphabetButton');
const alphabetList = document.getElementById('alphabetList');
const alphabetContainer = document.getElementById('alphabet');
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
    const out = textToMorse(textInput.value, { alphabet: currentAlphabet, unknownChar: currentAlphabet === 'AR' ? '' : '□' });
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
      
      // no debug logging
    },
    onAudioStart: () => { stuchalkaBtn?.classList.add('sending'); },
    onAudioStop: () => { stuchalkaBtn?.classList.remove('sending'); },
    onPressStart: () => {},
    onPressEnd: (_symbol) => {},
    onGapDetected: (_symbol) => {}
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
  setAlphabetUI(a);
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

// ----- Custom dropdown wiring -----
function setAlphabetUI(value) {
  const labels = { ITU: 'International', ENG: 'English', DEU: 'German', FRA: 'French', ESP: 'Spanish', ITA: 'Italian', SWE: 'Swedish', DAN: 'Danish', NOR: 'Norwegian', FIN: 'Finnish', POL: 'Polish', BEL: 'Belarusian', AR: 'Arabic', GRE: 'Greek', RUS: 'Russian' };
  if (alphabetButton) alphabetButton.textContent = labels[value] || 'International';
  if (alphabetList) {
    const items = Array.from(alphabetList.querySelectorAll('li'));
    for (const li of items) {
      if (!li.hasAttribute('tabindex')) li.setAttribute('tabindex', '-1');
      const isMatch = li.getAttribute('data-value') === value;
      if (isMatch) li.setAttribute('aria-selected', 'true');
      else li.removeAttribute('aria-selected');
    }
  }
  if (alphabetSelect) alphabetSelect.value = value;
}

if (alphabetButton && alphabetList) {
  function openList() {
    alphabetList.removeAttribute('hidden');
    alphabetContainer && alphabetContainer.classList.add('open');
    alphabetButton.setAttribute('aria-expanded', 'true');
    const selected = alphabetList.querySelector('[aria-selected="true"]');
    (selected || alphabetList.firstElementChild)?.focus?.();
  }
  function closeList() {
    alphabetList.setAttribute('hidden', '');
    alphabetContainer && alphabetContainer.classList.remove('open');
    alphabetButton.setAttribute('aria-expanded', 'false');
    alphabetButton.focus();
  }
  function choose(value) {
    if (alphabetSelect && alphabetSelect.value !== value) {
      alphabetSelect.value = value;
      const evt = new Event('change', { bubbles: true });
      alphabetSelect.dispatchEvent(evt);
    } else {
      setAlphabetUI(value);
    }
    closeList();
  }

  alphabetButton.addEventListener('click', () => {
    if (alphabetList.hasAttribute('hidden')) openList(); else closeList();
  });
  alphabetButton.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList();
    }
  });
  alphabetList.addEventListener('keydown', (e) => {
    const items = Array.from(alphabetList.querySelectorAll('li'));
    const active = document.activeElement;
    let idx = items.indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[Math.min(idx + 1, items.length - 1)] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[Math.max(idx - 1, 0)] || items[0]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeList(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const el = document.activeElement;
      const v = el && el.getAttribute ? el.getAttribute('data-value') : null;
      if (v) choose(v);
    }
  });
  alphabetList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const v = li.getAttribute('data-value');
    if (v) choose(v);
  });
  document.addEventListener('click', (e) => {
    if (!alphabetButton || !alphabetList) return;
    const t = e.target;
    if (!alphabetButton.contains(t) && !alphabetList.contains(t)) {
      if (!alphabetList.hasAttribute('hidden')) closeList();
    }
  });
}

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
      'FRA': 'French',
      'ESP': 'Spanish',
      'ITA': 'Italian',
      'SWE': 'Swedish',
      'DAN': 'Danish',
      'NOR': 'Norwegian',
      'FIN': 'Finnish',
      'POL': 'Polish',
      'BEL': 'Belarusian',
      'DEU': 'German',
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
    'FRA': 'French',
    'ESP': 'Spanish',
    'ITA': 'Italian',
    'SWE': 'Swedish',
    'DAN': 'Danish',
    'NOR': 'Norwegian',
    'FIN': 'Finnish',
    'POL': 'Polish',
    'GRE': 'Greek',
    'AR': 'Arabic',
    'DEU': 'German',
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
  const collator = new Intl.Collator(
    currentAlphabet === 'RUS' ? 'ru' : (
      currentAlphabet === 'DEU' ? 'de' : (
        currentAlphabet === 'ESP' ? 'es' : (
          currentAlphabet === 'ITA' ? 'it' : (
            currentAlphabet === 'SWE' ? 'sv' : (
              currentAlphabet === 'DAN' ? 'da' : (
                currentAlphabet === 'NOR' ? 'no' : (
                  currentAlphabet === 'FIN' ? 'fi' : (
                    currentAlphabet === 'POL' ? 'pl' : (
                      currentAlphabet === 'GRE' ? 'el' : 'en'
                    )
                  )
                )
              )
            )
          )
        )
      )
    ),
    { sensitivity: 'base' }
  );

  let letters;
  if (currentAlphabet === 'DEU') {
    const base = entries.filter(([k]) => /^[A-Z]$/.test(k));
    base.sort(([a], [b]) => collator.compare(a, b));
    const extraOrder = ['Ä', 'Ö', 'Ü', 'ẞ'];
    const extras = entries.filter(([k]) => extraOrder.includes(k)).sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
    letters = [...base, ...extras];
  } else if (currentAlphabet === 'RUS' || currentAlphabet === 'BEL') {
    letters = entries.filter(([k]) => /[A-ZА-Я]/.test(k)).sort(([a], [b]) => collator.compare(a, b));
    if (currentAlphabet === 'BEL') {
      const extra = entries.find(([k]) => k === 'Ў');
      if (extra) letters = [...letters, extra];
    }
  } else {
    const latinBase = entries.filter(([k]) => /^[A-Z]$/.test(k)).sort(([a], [b]) => collator.compare(a, b));
    letters = (currentAlphabet === 'GRE' || currentAlphabet === 'AR') ? [] : latinBase;
    if (currentAlphabet === 'ESP') {
      const extras = entries.filter(([k]) => k === 'Ñ' || k === 'CH');
      const orderedExtras = [];
      const nTilde = extras.find(([k]) => k === 'Ñ');
      if (nTilde) orderedExtras.push(nTilde);
      const ch = extras.find(([k]) => k === 'CH');
      if (ch) orderedExtras.push(ch);
      letters = [...letters, ...orderedExtras];
    } else if (currentAlphabet === 'ITA') {
      // Append À, È, Ò at the end
      const extraOrder = ['À','È','Ò'];
      const extras = entries
        .filter(([k]) => extraOrder.includes(k))
        .sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'SWE') {
      const extraOrder = ['Å','Ä','Ö'];
      const extras = entries
        .filter(([k]) => extraOrder.includes(k))
        .sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'DAN' || currentAlphabet === 'NOR') {
      const extraOrder = ['Å','Æ','Ø'];
      const extras = entries
        .filter(([k]) => extraOrder.includes(k))
        .sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'FIN') {
      const extraOrder = ['Å','Ä','Ö'];
      const extras = entries
        .filter(([k]) => extraOrder.includes(k))
        .sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'POL') {
      const extraOrder = ['Ł','Ś','Ź','Ż'];
      const extras = entries
        .filter(([k]) => extraOrder.includes(k))
        .sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'GRE') {
      const order = ['Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω'];
      const extras = order.map((k) => [k, fwd[k]]).filter((pair) => pair[1]);
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'AR') {
      const order = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];
      const extras = order.map((k) => [k, fwd[k]]).filter((pair) => pair[1]);
      letters = [...letters, ...extras];
    }
  }

  const isLetter = (ch) => {
    if (currentAlphabet === 'DEU') return /^[A-Z]$/.test(ch) || ['Ä','Ö','Ü','ẞ'].includes(ch);
    if (currentAlphabet === 'BEL') return /[A-ZА-Я]/.test(ch) || ['Ў'].includes(ch);
    if (currentAlphabet === 'ITA') return /^[A-Z]$/.test(ch) || ['À','È','Ò'].includes(ch);
    if (currentAlphabet === 'ESP') return /^[A-Z]$/.test(ch) || ch === 'Ñ' || ch === 'CH';
    if (currentAlphabet === 'SWE') return /^[A-Z]$/.test(ch) || ['Å','Ä','Ö'].includes(ch);
    if (currentAlphabet === 'DAN' || currentAlphabet === 'NOR') return /^[A-Z]$/.test(ch) || ['Å','Æ','Ø'].includes(ch);
    if (currentAlphabet === 'FIN') return /^[A-Z]$/.test(ch) || ['Å','Ä','Ö'].includes(ch);
    if (currentAlphabet === 'POL') return /^[A-Z]$/.test(ch) || ['Ł','Ś','Ź','Ż'].includes(ch);
    if (currentAlphabet === 'GRE') return ['Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω'].includes(ch);
    if (currentAlphabet === 'AR') return ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'].includes(ch);
    if (currentAlphabet === 'RUS') return /[A-ZА-Я]/.test(ch);
    return /^[A-Z]$/.test(ch);
  };

  const digits = entries.filter(([k]) => /[0-9]/.test(k));
  const punct = entries.filter(([k]) => {
    if (/^[0-9]$/.test(k)) return false;
    if (isLetter(k)) return false;
    // For Greek/Arabic, hide Latin A–Z from the punctuation section
    if ((currentAlphabet === 'GRE' || currentAlphabet === 'AR') && /^[A-Z]$/.test(k)) return false;
    return true;
  });
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
  setAlphabetUI(currentAlphabet);
  didAutoSwitchFromText = false;
  updateMorseFromText();
  updateAudioButtons();
  initSpeedControl();
  initStuchalka();
  
  // Initialize Stuchalka mode state
  toggleStuchalkaMode(false);
  initRatingWidget();
})();

// Rating widget (JS version)
function initRatingWidget() {
  const container = document.getElementById('rateWidget');
  if (!container) return;

  const FORM_URL = 'https://forms.gle/eiZuNpoLYL4MdwDy5';
  const STORE_URL = 'https://chromewebstore.google.com/detail/morse-code-translator/omcinjloplaplkbiihnaelepmpammdfm';

  const stars = [];
  const starPath = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

  function createStar(index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rate-star';
    btn.setAttribute('aria-label', `Rate ${index + 1} star${index === 0 ? '' : 's'}`);
    btn.dataset.index = String(index);
    btn.title = 'Rate this extension';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const fill = document.createElementNS(svgNS, 'path');
    fill.setAttribute('d', starPath);
    fill.setAttribute('class', 'star-fill');

    const base = document.createElementNS(svgNS, 'path');
    base.setAttribute('d', starPath);
    base.setAttribute('class', 'star-base');

    svg.appendChild(fill);
    svg.appendChild(base);
    btn.appendChild(svg);
    container.appendChild(btn);

    return { root: btn, fill };
  }

  for (let i = 0; i < 5; i++) stars.push(createStar(i));

  function setFillPercent(starIdx, percent) {
    const star = stars[starIdx];
    if (!star) return;
    const p = Math.max(0, Math.min(100, percent));
    star.fill.style.clipPath = `inset(0 ${100 - p}% 0 0)`;
  }

  function resetAll() {
    for (let i = 0; i < stars.length; i++) setFillPercent(i, 0);
  }

  function handlePointerMove(targetIdx, clientX) {
    for (let i = 0; i < targetIdx; i++) setFillPercent(i, 100);
    const starEl = stars[targetIdx] && stars[targetIdx].root;
    if (!starEl) return;
    const rect = starEl.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const percent = Math.max(0, Math.min(1, frac)) * 100;
    setFillPercent(targetIdx, percent);
    for (let i = targetIdx + 1; i < stars.length; i++) setFillPercent(i, 0);
  }

  stars.forEach((s) => {
    s.root.addEventListener('mousemove', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index || '0', 10);
      handlePointerMove(idx, e.clientX);
    });
    s.root.addEventListener('mouseenter', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index || '0', 10);
      handlePointerMove(idx, e.clientX);
    });
    s.root.addEventListener('mouseleave', () => {
      resetAll();
    });
  });

  container.addEventListener('mouseleave', () => resetAll());

  // Container-level hover to handle gaps between stars
  container.addEventListener('mousemove', (e) => {
    const x = e.clientX;
    // Iterate stars to find relation to cursor
    for (let i = 0; i < stars.length; i++) {
      const rect = stars[i].root.getBoundingClientRect();
      if (x < rect.left) {
        // Cursor is in gap before star i → fill all left stars fully
        for (let j = 0; j < i; j++) setFillPercent(j, 100);
        for (let j = i; j < stars.length; j++) setFillPercent(j, 0);
        return;
      }
      if (x <= rect.right) {
        // Inside star i → partial fill on i and full left ones
        handlePointerMove(i, x);
        return;
      }
    }
    // After the last star → all full
    for (let j = 0; j < stars.length; j++) setFillPercent(j, 100);
  });

  function openUrlForIndex(idx) {
    const url = idx <= 2 ? FORM_URL : STORE_URL;
    try {
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      location.href = url;
    }
  }

  stars.forEach((s) => {
    s.root.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index || '0', 10);
      openUrlForIndex(idx);
    });
    s.root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const idx = parseInt(e.currentTarget.dataset.index || '0', 10);
        openUrlForIndex(idx);
      }
    });
  });
}
