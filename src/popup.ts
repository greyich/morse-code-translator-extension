import { textToMorse, morseToText, type Alphabet } from './morse/convert';
import { MAP_FWD as ITU_FWD } from './morse/mapping_itu';
import { MAP_FWD as ENG_FWD } from './morse/mapping_eng';
import { MAP_FWD as RUS_FWD } from './morse/mapping_ru';
import { MAP_FWD as DEU_FWD } from './morse/mapping_de';
import { MAP_FWD as FRA_FWD } from './morse/mapping_fr';
import { MAP_FWD as ESP_FWD } from './morse/mapping_es';
import { MAP_FWD as ITA_FWD } from './morse/mapping_it';
import { MAP_FWD as DEU_FWD } from './morse/mapping_de';
import { normalizeMorse } from './morse/normalize';
import { morseToSegments, estimateDurationMs, scheduleOnline } from './audio/morseAudio';
import { renderWavFromSegments } from './audio/wav';
import { attachStuchalkaButton, type Stuchalka } from './key/stuchalka';
import { loadUnitMs, saveUnitMs, formatTimingHint, calculateTimings } from './state/settings';

function debounce<T extends (...args: any[]) => void>(fn: T, delayMs: number): T {
  let timer: number | undefined;
  // @ts-expect-error return type cast
  return function(this: unknown, ...args: any[]) {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(this, args), delayMs);
  } as T;
}

function liveNormalizeText(value: string, alphabet: Alphabet): string {
  let s = value;
  // Preserve case for non-Latin scripts; uppercase only for Latin/Cyrillic/Greek
  const shouldUpper = alphabet === 'ENG' || alphabet === 'ITU' || alphabet === 'RUS' || alphabet === 'DEU' || alphabet === 'GRE';
  if (shouldUpper) s = s.toUpperCase();
  if (alphabet === 'RUS') s = s.replaceAll('Ё', 'Е');
  s = s.replace(/\s{2,}/g, ' ');
  return s;
}

function hasCyrillic(s: string): boolean { return /[\u0400-\u04FF]/.test(s); }
function hasLatin(s: string): boolean { return /[A-Za-z]/.test(s); }
function hasArabic(s: string): boolean { return /[\u0600-\u06FF]/.test(s); }

function getStoredAlphabet(): Promise<Alphabet> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ alphabet: 'ITU' as Alphabet }, (res) => {
      const allowed = new Set<Alphabet>(['ITU', 'ENG', 'RUS', 'DEU', 'FRA', 'ESP', 'ITA']);
      let value = (res.alphabet as Alphabet) ?? 'ITU';
      if (!allowed.has(value)) {
        value = 'ITU';
        chrome.storage.local.set({ alphabet: value }, () => resolve(value));
      } else {
        resolve(value);
      }
    });
  });
}
function setStoredAlphabet(alphabet: Alphabet): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ alphabet }, () => resolve());
  });
}

function getMaps(alphabet: Alphabet): Record<string, string> {
  if (alphabet === 'RUS') return RUS_FWD;
  if (alphabet === 'DEU') return DEU_FWD;
  if (alphabet === 'FRA') return FRA_FWD;
  if (alphabet === 'ESP') return ESP_FWD;
  if (alphabet === 'ITA') return ITA_FWD;
  if (alphabet === 'SWE') return SWE_FWD;
  if (alphabet === 'DAN') return DAN_FWD;
  if (alphabet === 'NOR') return NOR_FWD;
  if (alphabet === 'FIN') return FIN_FWD;
  if (alphabet === 'POL') return POL_FWD;
  if (alphabet === 'BEL') return BEL_FWD;
  if (alphabet === 'AR') return AR_FWD;
  if (alphabet === 'GRE') return GRE_FWD;
  if (alphabet === 'ENG' || alphabet === 'ITU') return ENG_FWD;
  return ITU_FWD;
}

