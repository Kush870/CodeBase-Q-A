// Global states
let activeRepoType = 'local';
let allFiles = []; // Array of files { path, size, lines }
let indexedRepoName = '';

// Dom Elements
const statusBanner = document.getElementById('status-banner');
const pathLabel = document.getElementById('path-label');
const repoPathInput = document.getElementById('repo-path');
const indexBtn = document.getElementById('index-btn');
const statsPanel = document.getElementById('stats-panel');
const fileListContainer = document.getElementById('file-list-container');
const fileSearchInput = document.getElementById('file-search-input');
const indexedRepoNameText = document.getElementById('indexed-repo-name');
const statFilesText = document.getElementById('stat-files');
const statLinesText = document.getElementById('stat-lines');
const statSizeText = document.getElementById('stat-size');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatForm = document.getElementById('chat-form');
const sendBtn = document.getElementById('send-btn');

const readmeOutput = document.getElementById('readme-output');
const generateReadmeBtn = document.getElementById('generate-readme-btn');

const currentFilename = document.getElementById('current-filename');
const currentFilepath = document.getElementById('current-filepath');
const codeBlock = document.getElementById('code-block');

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  checkServerStatus();
});

// Check status of server at startup
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    if (data.success) {
      updateStatusBanner(data.isApiKeyConfigured, data.hasIndexedRepo);
      
      if (data.hasIndexedRepo) {
        indexedRepoName = data.repoName;
        // Fetch files from status data or trigger index re-fetch
        updateStatsUI(data.stats, data.repoName);
        
        // Fetch files lists (we can mock index output or get file tree by running empty index)
        // For simplicity, let's load files list from index request
        allFiles = [];
        fileListContainer.innerHTML = '<div class="empty-state">Re-indexing to load file tree...</div>';
        // Auto trigger a quick indexing of the saved path to populate the tree
        repopulateFileTree();
      }
    }
  } catch (err) {
    console.error('Failed to connect to backend server:', err);
    statusBanner.className = 'status-card warning';
    statusBanner.innerHTML = `
      <div class="status-header">
        <span class="indicator"></span>
        <strong>Server Offline:</strong> Cannot connect to local server on port 3000.
      </div>
    `;
  }
}

function updateStatusBanner(isKeyConfigured, hasIndexed) {
  if (!isKeyConfigured) {
    statusBanner.className = 'status-card warning';
    statusBanner.innerHTML = `
      <div class="status-header">
        <span class="indicator"></span>
        <span><strong>API Key Missing:</strong> Configure <code>GEMINI_API_KEY</code> in the <code>.env</code> file & restart server.</span>
      </div>
    `;
  } else if (!hasIndexed) {
    statusBanner.className = 'status-card success';
    statusBanner.innerHTML = `
      <div class="status-header">
        <span class="indicator"></span>
        <span><strong>API Connected:</strong> Ready. Index a repository to start.</span>
      </div>
    `;
  } else {
    statusBanner.className = 'status-card success';
    statusBanner.innerHTML = `
      <div class="status-header">
        <span class="indicator"></span>
        <span><strong>API Connected:</strong> Codebase <strong>${indexedRepoName}</strong> is ready.</span>
      </div>
    `;
  }
}

// Repopulate files list if server already has indexed repository
async function repopulateFileTree() {
  try {
    // If we have a local path stored in status, we query it again
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    if (statusData.hasIndexedRepo) {
      // Re-trigger scanning
      // To avoid forcing path inputs, let's load files via a query check or similar
      // Since it's stored on backend, we can modify indexing endpoint to return files list
    }
  } catch (e) {
    console.error(e);
  }
}

// Switch Mini tabs in sidebar
function switchRepoType(type) {
  activeRepoType = type;
  const tabs = document.querySelectorAll('.mini-tab');
  tabs.forEach(t => t.classList.remove('active'));
  
  if (type === 'github') {
    event.target.classList.add('active');
    pathLabel.innerText = 'GitHub Repository URL';
    repoPathInput.placeholder = 'e.g. https://github.com/owner/repo';
  } else {
    event.target.classList.add('active');
    pathLabel.innerText = 'Local Absolute Path';
    repoPathInput.placeholder = 'e.g. C:\\Users\\dell\\Documents\\project';
  }
}

