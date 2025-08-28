export class Stuchalka {
  constructor(button, callbacks, options = {}) {
    this.button = button;
    this.callbacks = callbacks;
    
    // Set options with defaults
    this.options = {
      frequencyHz: 700,
      volume: 0.6,
      unitMs: 100,
      ...options
    };
    
    // Calculate timing constants based on unitMs
    this.unitMs = this.options.unitMs;
    this.dotThreshold = 1.5 * this.unitMs;
    this.dashThreshold = 3.5 * this.unitMs;
    this.letterGap = 3 * this.unitMs;
    this.wordGap = 7 * this.unitMs;
    
    // State variables
    this.pressStart = null;
    this.lastRelease = null;
    this.morseBuffer = "";
    this.audioContext = null;
    this.oscillator = null;
    this.gainNode = null;
    this.gapTimer = null;
    this.isActive = false;
    
    // Event listener references for proper cleanup
    this.boundMouseDown = null;
    this.boundMouseUp = null;
    this.boundTouchStart = null;
    this.boundTouchEnd = null;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Create bound event handlers
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    
    // Mouse events
    this.button.addEventListener('mousedown', this.boundMouseDown);
    this.button.addEventListener('mouseup', this.boundMouseUp);
    this.button.addEventListener('mouseleave', this.boundMouseUp);
    
    // Touch events for mobile
    this.button.addEventListener('touchstart', this.boundTouchStart);
    this.button.addEventListener('touchend', this.boundTouchEnd);
    this.button.addEventListener('touchcancel', this.boundTouchEnd);
    
    // Prevent context menu
    this.button.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async handleMouseDown(e) {
    e.preventDefault();
    await this.startPress();
  }

  handleMouseUp(e) {
    e.preventDefault();
    this.endPress();
  }

  async handleTouchStart(e) {
    e.preventDefault();
    await this.startPress();
  }

  handleTouchEnd(e) {
    e.preventDefault();
    this.endPress();
  }

  async startPress() {
    if (!this.isActive) return;
    
    // Check for gap before starting new press (only if not first press)
    if (this.lastRelease !== null) {
      this.checkGapBeforePress();
    } else {
      console.log('First press - no gap check needed');
    }
    
    this.pressStart = Date.now();
    await this.startAudio();
    if (this.callbacks.onPressStart) this.callbacks.onPressStart();
  }

  endPress() {
    if (!this.isActive || this.pressStart === null) return;
    
    const pressDuration = Date.now() - this.pressStart;
    this.stopAudio();
    
    // Determine symbol based on press duration
    let symbol;
    if (pressDuration <= this.dotThreshold) {
      symbol = '.';
    } else if (pressDuration <= this.dashThreshold) {
      symbol = '-';
    } else {
      // Very long press - treat as dash
      symbol = '-';
    }
    
    // Add to morse buffer and callback
    this.morseBuffer += symbol;
    this.callbacks.onSymbol(symbol);
    if (this.callbacks.onPressEnd) this.callbacks.onPressEnd(symbol);
    
    this.lastRelease = Date.now();
    console.log('Press ended, symbol:', symbol, 'duration:', pressDuration, 'lastRelease updated to:', this.lastRelease);
    this.pressStart = null;
  }



  checkGapBeforePress() {
    if (this.lastRelease === null) return;
    
    const gap = Date.now() - this.lastRelease;
    console.log('Checking gap before press - gap:', gap, 'letterGap:', this.letterGap, 'wordGap:', this.wordGap);
    
    if (gap >= this.wordGap) {
      // Word gap - insert word separator
      console.log('Word gap detected before press, inserting / (word separator)');
      this.callbacks.onSymbol('/');
      if (this.callbacks.onGapDetected) this.callbacks.onGapDetected('/');
      this.morseBuffer = "";
    } else if (gap >= this.letterGap) {
      // Letter gap - insert letter separator (space)
      console.log('Letter gap detected before press, inserting space');
      this.callbacks.onSymbol(' ');
      if (this.callbacks.onGapDetected) this.callbacks.onGapDetected(' ');
      this.morseBuffer = "";
    }
  }

  stopGapMonitoring() {
    if (this.gapTimer) {
      clearInterval(this.gapTimer);
      this.gapTimer = null;
    }
  }

  async startAudio() {
    try {
      // Create AudioContext only once if it doesn't exist
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Resume AudioContext if it's suspended (browser policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      // Create new oscillator and gain node for each press
      this.oscillator = this.audioContext.createOscillator();
      this.gainNode = this.audioContext.createGain();
      
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = this.options.frequencyHz;
      
      this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(this.options.volume, this.audioContext.currentTime + 0.01);
      
      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      
      this.oscillator.start();
      if (this.callbacks.onAudioStart) this.callbacks.onAudioStart();
    } catch (error) {
      console.error('Failed to start audio:', error);
      // Reset audio context on error
      this.audioContext = null;
      this.oscillator = null;
      this.gainNode = null;
    }
  }

  stopAudio() {
    try {
      if (this.oscillator && this.gainNode && this.audioContext) {
        const now = this.audioContext.currentTime;
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 0.01);
        
        this.oscillator.stop(now + 0.02);
        this.oscillator = null;
        this.gainNode = null;
        if (this.callbacks.onAudioStop) this.callbacks.onAudioStop();
      }
    } catch (error) {
      console.error('Failed to stop audio:', error);
      // Clean up on error
      this.oscillator = null;
      this.gainNode = null;
    }
  }

  activate() {
    this.isActive = true;
    // Don't start gap monitoring until first press
    console.log('Stuchalka activated');
  }

  deactivate() {
    this.isActive = false;
    this.stopAudio();
    this.pressStart = null;
    this.lastRelease = null;
    this.morseBuffer = "";
    
    // Clean up audio context if it exists
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (error) {
        console.error('Failed to close audio context:', error);
      }
      this.audioContext = null;
    }
  }

  destroy() {
    this.deactivate();
    
    // Remove event listeners using stored references
    this.button.removeEventListener('mousedown', this.boundMouseDown);
    this.button.removeEventListener('mouseup', this.boundMouseUp);
    this.button.removeEventListener('mouseleave', this.boundMouseUp);
    this.button.removeEventListener('touchstart', this.boundTouchStart);
    this.button.removeEventListener('touchend', this.boundTouchEnd);
    this.button.removeEventListener('touchcancel', this.boundTouchEnd);
  }
}

export function attachStuchalkaButton(button, callbacks, options = {}) {
  return new Stuchalka(button, callbacks, options);
}