const textInput = document.getElementById('textInput') as HTMLTextAreaElement;
const morseInput = document.getElementById('morseInput') as HTMLTextAreaElement;
const alphabetSelect = document.getElementById('alphabetSelect') as HTMLSelectElement;
const alphabetButton = document.getElementById('alphabetButton') as HTMLButtonElement | null;
const alphabetList = document.getElementById('alphabetList') as HTMLUListElement | null;
const alphabetContainer = document.getElementById('alphabet') as HTMLDivElement | null;
const infoButton = document.getElementById('infoButton') as HTMLButtonElement;
const textPasteBtn = document.getElementById('textPaste') as HTMLButtonElement;
const textCopyBtn = document.getElementById('textCopy') as HTMLButtonElement;
const textClearBtn = document.getElementById('textClear') as HTMLButtonElement;
const morsePasteBtn = document.getElementById('morsePaste') as HTMLButtonElement;
const morseCopyBtn = document.getElementById('morseCopy') as HTMLButtonElement;
// no central clear button
const morsePlayBtn = document.getElementById('morsePlay') as HTMLButtonElement;
const morseSaveBtn = document.getElementById('morseSave') as HTMLButtonElement;
const autoSwitchMsg = document.getElementById('autoSwitchMsg') as HTMLSpanElement;
const stuchalkaBtn = document.getElementById('stuchalkaBtn') as HTMLButtonElement;

const stuchalkaToggle = document.getElementById('stuchalkaToggle') as HTMLInputElement;

// Speed control elements
const unitRange = document.getElementById('unitRange') as HTMLInputElement;
const unitNumber = document.getElementById('unitNumber') as HTMLInputElement;
const speedHint = document.getElementById('speedHint') as HTMLDivElement;
const resetSpeed = document.getElementById('resetSpeed') as HTMLButtonElement;

const debugInfo = document.getElementById('debugInfo') as HTMLDivElement;

const infoModal = document.getElementById('infoModal') as HTMLDivElement;
const modalClose = document.getElementById('modalClose') as HTMLButtonElement;
const modalRules = document.getElementById('modalRules') as HTMLDivElement;
const modalTable = document.getElementById('modalTable') as HTMLDivElement;

let lastEdited: 'text' | 'morse' = 'text';
let isSyncing = false;
let currentAlphabet: Alphabet = 'ITU';
let didAutoSwitchFromText = false;
let audioPlayer: ReturnType<typeof scheduleOnline> | null = null;
let stuchalka: Stuchalka | null = null;
let currentUnitMs = 100; // Current unit duration
let stuchalkaMode = false; // Stuchalka mode state

function maybeAutoSwitchFromFirstLetters() {
  if (lastEdited !== 'text') return;
  if (didAutoSwitchFromText) return;
  const val = textInput.value;
  if (!val) return;
  const m = val.match(/[A-Za-z\u0400-\u04FF\u0600-\u06FF]/);
  if (!m) return;
  const ch = m[0];
  if (currentAlphabet !== 'AR' && /[\u0600-\u06FF]/.test(ch)) {
    currentAlphabet = 'AR' as Alphabet;
    alphabetSelect.value = 'AR';
    void setStoredAlphabet('AR' as Alphabet);
    didAutoSwitchFromText = true;
    showAutoSwitchMsg('Switched to AR based on first Arabic letter');
  } else if (currentAlphabet !== 'RUS' && /[\u0400-\u04FF]/.test(ch)) {
    currentAlphabet = 'RUS';
    alphabetSelect.value = 'RUS';
    void setStoredAlphabet('RUS');
    didAutoSwitchFromText = true;
    showAutoSwitchMsg('Switched to RUS based on first Cyrillic letter');
  } else if (currentAlphabet === 'RUS' && /[A-Za-z]/.test(ch)) {
    currentAlphabet = 'ITU';
    alphabetSelect.value = 'ITU';
    void setStoredAlphabet('ITU');
    didAutoSwitchFromText = true;
    showAutoSwitchMsg('Switched to ITU based on first Latin letter');
  }
}

