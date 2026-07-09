const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const { GoogleGenerativeAI } = require('@google/generative-ai');

require('dotenv').config();

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Global state to store the currently indexed codebase
let currentIndexedRepo = {
  repoName: '',
  repoType: '', // 'local' or 'github'
  localPath: '',
  githubUrl: '',
  files: [], // Array of { path, fullPath, size, lines, content }
  stats: {
    totalFiles: 0,
    totalLines: 0,
    totalBytes: 0
  }
};

// In-memory caches for API request optimization to minimize load
const queryCache = new Map();
const readmeCache = new Map();

// Clean up temporary repositories on startup
const tempReposPath = path.join(__dirname, 'temp_repos');
try {
  if (fs.existsSync(tempReposPath)) {
    fs.rmSync(tempReposPath, { recursive: true, force: true });
  }
  fs.mkdirSync(tempReposPath, { recursive: true });
} catch (err) {
  console.error('Error cleaning up temp_repos directory:', err.message);
}

// Config file lists
const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', 'out', 'target',
  'bin', 'obj', '.idea', '.vscode', '.gemini', 'venv', '.venv', 'env', 'temp_repos'
]);

const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock',
  '.DS_Store', 'thumbs.db'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
  '.cs', '.go', '.html', '.css', '.json', '.md', '.txt', '.yml', '.yaml',
  '.ini', '.conf', '.properties', '.sh', '.bat', '.ps1', '.rb', '.php',
  '.sql', '.rs', '.kt', '.swift', '.gradle', '.xml', '.toml'
]);

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
  'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
  'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in',
  'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor',
  'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll',
  'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt',
  'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which',
  'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll',
  'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
]);

// Helper: Scan a directory recursively
async function scanDirectory(dirPath, baseDir = dirPath, limit = 1000) {
  let filesList = [];
  
  async function recurse(currentPath) {
    if (filesList.length >= limit) return;
    
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (filesList.length >= limit) break;
      
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (relativePath.split('/').length > 15) continue; // safety limit on recursion depth
        await recurse(fullPath);
      } else if (entry.isFile()) {
        if (IGNORED_FILES.has(entry.name)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        const lowerName = entry.name.toLowerCase();

        const isAllowedName = ['dockerfile', 'makefile', 'gemfile', 'rakefile', 'procfile'].includes(lowerName);
        if (ALLOWED_EXTENSIONS.has(ext) || isAllowedName) {
          try {
            const stats = await fs.promises.stat(fullPath);
            // Ignore files larger than 150KB
            if (stats.size > 150 * 1024) continue;

            const content = await fs.promises.readFile(fullPath, 'utf-8');
            // Ignore binary files containing null bytes
            if (content.includes('\u0000')) continue;

            const lineCount = content.split('\n').length;
            filesList.push({
              path: relativePath,
              fullPath: fullPath,
              size: stats.size,
              lines: lineCount,
              content: content
            });
          } catch (err) {
            console.error(`Error reading ${relativePath}:`, err.message);
          }
        }
      }
    }
  }

  await recurse(dirPath);
  return filesList;
}

// Tokenize text for ranking
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

// Rank files by relevance to the query
function rankFiles(files, query) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return files.slice(0, 15);

  const scoredFiles = files.map(file => {
    let score = 0;
    const lowerPath = file.path.toLowerCase();
    const lowerContent = file.content.toLowerCase();

    for (const term of queryTerms) {
      // Score high for exact matches in path/name
      if (lowerPath.includes(term)) {
        score += 30;
      }
      
      // Count frequency in content
      let contentMatches = 0;
      let pos = lowerContent.indexOf(term);
      while (pos !== -1) {
        contentMatches++;
        pos = lowerContent.indexOf(term, pos + term.length);
      }
      
      if (contentMatches > 0) {
        score += 5 + Math.log2(contentMatches) * 3;
      }
    }
    return { file, score };
  });

  return scoredFiles
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.file);
}

// Helper: check API key setup
function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === '' || key === 'your_gemini_api_key_here') {
    return null;
  }
  return key;
}

// ----------------------------------------
// API ENDPOINTS
// ----------------------------------------

// Status check endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    isApiKeyConfigured: getGeminiKey() !== null,
    hasIndexedRepo: currentIndexedRepo.files.length > 0,
    repoName: currentIndexedRepo.repoName,
    stats: currentIndexedRepo.stats
  });
});

