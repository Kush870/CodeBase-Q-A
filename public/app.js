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

const currentFilepath = document.getElementById('current-filepath');
const codeBlock = document.getElementById('code-block');

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  resetCodebaseState();
  initResizer();
});

// Reset codebase state on page reload
async function resetCodebaseState() {
  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      console.log('Backend codebase state reset.');
    }
  } catch (err) {
    console.error('Failed to reset codebase state:', err);
  }

  // Clear stats UI
  statsPanel.classList.add('hidden');
  statFilesText.innerText = '0';
  statLinesText.innerText = '0';
  statSizeText.innerText = '0 KB';
  indexedRepoNameText.innerText = 'None';

  // Clear files list
  allFiles = [];
  fileListContainer.innerHTML = '<div class="empty-state">No repository indexed yet.</div>';

  // Reset dropdown list in viewer
  const select = document.getElementById('viewer-file-select');
  if (select) {
    select.innerHTML = '<option value="">Select a file to view...</option>';
  }

  // Run status checks to verify API key is configured
  checkServerStatus();
}

// Check status of server at startup
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    if (data.success) {
      updateStatusBanner(data.isApiKeyConfigured, data.hasIndexedRepo);
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

// Tab Switching (Workspace, README)
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
      renderFileExplorer();
      updateFileSelectDropdown(allFiles);
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

// Build nested hierarchical tree from flat files array
function buildFileTree(files) {
  const root = { name: 'root', type: 'directory', children: {} };
  files.forEach(file => {
    const parts = file.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!current.children[part]) {
        current.children[part] = isLast
          ? { name: part, type: 'file', path: file.path }
          : { name: part, type: 'directory', children: {} };
      }
      current = current.children[part];
    }
  });
  return root;
}

// Recursively render directory tree
function renderTree(node, container, level = 0) {
  const keys = Object.keys(node.children || {}).sort((a, b) => {
    const childA = node.children[a];
    const childB = node.children[b];
    if (childA.type !== childB.type) {
      return childA.type === 'directory' ? -1 : 1;
    }
    return a.localeCompare(b);
  });

  keys.forEach(key => {
    const child = node.children[key];
    const itemEl = document.createElement('div');
    itemEl.className = `tree-item ${child.type}`;
    itemEl.style.paddingLeft = `${level * 10 + 8}px`;
    
    if (child.type === 'directory') {
      const folderId = `folder-${level}-${key.replace(/[^a-zA-Z0-9]/g, '-')}-${Math.random().toString(36).substring(2, 6)}`;
      itemEl.innerHTML = `
        <span class="folder-toggle-icon">▼</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="folder-icon"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>${child.name}</span>
      `;
      
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.id = folderId;
      
      itemEl.onclick = (e) => {
        e.stopPropagation();
        const toggleIcon = itemEl.querySelector('.folder-toggle-icon');
        const isCollapsed = childrenContainer.classList.toggle('collapsed');
        toggleIcon.innerText = isCollapsed ? '▶' : '▼';
        toggleIcon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      };
      
      container.appendChild(itemEl);
      container.appendChild(childrenContainer);
      renderTree(child, childrenContainer, level + 1);
    } else {
      itemEl.title = child.path;
      itemEl.innerHTML = `
        <span class="folder-toggle-icon"></span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>${child.name}</span>
      `;
      itemEl.onclick = (e) => {
        e.stopPropagation();
        loadFileInViewer(child.path);
      };
      container.appendChild(itemEl);
    }
  });
}

// Render file tree explorer in sidebar (supports flat search fallback)
function renderFileExplorer() {
  const query = fileSearchInput.value.trim().toLowerCase();
  
  if (allFiles.length === 0) {
    fileListContainer.innerHTML = '<div class="empty-state">No repository indexed yet.</div>';
    return;
  }

  fileListContainer.innerHTML = '';
  
  if (query === '') {
    // Render proper directory tree view
    const tree = buildFileTree(allFiles);
    renderTree(tree, fileListContainer);
  } else {
    // Render flat list view for searches
    const filtered = allFiles.filter(f => f.path.toLowerCase().includes(query));
    if (filtered.length === 0) {
      fileListContainer.innerHTML = '<div class="empty-state">No matching files.</div>';
      return;
    }
    
    filtered.forEach(file => {
      const div = document.createElement('div');
      div.className = 'tree-item file';
      div.title = file.path;
      div.style.paddingLeft = '8px';
      div.onclick = () => loadFileInViewer(file.path);
      div.innerHTML = `
        <span class="folder-toggle-icon"></span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>${file.path}</span>
      `;
      fileListContainer.appendChild(div);
    });
  }
}

function filterFilesList() {
  renderFileExplorer();
}