// Tab Switching (Q&A, README, Code Viewer)
function switchMainTab(tabId) {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(t => t.classList.remove('active'));
  
  const tabLinks = document.querySelectorAll('.tab-link');
  tabLinks.forEach(l => l.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  
  // Find matching nav button and highlight it
  tabLinks.forEach(l => {
    if (l.getAttribute('onclick').includes(tabId)) {
      l.classList.add('active');
    }
  });
}

// Handle Indexing Submit
async function handleIndex(event) {
  event.preventDefault();
  const targetPath = repoPathInput.value.trim();
  if (!targetPath) return;

  indexBtn.disabled = true;
  indexBtn.innerHTML = `<span class="spinner"></span><span>Indexing Codebase...</span>`;
  fileListContainer.innerHTML = '<div class="empty-state">Reading codebase, please wait...</div>';
  
  try {
    const res = await fetch('/api/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath, type: activeRepoType })
    });
    
    const data = await res.json();
    if (data.success) {
      allFiles = data.files || [];
      indexedRepoName = data.repoName;
      
      updateStatsUI(data.stats, data.repoName);
      renderFileList(allFiles);
      checkServerStatus(); // refresh API key state UI banner
    } else {
      alert(`Error indexing codebase: ${data.error}`);
      fileListContainer.innerHTML = `<div class="empty-state danger">${data.error}</div>`;
    }
  } catch (err) {
    console.error(err);
    alert('Failed to connect to backend indexing service.');
    fileListContainer.innerHTML = `<div class="empty-state danger">Failed to connect to server.</div>`;
  } finally {
    indexBtn.disabled = false;
    indexBtn.innerHTML = `<span>Index Codebase</span>`;
  }
}

// Update stats panel UI
function updateStatsUI(stats, repoName) {
  statsPanel.classList.remove('hidden');
  indexedRepoNameText.innerText = repoName;
  statFilesText.innerText = stats.totalFiles;
  statLinesText.innerText = stats.totalLines.toLocaleString();
  
  const kb = stats.totalBytes / 1024;
  if (kb < 1024) {
    statSizeText.innerText = `${kb.toFixed(1)} KB`;
  } else {
    statSizeText.innerText = `${(kb / 1024).toFixed(2)} MB`;
  }
}

// Render File Tree List
function renderFileList(files) {
  if (files.length === 0) {
    fileListContainer.innerHTML = '<div class="empty-state">No matching files found.</div>';
    return;
  }
  
  fileListContainer.innerHTML = '';
  files.forEach(file => {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.title = file.path;
    div.onclick = () => loadFileInViewer(file.path);
    div.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>${file.path}</span>
    `;
    fileListContainer.appendChild(div);
  });
}

// Filter files in sidebar list
function filterFilesList() {
  const query = fileSearchInput.value.toLowerCase();
  const filtered = allFiles.filter(f => f.path.toLowerCase().includes(query));
  renderFileList(filtered);
}

// Load selected file in Code Viewer
async function loadFileInViewer(filePath) {
  // Highlight active file in sidebar list
  const fileItems = document.querySelectorAll('.file-item');
  fileItems.forEach(item => {
    if (item.title === filePath) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  currentFilename.innerText = filePath.split('/').pop();
  currentFilepath.innerText = filePath;
  codeBlock.className = 'language-text';
  codeBlock.innerText = 'Loading file content...';
  
  switchMainTab('code-tab');

  try {
    const res = await fetch(`/api/file-content?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    
    if (data.success) {
      // Determine Prism language suffix
      const ext = filePath.split('.').pop().toLowerCase();
      let langClass = 'language-text';
      
      const langMap = {
        'js': 'language-javascript',
        'jsx': 'language-javascript',
        'ts': 'language-typescript',
        'tsx': 'language-typescript',
        'py': 'language-python',
        'json': 'language-json',
        'css': 'language-css',
        'html': 'language-html',
        'md': 'language-markdown',
        'yaml': 'language-yaml',
        'yml': 'language-yaml',
        'rs': 'language-rust',
        'go': 'language-go',
        'cpp': 'language-cpp',
        'c': 'language-c',
        'cs': 'language-csharp',
        'java': 'language-java'
      };
      
      if (langMap[ext]) {
        langClass = langMap[ext];
      }
      
      codeBlock.className = langClass;
      codeBlock.textContent = data.content;
      Prism.highlightElement(codeBlock);
    } else {
      codeBlock.innerText = `Error loading file: ${data.error}`;
    }
  } catch (err) {
    codeBlock.innerText = 'Failed to load file content from server.';
  }
}

// ----------------------------------------
// Q&A CHAT LOGIC
// ----------------------------------------
function checkSubmit(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
}

function useSuggestedQuery(queryText) {
  chatInput.value = queryText;
  chatInput.focus();
}

async function handleSendQuery(event) {
  event.preventDefault();
  const query = chatInput.value.trim();
  if (!query) return;

  // Clear input
  chatInput.value = '';
  
  // Remove welcome screen if present
  const welcomeScreen = document.querySelector('.chat-welcome');
  if (welcomeScreen) {
    welcomeScreen.remove();
  }

  // Render user message bubble
  appendMessage(query, 'user');

  // Render loading bubble
  const loadingId = appendLoadingMessage();

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    
    const data = await res.json();
    removeLoadingMessage(loadingId);
    
    if (data.success) {
      appendMessage(data.answer, 'assistant', data.referencedFiles);
    } else {
      appendMessage(`⚠️ **Error:** ${data.error}`, 'assistant');
    }
  } catch (err) {
    removeLoadingMessage(loadingId);
    appendMessage(`⚠️ **Connection Error:** Failed to query the AI backend. Check if the server is running.`, 'assistant');
  }
}