// Indexing endpoint
app.post('/api/index', async (req, res) => {
  const { path: targetPath, type } = req.body;

  if (!targetPath || !type) {
    return res.status(400).json({ success: false, error: 'Path and type parameters are required.' });
  }

  try {
    let scanPath = '';
    let repoName = '';
    let githubUrl = '';
    let localPath = '';

    if (type === 'github') {
      // Clean and parse URL
      const cleanUrl = targetPath.trim().replace(/\.git$/, '');
      const urlParts = cleanUrl.split('/');
      const owner = urlParts[urlParts.length - 2];
      const repo = urlParts[urlParts.length - 1];

      if (!owner || !repo) {
        return res.status(400).json({ success: false, error: 'Invalid GitHub URL format.' });
      }

      repoName = `${owner}/${repo}`;
      githubUrl = cleanUrl;

      // Create destination subdirectory
      const destDirName = `repo_${Date.now()}_${repo}`;
      scanPath = path.join(tempReposPath, destDirName);
      
      console.log(`Cloning repository from ${cleanUrl} into ${scanPath}...`);
      await execPromise(`git clone "${cleanUrl}" "${scanPath}"`);
      console.log(`Cloning completed successfully.`);
    } else {
      // Local indexing
      scanPath = path.resolve(targetPath);
      if (!fs.existsSync(scanPath)) {
        return res.status(400).json({ success: false, error: `Local directory not found at: ${scanPath}` });
      }
      repoName = path.basename(scanPath);
      localPath = scanPath;
    }

    console.log(`Scanning directory: ${scanPath}...`);
    const files = await scanDirectory(scanPath);
    console.log(`Scanning completed. Found ${files.length} indexable files.`);

    // Calculate statistics
    let totalBytes = 0;
    let totalLines = 0;
    files.forEach(f => {
      totalBytes += f.size;
      totalLines += f.lines;
    });

    currentIndexedRepo = {
      repoName,
      repoType: type,
      localPath,
      githubUrl,
      files,
      stats: {
        totalFiles: files.length,
        totalLines,
        totalBytes
      }
    };

    queryCache.clear();
    readmeCache.clear();
    console.log('API caches cleared for the new codebase index.');

    res.json({
      success: true,
      stats: currentIndexedRepo.stats,
      repoName: currentIndexedRepo.repoName,
      files: files.map(f => ({ path: f.path, size: f.size, lines: f.lines }))
    });

  } catch (error) {
    console.error('Error during indexing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// File content endpoint
app.get('/api/file-content', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ success: false, error: 'File path query parameter is required.' });
  }

  if (currentIndexedRepo.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No repository is currently indexed.' });
  }

  const file = currentIndexedRepo.files.find(f => f.path === filePath);
  if (!file) {
    return res.status(404).json({ success: false, error: `File not found in index: ${filePath}` });
  }

  res.json({
    success: true,
    path: file.path,
    content: file.content
  });
});

