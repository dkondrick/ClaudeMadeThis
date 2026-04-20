/* ============================================================
   Homework & IEP Goal Generator — app.js
   Generates homework assignments and IEP goals using Claude API
   ============================================================ */

'use strict';

// ============================================================
// State
// ============================================================

const state = {
  currentMode: null,
  apiKey: localStorage.getItem('anthropic-api-key') || '',
  isGenerating: false,
  abortController: null,
  outputText: '',
};

// ============================================================
// DOM References
// ============================================================

const startScreen = document.getElementById('start-screen');
const appEl = document.getElementById('app');
const modeHomeworkBtn = document.getElementById('mode-homework');
const modeIepBtn = document.getElementById('mode-iep');

const appTitle = document.getElementById('app-title');
const apiKeyInput = document.getElementById('api-key-input');
const statusText = document.getElementById('status-text');
const apiStatusDot = document.querySelector('.api-status-dot');
const apiStatusText = document.getElementById('api-status-text');

const homeworkForm = document.getElementById('homework-form');
const iepForm = document.getElementById('iep-form');

const outputText = document.getElementById('output-text');
const generateBtn = document.getElementById('generate-btn');
const copyBtn = document.getElementById('copy-btn');
const printBtn = document.getElementById('print-btn');
const clearBtn = document.getElementById('clear-btn');
const backBtn = document.getElementById('back-btn');

// Homework inputs
const hwGrade = document.getElementById('hw-grade');
const hwSubject = document.getElementById('hw-subject');
const hwTopic = document.getElementById('hw-topic');
const hwCount = document.getElementById('hw-count');
const hwDifficulty = document.getElementById('hw-difficulty');

// IEP inputs
const iepGrade = document.getElementById('iep-grade');
const iepArea = document.getElementById('iep-area');
const iepBaseline = document.getElementById('iep-baseline');
const iepTarget = document.getElementById('iep-target');
const iepMeasurement = document.getElementById('iep-measurement');

// ============================================================
// Initialization
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load API key from localStorage
  if (state.apiKey) {
    apiKeyInput.value = state.apiKey;
    updateApiStatus();
  }

  // Mode selection
  modeHomeworkBtn.addEventListener('click', selectMode.bind(null, 'homework'));
  modeIepBtn.addEventListener('click', selectMode.bind(null, 'iep'));

  // API key input
  apiKeyInput.addEventListener('input', (e) => {
    state.apiKey = e.target.value;
    localStorage.setItem('anthropic-api-key', state.apiKey);
    updateApiStatus();
  });

  // Buttons
  generateBtn.addEventListener('click', generate);
  copyBtn.addEventListener('click', copy);
  printBtn.addEventListener('click', print);
  clearBtn.addEventListener('click', clearOutput);
  backBtn.addEventListener('click', goHome);

  updateApiStatus();
});

// ============================================================
// Mode Selection
// ============================================================

function selectMode(mode) {
  state.currentMode = mode;
  startScreen.classList.add('hidden');
  appEl.classList.remove('hidden');

  if (mode === 'homework') {
    appTitle.textContent = 'HOMEWORK GENERATOR';
    homeworkForm.classList.remove('hidden');
    iepForm.classList.add('hidden');
  } else {
    appTitle.textContent = 'IEP GOAL GENERATOR';
    homeworkForm.classList.add('hidden');
    iepForm.classList.remove('hidden');
  }

  clearOutput();
  statusText.textContent = 'Ready to generate';
}

function goHome() {
  startScreen.classList.remove('hidden');
  appEl.classList.add('hidden');
  state.currentMode = null;
}

// ============================================================
// API Status
// ============================================================

function updateApiStatus() {
  const hasKey = state.apiKey && state.apiKey.length > 0;
  if (hasKey) {
    apiStatusDot.classList.remove('error');
    apiStatusDot.classList.add('ready');
    apiStatusText.textContent = 'API Ready';
    generateBtn.disabled = false;
  } else {
    apiStatusDot.classList.add('error');
    apiStatusDot.classList.remove('ready');
    apiStatusText.textContent = 'No API Key';
    generateBtn.disabled = true;
  }
}

// ============================================================
// Generate Content
// ============================================================

async function generate() {
  if (!state.apiKey || state.apiKey.length === 0) {
    outputText.textContent = 'ERROR: Please enter your Anthropic API key';
    return;
  }

  if (state.isGenerating) {
    return;
  }

  state.isGenerating = true;
  generateBtn.disabled = true;
  copyBtn.disabled = true;
  printBtn.disabled = true;
  state.outputText = '';
  outputText.textContent = '';
  outputText.classList.add('streaming');
  statusText.textContent = 'Generating...';

  try {
    const prompt = buildPrompt();
    await streamGenerate(prompt);
  } catch (error) {
    outputText.textContent = `ERROR: ${error.message}`;
    statusText.textContent = 'Error occurred';
  } finally {
    state.isGenerating = false;
    generateBtn.disabled = false;
    copyBtn.disabled = !state.outputText;
    printBtn.disabled = !state.outputText;
    outputText.classList.remove('streaming');
    statusText.textContent = 'Generation complete';
  }
}

function buildPrompt() {
  if (state.currentMode === 'homework') {
    return `Create a homework assignment with the following specifications:
- Grade Level: ${hwGrade.value}
- Subject: ${hwSubject.value}
- Topic/Skill: ${hwTopic.value}
- Number of Problems: ${hwCount.value}
- Difficulty Level: ${hwDifficulty.value}

Generate ${hwCount.value} engaging ${hwDifficulty.value.toLowerCase()} difficulty practice problems or questions for this assignment. Include a brief introduction explaining the learning objective.`;
  } else {
    return `Create a SMART IEP goal with the following information:
- Student Grade Level: ${iepGrade.value}
- Area of Need: ${iepArea.value}
- Current Performance Level: ${iepBaseline.value}
- Target Skill/Behavior: ${iepTarget.value}
- Measurement Method: ${iepMeasurement.value}
- Time Frame: 1 year

Generate a comprehensive, measurable IEP goal statement following SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound). Include the goal statement, criteria for success, and recommended instructional strategies.`;
  }
}

async function streamGenerate(prompt) {
  state.abortController = new AbortController();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      stream: true,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
    signal: state.abortController.signal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          state.outputText += event.delta.text;
          outputText.textContent = state.outputText;
          outputText.scrollTop = outputText.scrollHeight;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
}

// ============================================================
// Actions
// ============================================================

function copy() {
  if (!state.outputText) return;
  navigator.clipboard.writeText(state.outputText).then(() => {
    statusText.textContent = 'Copied to clipboard';
    setTimeout(() => {
      statusText.textContent = 'Generation complete';
    }, 2000);
  });
}

function print() {
  if (!state.outputText) return;
  const printWindow = window.open('', '', 'height=600,width=800');
  printWindow.document.write(`
    <html>
      <head>
        <title>Education Generator Output</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
          pre { white-space: pre-wrap; word-wrap: break-word; }
        </style>
      </head>
      <body>
        <h1>${state.currentMode === 'homework' ? 'Homework Assignment' : 'IEP Goal'}</h1>
        <pre>${escapeHtml(state.outputText)}</pre>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

function clearOutput() {
  state.outputText = '';
  outputText.textContent = '';
  statusText.textContent = 'Ready to generate';
  copyBtn.disabled = true;
  printBtn.disabled = true;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