// Update dropdown selector in Code Viewer
function updateFileSelectDropdown(files) {
  const select = document.getElementById('viewer-file-select');
  if (!select) return;
  select.innerHTML = '<option value="">Select a file to view...</option>';
  files.forEach(file => {
    const opt = document.createElement('option');
    opt.value = file.path;
    opt.textContent = file.path;
    select.appendChild(opt);
  });
}

// Load selected file in Code Viewer and support line highlighting
async function loadFileInViewer(filePath, startLine = null, endLine = null) {
  if (!filePath) {
    currentFilepath.innerText = 'No active file';
    codeBlock.className = 'language-text';
    codeBlock.innerText = 'Select a file to view its syntax-highlighted content.';
    const fileItems = document.querySelectorAll('.tree-item.file');
    fileItems.forEach(item => item.classList.remove('active'));
    return;
  }

  // Sync select dropdown selection
  const select = document.getElementById('viewer-file-select');
  if (select) {
    select.value = filePath;
  }

  // Highlight active file in tree view
  const fileItems = document.querySelectorAll('.tree-item.file');
  fileItems.forEach(item => {
    if (item.title === filePath) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  currentFilepath.innerText = filePath;
  codeBlock.className = 'language-text';
  codeBlock.innerText = 'Loading file content...';
  
  // Make sure we switch to Q&A Workspace (which has the split screen showing code viewer)
  switchMainTab('qa-tab');

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

      // Handle Line range highlighting and scrolling
      if (startLine !== null) {
        setTimeout(() => {
          const rowsContainer = codeBlock.querySelector('.line-numbers-rows');
          if (rowsContainer) {
            const rowSpans = rowsContainer.children;
            // Clear any old highlighted line classes
            for (let i = 0; i < rowSpans.length; i++) {
              rowSpans[i].classList.remove('highlighted-line-num');
            }
            // Add highlights to active range
            const finalEnd = endLine !== null ? endLine : startLine;
            for (let i = 0; i < rowSpans.length; i++) {
              const lineNum = i + 1;
              if (lineNum >= startLine && lineNum <= finalEnd) {
                rowSpans[i].classList.add('highlighted-line-num');
              }
            }
            // Auto scroll to target line
            const targetRow = rowSpans[startLine - 1];
            if (targetRow) {
              const preContainer = codeBlock.parentElement;
              preContainer.scrollTo({
                top: targetRow.offsetTop - 40,
                behavior: 'smooth'
              });
            }
          }
        }, 120);
      }
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

  chatInput.value = '';
  
  const welcomeScreen = document.querySelector('.chat-welcome');
  if (welcomeScreen) {
    welcomeScreen.remove();
  }

  appendMessage(query, 'user');
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
  
  // Use Marked.js if loaded for premium markdown formatting; fallback to simple replacement
  if (typeof marked !== 'undefined') {
    bodyDiv.innerHTML = marked.parse(text);
  } else {
    bodyDiv.innerHTML = parseSimpleMarkdown(text);
  }
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
      
      badge.onclick = () => {
        // Parse line range indicators if present (e.g. file.js#L20-L40 or file.js:45)
        let pathStr = file;
        let start = null;
        let end = null;
        
        const lineMatch = file.match(/(.*)(?:#L|:L|:)(\d+)(?:-(\d+))?/);
        if (lineMatch) {
          pathStr = lineMatch[1];
          start = parseInt(lineMatch[2], 10);
          end = lineMatch[3] ? parseInt(lineMatch[3], 10) : start;
        }
        loadFileInViewer(pathStr, start, end);
      };
      
      badgesDiv.appendChild(badge);
    });
    
    refsDiv.appendChild(badgesDiv);
    msgDiv.appendChild(refsDiv);
  }

  chatMessages.appendChild(msgDiv);
  
  // Highlight pre code blocks within message replies
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

// Fallback markdown parsing logic
function parseSimpleMarkdown(markdown) {
  let html = markdown
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h2>$1</h2>');
  
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    const cleanLang = lang || 'javascript';
    const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="line-numbers"><code class="language-${cleanLang}">${escapedCode}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
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

// Initialize the draggable resizer for split panels
function initResizer() {
  const resizer = document.getElementById('resizer');
  const chatPane = document.getElementById('chat-pane');
  
  if (!resizer || !chatPane) return;
  
  const workspace = chatPane.parentElement;
  let isDragging = false;

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const workspaceRect = workspace.getBoundingClientRect();
    const newWidth = e.clientX - workspaceRect.left;
    
    // Bounds constraints
    const minWidth = 280;
    const maxWidth = workspaceRect.width * 0.75;
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      chatPane.style.width = `${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}