// Query endpoint (Codebase Q&A)
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter is required.' });
  }

  const apiKey = getGeminiKey();
  if (!apiKey) {
    return res.status(403).json({
      success: false,
      error: 'Gemini API key is not configured. Please open the \'.env\' file at the project root, add your GEMINI_API_KEY, and restart the server.'
    });
  }

  if (currentIndexedRepo.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No codebase is currently indexed. Please index a repository first.' });
  }

  // API Load Optimization: check local query cache first
  const cacheKey = query.trim().toLowerCase();
  if (queryCache.has(cacheKey)) {
    console.log(`Cache hit: returning saved response for query "${query}"`);
    const cached = queryCache.get(cacheKey);
    return res.json({
      success: true,
      answer: cached.answer,
      referencedFiles: cached.referencedFiles
    });
  }

  try {
    const totalSize = currentIndexedRepo.stats.totalBytes;
    let contextFiles = [];
    const maxContextBytes = 250 * 1024; // 250KB limit (reduced from 1.2MB to minimize token load)
    const maxContextFiles = 6; // Max number of files to prevent massive prompt sizes

    if (totalSize <= maxContextBytes && currentIndexedRepo.files.length <= maxContextFiles) {
      contextFiles = currentIndexedRepo.files;
    } else {
      // Large codebase: retrieve top relevant files using keyword ranking
      const ranked = rankFiles(currentIndexedRepo.files, query);
      let accumulatedBytes = 0;
      for (const file of ranked) {
        if (contextFiles.length >= maxContextFiles) break;
        if (accumulatedBytes + file.size > maxContextBytes) break;
        contextFiles.push(file);
        accumulatedBytes += file.size;
      }
      
      // If we didn't find matches or had very few, fallback to main files
      if (contextFiles.length === 0) {
        let accumulatedBytes = 0;
        for (const file of currentIndexedRepo.files) {
          if (contextFiles.length >= maxContextFiles) break;
          if (accumulatedBytes + file.size > maxContextBytes) break;
          contextFiles.push(file);
          accumulatedBytes += file.size;
        }
      }
    }

    // Build the directory listing for global context
    const directoryTree = currentIndexedRepo.files.map(f => `- ${f.path} (${f.lines} lines, ${(f.size / 1024).toFixed(1)} KB)`).join('\n');

    // Build files context text
    const filesContext = contextFiles.map(f => {
      return `--- FILE: ${f.path} ---\n${f.content}\n--- END OF FILE: ${f.path} ---`;
    }).join('\n\n');

    const promptText = `
You are an expert software developer and codebase analyzer. Your task is to answer user questions about this codebase with high accuracy and complete grounding in the actual code.
You will be provided with:
1. The repository's global file structure.
2. The full contents of key files relevant to the query.

Here is the global file tree structure of the repository:
${directoryTree}

Here are the contents of the relevant files in the codebase:
${filesContext}

User Question: "${query}"

You MUST respond with a JSON object. The object must contain exactly two fields:
1. "answer": A string containing your detailed answer in Markdown format. Use code snippets and line references where appropriate. Explain exactly where features are implemented, which files are involved, and how they function.
2. "referencedFiles": An array of relative file paths (strings) from the codebase that you referenced or that contain the code discussed in the answer.

Important Guidelines for "answer":
- Be precise, technical, and direct.
- Quote code snippets from the provided files to backup your explanation.
- Keep the user's files and folders grounded; only mention files that exist in the directory structure.
- Maintain a professional, clean Markdown style.

Response format:
{
  "answer": "...",
  "referencedFiles": ["..."]
}
`;

    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as default
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    console.log(`Sending query to Gemini API (using ${contextFiles.length} files as context)...`);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = result.response.text();
    console.log(`Received response from Gemini.`);
    
    // Parse the JSON response from Gemini
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn('Failed to parse Gemini response as JSON. Retrying standard text cleanup...');
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Gemini response did not contain a valid JSON object.');
      }
    }

    // Save in cache
    const responsePayload = {
      answer: responseData.answer,
      referencedFiles: responseData.referencedFiles || []
    };
    queryCache.set(cacheKey, responsePayload);

    res.json({
      success: true,
      ...responsePayload
    });

  } catch (error) {
    console.error('Error during query processing:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// README drafting endpoint
app.post('/api/draft-readme', async (req, res) => {
  const { section, additionalInstructions } = req.body;

  if (!section) {
    return res.status(400).json({ success: false, error: 'Section parameter is required.' });
  }

  const apiKey = getGeminiKey();
  if (!apiKey) {
    return res.status(403).json({
      success: false,
      error: 'Gemini API key is not configured. Please open the \'.env\' file at the project root, add your GEMINI_API_KEY, and restart the server.'
    });
  }

  if (currentIndexedRepo.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No codebase is currently indexed. Please index a repository first.' });
  }

  // API Load Optimization: check readme cache first
  const cacheKey = `${section.trim()}_${(additionalInstructions || '').trim()}`.toLowerCase();
  if (readmeCache.has(cacheKey)) {
    console.log(`Cache hit: returning saved README draft for section "${section}"`);
    return res.json({
      success: true,
      draft: readmeCache.get(cacheKey)
    });
  }

  try {
    // Gather key entry-point files to build the README draft
    // Find package.json, server.js, readme if it exists, or main files
    const keyFiles = currentIndexedRepo.files.filter(f => {
      const name = path.basename(f.path).toLowerCase();
      return ['package.json', 'server.js', 'app.js', 'index.js', 'index.html', 'readme.md', 'requirements.txt', 'cargo.toml'].includes(name) || f.path.split('/').length === 1;
    });

    const fileListTree = currentIndexedRepo.files.map(f => `- ${f.path}`).join('\n');
    const keyFilesContext = keyFiles.map(f => `--- FILE: ${f.path} ---\n${f.content}\n---`).join('\n\n');

    const promptText = `
You are an expert developer and technical writer. Your task is to draft a specific section of a GitHub README.md for the indexed codebase.
Here is the repository structure:
${fileListTree}

Here are the key configuration and entry point files of the repository:
${keyFilesContext}

Section to draft: "${section}"
Additional instructions from the user: "${additionalInstructions || 'None'}"

Write a detailed, beautifully-formatted, professional Markdown section for the README. It must reflect the actual implementation in the codebase.
For example:
- If drafting "Installation & Setup", look at package.json / requirements.txt to list the exact dependencies and setup commands.
- If drafting "Architecture", describe the actual directory structure and role of the key files.
- If drafting "API Reference" or "Usage", describe the actual endpoints or execution parameters in the code files.

Your output must be a JSON object:
{
  "draft": "Your generated README section in Markdown format."
}
`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    console.log(`Generating README draft for section: ${section}...`);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = result.response.text();
    let responseData = JSON.parse(responseText);

    // Save in cache
    readmeCache.set(cacheKey, responseData.draft);

    res.json({
      success: true,
      draft: responseData.draft
    });

  } catch (error) {
    console.error('Error generating README:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` CodeBase Q&A app running at http://localhost:${PORT}`);
  console.log(`==================================================`);
});