function showAutoSwitchMsg(text: string) {
  // Auto-switch messages disabled
}

function hasValidMorse(morse: string): boolean {
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
function initSpeedControl(): void {
  if (!unitRange || !unitNumber || !speedHint) return;
  
  // Load saved unit duration
  loadUnitMs().then((unitMs) => {
    currentUnitMs = unitMs;
    updateSpeedControls(unitMs);
  });
  
  // Sync range and number inputs
  const syncInputs = (value: number) => {
    unitRange.value = value.toString();
    unitNumber.value = value.toString();
    speedHint.textContent = formatTimingHint(value);
  };
  
  // Handle range input changes
  unitRange.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
    syncInputs(value);
    updateUnitMs(value);
  });
  
  // Handle number input changes
  unitNumber.addEventListener('input', (e) => {
    const value = parseInt((e.target as HTMLInputElement).value);
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

// Enable/disable speed controls
function setSpeedControlsEnabled(enabled: boolean): void {
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

function updateSpeedControls(unitMs: number): void {
  if (!unitRange || !unitNumber || !speedHint) return;
  
  unitRange.value = unitMs.toString();
  unitNumber.value = unitMs.toString();
  speedHint.textContent = formatTimingHint(unitMs);
}

function updateUnitMs(unitMs: number): void {
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
function toggleStuchalkaMode(enabled: boolean): void {
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
function initStuchalka(): void {
  if (!stuchalkaBtn) return;
  
  stuchalka = attachStuchalkaButton(stuchalkaBtn, {
    onSymbol: (symbol: string) => {
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
    onPressEnd: (_symbol: string) => {},
    onGapDetected: (_symbol: string) => {}
  }, {
    unitMs: currentUnitMs
  });
  
  // Don't activate automatically - wait for toggle
}



const debouncedText = debounce(updateMorseFromText, 40);
const debouncedMorse = debounce(updateTextFromMorse, 40);

textInput.addEventListener('input', () => {
  maybeAutoSwitchFromFirstLetters();
  const before = textInput.value;
  // Toggle RTL class for Arabic for better readability
  if (currentAlphabet === 'AR') {
    textInput.classList.add('rtl-ar');
  } else {
    textInput.classList.remove('rtl-ar');
  }
  const norm = liveNormalizeText(before, currentAlphabet);
  if (norm !== before) {
    const pos = textInput.selectionStart ?? before.length;
    textInput.value = norm;
    const left = liveNormalizeText(before.slice(0, pos), currentAlphabet).length;
    textInput.selectionStart = textInput.selectionEnd = Math.min(left, textInput.value.length);
  }
  lastEdited = 'text';
  debouncedText();
});

morseInput.addEventListener('input', () => {
  const before = morseInput.value;
  const replaced = before.replace(/[·•]/g, '.').replace(/[–—]/g, '-');
  if (replaced !== before) {
    const pos = morseInput.selectionStart ?? before.length;
    morseInput.value = replaced;
    morseInput.selectionStart = morseInput.selectionEnd = Math.min(pos, morseInput.value.length);
  }
  lastEdited = 'morse';
  debouncedMorse();
  updateAudioButtons();
});

function setAlphabetUI(value: Alphabet) {
  const labels: Record<Alphabet, string> = {
    ITU: 'International',
    ENG: 'English',
    DEU: 'German',
    FRA: 'French',
    ESP: 'Spanish',
    ITA: 'Italian',
    SWE: 'Swedish',
    DAN: 'Danish',
    NOR: 'Norwegian',
    FIN: 'Finnish',
    POL: 'Polish',
    BEL: 'Belarusian',
    AR: 'Arabic',
    GRE: 'Greek',
    RUS: 'Russian'
  };
  if (alphabetButton) alphabetButton.textContent = labels[value] ?? 'International';
  if (alphabetList) {
    const items = Array.from(alphabetList.querySelectorAll('li'));
    for (const li of items) {
      const isMatch = li.getAttribute('data-value') === value;
      if (isMatch) li.setAttribute('aria-selected', 'true');
      else li.removeAttribute('aria-selected');
    }
  }
  alphabetSelect.value = value;
}

alphabetSelect.addEventListener('change', async () => {
  const a = (alphabetSelect.value as Alphabet) ?? 'ITU';
  currentAlphabet = a;
  await setStoredAlphabet(a);
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

// Custom dropdown behavior
if (alphabetButton && alphabetList) {
  function openList() {
    alphabetList.removeAttribute('hidden');
    alphabetContainer?.classList.add('open');
    alphabetButton.setAttribute('aria-expanded', 'true');
    const selected = alphabetList.querySelector('[aria-selected="true"]') as HTMLElement | null;
    (selected ?? alphabetList.firstElementChild as HTMLElement | null)?.focus?.();
  }
  function closeList() {
    alphabetList.setAttribute('hidden', '');
    alphabetContainer?.classList.remove('open');
    alphabetButton.setAttribute('aria-expanded', 'false');
    alphabetButton.focus();
  }
  function choose(value: Alphabet) {
    if (alphabetSelect.value !== value) {
      alphabetSelect.value = value;
      const evt = new Event('change', { bubbles: true });
      alphabetSelect.dispatchEvent(evt);
    } else {
      setAlphabetUI(value);
    }
    closeList();
  }

  alphabetButton.addEventListener('click', () => {
    if (alphabetList.hidden) openList(); else closeList();
  });
  alphabetButton.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList();
    }
  });
  alphabetList.addEventListener('keydown', (e) => {
    const items = Array.from(alphabetList.querySelectorAll('li')) as HTMLElement[];
    const active = document.activeElement as HTMLElement;
    let idx = items.indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(idx - 1, 0)]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeList(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const el = document.activeElement as HTMLElement | null;
      const v = el?.getAttribute('data-value') as Alphabet | null;
      if (v) choose(v);
    }
  });
  alphabetList.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('li');
    if (!li) return;
    const v = li.getAttribute('data-value') as Alphabet | null;
    if (v) choose(v);
  });
  document.addEventListener('click', (e) => {
    if (!alphabetButton || !alphabetList) return;
    const t = e.target as Node;
    if (!alphabetButton.contains(t) && !alphabetList.contains(t)) {
      if (!alphabetList.hidden) closeList();
    }
  });
}

textPasteBtn.addEventListener('click', async () => {
  try {
    const clip = await navigator.clipboard.readText();
    if (!didAutoSwitchFromText) {
      const m = clip.match(/[A-Za-z\u0400-\u04FF\u0600-\u06FF]/);
      if (m) {
        if (currentAlphabet !== 'AR' && /[\u0600-\u06FF]/.test(m[0])) {
          currentAlphabet = 'AR' as Alphabet;
          alphabetSelect.value = 'AR';
          void setStoredAlphabet('AR' as Alphabet);
          didAutoSwitchFromText = true;
          showAutoSwitchMsg('Switched to AR based on first Arabic letter');
          if (!infoModal.hasAttribute('hidden')) renderInfoModal();
        } else if (currentAlphabet !== 'RUS' && /[\u0400-\u04FF]/.test(m[0])) {
          currentAlphabet = 'RUS';
          alphabetSelect.value = 'RUS';
          void setStoredAlphabet('RUS');
          didAutoSwitchFromText = true;
          showAutoSwitchMsg('Switched to RUS based on first Cyrillic letter');
          // Update info modal if it's open
          if (!infoModal.hasAttribute('hidden')) renderInfoModal();
        } else if (currentAlphabet === 'RUS' && /[A-Za-z]/.test(m[0])) {
          currentAlphabet = 'ITU';
          alphabetSelect.value = 'ITU';
          void setStoredAlphabet('ITU');
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
    const alphabetNames: Record<string, string> = {
      'ITU': 'International (ITU)',
      'ENG': 'English',
      'DEU': 'German',
      'FRA': 'French',
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
  const target = ev.target as HTMLElement;
  if (target && target.getAttribute('data-close') === 'true') {
    infoModal.setAttribute('hidden', '');
    infoButton.focus();
  }
});

function renderInfoModal() {
  modalRules.innerHTML = '';
  const rules = document.createElement('div');
  
  // Get alphabet name for display
  const alphabetNames: Record<string, string> = {
    'ITU': 'International (ITU)',
    'ENG': 'English',
    'FRA': 'French',
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

  let letters: Array<[string, string]> = [];
  if (currentAlphabet === 'DEU') {
    const base = entries.filter(([k]) => /^[A-Z]$/.test(k));
    base.sort(([a], [b]) => collator.compare(a, b));
    const extraOrder = ['Ä', 'Ö', 'Ü', 'ẞ'];
    const extras = entries.filter(([k]) => extraOrder.includes(k)).sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
    letters = [...base, ...extras];
  } else if (currentAlphabet === 'RUS' || currentAlphabet === 'BEL') {
    letters = entries.filter(([k]) => /[A-ZА-Я]/.test(k)).sort(([a], [b]) => collator.compare(a, b));
  } else {
    const latinBase = entries.filter(([k]) => /^[A-Z]$/.test(k)).sort(([a], [b]) => collator.compare(a, b));
    letters = currentAlphabet === 'GRE' ? [] : latinBase;
    if (currentAlphabet === 'ESP') {
      // Append Ñ after Z and add CH bigram as a separate row at the end
      const extras = entries.filter(([k]) => k === 'Ñ' || k === 'CH');
      const orderedExtras = [] as Array<[string,string]>;
      const nTilde = extras.find(([k]) => k === 'Ñ');
      if (nTilde) orderedExtras.push(nTilde);
      const ch = extras.find(([k]) => k === 'CH');
      if (ch) orderedExtras.push(ch);
      letters = [...letters, ...orderedExtras];
    } else if (currentAlphabet === 'ITA') {
      // Append À, È, Ò at the end
      const extraOrder = ['À','È','Ò'];
      const extras = entries.filter(([k]) => extraOrder.includes(k)).sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'SWE') {
      const extraOrder = ['Å','Ä','Ö'];
      const extras = entries.filter(([k]) => extraOrder.includes(k)).sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'DAN' || currentAlphabet === 'NOR') {
      const extraOrder = ['Å','Æ','Ø'];
      const extras = entries.filter(([k]) => extraOrder.includes(k)).sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'FIN') {
      const extraOrder = ['Å','Ä','Ö'];
      const extras = entries.filter(([k]) => extraOrder.includes(k)).sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'POL') {
      const extraOrder = ['Ł','Ś','Ź','Ż'];
      const extras = entries.filter(([k]) => extraOrder.includes(k)).sort((a, b) => extraOrder.indexOf(a[0]) - extraOrder.indexOf(b[0]));
      letters = [...letters, ...extras];
    } else if (currentAlphabet === 'GRE') {
      const order = ['Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω'];
      const extras = order.map((k) => [k, fwd[k] as string]).filter((pair) => pair[1]);
      letters = [...letters, ...extras];
    }
  }

  const isLetter = (ch: string): boolean => {
    if (currentAlphabet === 'DEU') return /^[A-Z]$/.test(ch) || ['Ä','Ö','Ü','ẞ'].includes(ch);
    if (currentAlphabet === 'BEL') return /[A-ZА-Я]/.test(ch) || ['Ў'].includes(ch);
    if (currentAlphabet === 'ITA') return /^[A-Z]$/.test(ch) || ['À','È','Ò'].includes(ch);
    if (currentAlphabet === 'SWE') return /^[A-Z]$/.test(ch) || ['Å','Ä','Ö'].includes(ch);
    if (currentAlphabet === 'DAN' || currentAlphabet === 'NOR') return /^[A-Z]$/.test(ch) || ['Å','Æ','Ø'].includes(ch);
    if (currentAlphabet === 'FIN') return /^[A-Z]$/.test(ch) || ['Å','Ä','Ö'].includes(ch);
    if (currentAlphabet === 'POL') return /^[A-Z]$/.test(ch) || ['Ł','Ś','Ź','Ż'].includes(ch);
    if (currentAlphabet === 'GRE') return ['Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Ι','Κ','Λ','Μ','Ν','Ξ','Ο','Π','Ρ','Σ','Τ','Υ','Φ','Χ','Ψ','Ω'].includes(ch);
    if (currentAlphabet === 'ESP') return /^[A-Z]$/.test(ch) || ch === 'Ñ' || ch === 'CH';
    if (currentAlphabet === 'RUS') return /[A-ZА-Я]/.test(ch);
    return /^[A-Z]$/.test(ch);
  };

  const digits = entries.filter(([k]) => /[0-9]/.test(k));
  const punct = entries.filter(([k]) => !(isLetter(k) || /[0-9]/.test(k)));
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
  const enabled = (e.target as HTMLInputElement).checked;
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

// Rating widget
function initRatingWidget(): void {
  const container = document.getElementById('rateWidget');
  if (!container) return;

  const FORM_URL = 'https://forms.gle/eiZuNpoLYL4MdwDy5';
  const STORE_URL = 'https://chromewebstore.google.com/detail/morse-code-translator/omcinjloplaplkbiihnaelepmpammdfm';

  type Star = {
    root: HTMLButtonElement;
    fill: SVGPathElement;
  };

  const stars: Star[] = [];

  const starPath = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

  const createStar = (index: number): Star => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rate-star';
    btn.setAttribute('aria-label', `Rate ${index + 1} star${index === 0 ? '' : 's'}`);
    btn.dataset.index = index.toString();
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
  };

  for (let i = 0; i < 5; i++) stars.push(createStar(i));

  function setFillPercent(starIdx: number, percent: number) {
    const star = stars[starIdx];
    if (!star) return;
    const p = Math.max(0, Math.min(100, percent));
    // Clip from the right side, leaving left portion visible
    star.fill.style.clipPath = `inset(0 ${100 - p}% 0 0)`;
  }

  function resetAll() {
    for (let i = 0; i < stars.length; i++) setFillPercent(i, 0);
  }

  function handlePointerMove(targetIdx: number, clientX: number) {
    // Fill left stars fully
    for (let i = 0; i < targetIdx; i++) setFillPercent(i, 100);

    // Compute partial for hovered star
    const starEl = stars[targetIdx]?.root;
    if (!starEl) return;
    const rect = starEl.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    const percent = Math.max(0, Math.min(1, frac)) * 100;
    setFillPercent(targetIdx, percent);

    // Clear right stars
    for (let i = targetIdx + 1; i < stars.length; i++) setFillPercent(i, 0);
  }

  // Mouse interactions
  for (const s of stars) {
    s.root.addEventListener('mousemove', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
      handlePointerMove(idx, (e as MouseEvent).clientX);
    });
    s.root.addEventListener('mouseenter', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
      handlePointerMove(idx, (e as MouseEvent).clientX);
    });
    s.root.addEventListener('mouseleave', () => {
      resetAll();
    });
  }

  container.addEventListener('mouseleave', () => resetAll());

  function openUrlForIndex(idx: number) {
    const url = idx <= 2 ? FORM_URL : STORE_URL; // 0,1,2 -> form; 3,4 -> store
    try {
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      // Fallback: location change
      location.href = url;
    }
  }

  for (const s of stars) {
    s.root.addEventListener('click', (e) => {
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
      openUrlForIndex(idx);
    });
    s.root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
        openUrlForIndex(idx);
      }
    });
  }
}