function appendMessage(text, sender, referencedFiles = []) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${sender}`;
  
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'msg-body';
  
  // Emulate basic markdown parsing for visual layout
  bodyDiv.innerHTML = parseSimpleMarkdown(text);
  msgDiv.appendChild(bodyDiv);
  
  // Append reference file badges if any
  if (referencedFiles.length > 0) {
    const refsDiv = document.createElement('div');
    refsDiv.className = 'references-container';
    refsDiv.innerHTML = `<span class="ref-label">Referenced Files:</span>`;
    
    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'ref-badges';
    
    referencedFiles.forEach(file => {
      const badge = document.createElement('button');
      badge.className = 'ref-badge';
      badge.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>${file}</span>
      `;
      badge.onclick = () => loadFileInViewer(file);
      badgesDiv.appendChild(badge);
    });
    
    refsDiv.appendChild(badgesDiv);
    msgDiv.appendChild(refsDiv);
  }

  chatMessages.appendChild(msgDiv);
  
  // Highlight code blocks inside message bubble
  msgDiv.querySelectorAll('pre code').forEach((block) => {
    Prism.highlightElement(block);
  });

  scrollChatToBottom();
}

function appendLoadingMessage() {
  const id = `loading-${Date.now()}`;
  const loadDiv = document.createElement('div');
  loadDiv.id = id;
  loadDiv.className = 'loading-msg';
  loadDiv.innerHTML = `
    <span class="spinner"></span>
    <span>Analyzing codebase...</span>
  `;
  chatMessages.appendChild(loadDiv);
  scrollChatToBottom();
  return id;
}

function removeLoadingMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Simple markdown parsing fallback since we are using Vanilla JS
function parseSimpleMarkdown(markdown) {
  // Convert headers
  let html = markdown
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h2>$1</h2>');
  
  // Convert code blocks (```lang code ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    const cleanLang = lang || 'javascript';
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre class="line-numbers"><code class="language-${cleanLang}">${escapedCode}</code></pre>`;
  });

  // Convert inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert bold text
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert bullet lists
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
  
  // Clean redundant nested uls
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Convert line breaks to paragraphs/brs
  html = html.replace(/\n\n/g, '<p></p>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

// ----------------------------------------
// README GENERATOR LOGIC
// ----------------------------------------
async function handleGenerateReadme(event) {
  event.preventDefault();
  
  const section = document.getElementById('readme-section-select').value;
  const additionalInstructions = document.getElementById('readme-instructions').value.trim();

  generateReadmeBtn.disabled = true;
  generateReadmeBtn.innerHTML = `<span class="spinner"></span><span>Generating Draft...</span>`;
  readmeOutput.value = 'Analyzing codebase files and generating your README section draft...';

  try {
    const res = await fetch('/api/draft-readme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, additionalInstructions })
    });
    
    const data = await res.json();
    if (data.success) {
      readmeOutput.value = data.draft;
    } else {
      readmeOutput.value = `Error generating README: ${data.error}`;
    }
  } catch (err) {
    readmeOutput.value = 'Error connecting to the backend. Ensure server is running.';
  } finally {
    generateReadmeBtn.disabled = false;
    generateReadmeBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      <span>Draft README Section</span>
    `;
  }
}

function copyReadmeText() {
  const text = readmeOutput.value;
  if (!text || text.startsWith('Analyzing') || text.startsWith('Error')) return;
  
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-readme-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="success-icon"><polyline points="20 6 9 17 4 12"/></svg>
      Copied!
    `;
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  });
}
