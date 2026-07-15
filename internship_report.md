<div align="center">

# SUMMER TRAINING/INTERNSHIP REPORT
### (Term Aug-Dec 2026)

<br>

### Submitted in partial fulfillment of the requirements for the award of degree of
## Bachelor of Technology in Computer Science and Engineering

<br>
<br>

### Submitted by:
**Kush870**  
**Registration Number:** [Enter Registration Number Here]

<br>
<br>

### Under the guidance of:
**Industry Mentor / Academic Guide**

<br>
<br>
<br>

### School of Computer Science and Engineering
## LOVELY PROFESSIONAL UNIVERSITY
### PUNJAB (INDIA)

---

</div>

<div style="page-break-after: always;"></div>

# DECLARATION

I hereby declare that the work presented in this report entitled **"SourceInsight: Local & Cloud-Integrated Codebase Q&A Analyzer"** has been carried out by me under the supervision of my guide. This work is original and has not been submitted elsewhere for the award of any other degree or diploma.

All the sources of information, text, code fragments, and references used in this project have been duly acknowledged.

<br>
<br>
<br>

**Date:** July 15, 2026  
**Place:** Punjab, India  
<div align="right">
  <strong>(Signature of Student)</strong>  
  <strong>Kush870</strong>  
</div>

---

<div style="page-break-after: always;"></div>

# CERTIFICATE

This is to certify that the Summer Training/Internship report entitled **"SourceInsight: Local & Cloud-Integrated Codebase Q&A Analyzer"** submitted by **Kush870** (Registration Number: [Enter Registration Number Here]) in partial fulfillment of the requirements for the award of B.Tech degree in Computer Science and Engineering of Lovely Professional University, Punjab, is a record of training work carried out by him.

The report has been evaluated and found satisfactory in all respects.

<br>
<br>
<br>
<br>

**Date:** July 15, 2026  

<br>
<br>

<div align="left">
  <strong>(Signature of Internal Examiner)</strong>  
</div>
<br>
<div align="right">
  <strong>(Signature of External Examiner)</strong>  
</div>

---

<div style="page-break-after: always;"></div>

# ACKNOWLEDGEMENT

I wish to express my deep sense of gratitude to the **School of Computer Science and Engineering, Lovely Professional University**, for providing me with the opportunity and resources to work on this project and complete my summer training program successfully.

I would like to thank my academic mentors and industry guides who provided continuous encouragement, structural guidelines, and technical advice during the development of this project.

Finally, I express my gratitude to my family and peers for their constant support, feedback, and contribution to testing the user interface and functionality of the application.

<br>
<br>
<br>

<div align="right">
  <strong>Kush870</strong>  
</div>

---

<div style="page-break-after: always;"></div>

# TABLE OF CONTENTS

- **Cover Page**
- **Declaration**
- **Certificate**
- **Acknowledgement**
- **Table of Contents**
- **1. Introduction of Organization**
- **2. Summer Training Course/Internship Content Detail**
- **3. Summer Training/Internship Project Detail**
  - *3.1 Problem Statement*
  - *3.2 Project Outcomes*
  - *3.3 Technologies Used*
- **4. Source Code and System Snapshots**
  - *4.1 Key Backend Source Code*
  - *4.2 Core Frontend Resizer Logic*
  - *4.3 Production Deployment Verification*
- **12. Bibliography & References**

---

<div style="page-break-after: always;"></div>

# 1. INTRODUCTION OF ORGANIZATION

**SourceInsight** is a local development initiative focused on engineering high-performance, cost-effective, and secure software tools for developers. The organization aims to bridge the gap between heavy cloud-dependent artificial intelligence assistants and localized developer codebases. 

SourceInsight prioritizes:
1. **Developer Privacy**: Creating tools that scan local directories and filter files before making any external API calls, ensuring credentials or private source directories are not leaked.
2. **Context Efficiency**: Researching and implementing lightweight, offline indexing algorithms (like TF-IDF keyword ranking) to parse thousands of source files locally, selecting only high-relevance snippets for LLM prompts to decrease token fees.
3. **Responsive User Interaction**: Building state-of-the-art developer panels with responsive, resizable grid-splits and real-time nested directory file browsers.

---

<div style="page-break-after: always;"></div>

# 2. SUMMER TRAINING COURSE/INTERNSHIP CONTENT DETAIL

During the training term, several core full-stack software development concepts were covered, analyzed, and implemented:

### Module 1: Node.js Backend Engineering & Middleware
- Learned how to configure lightweight, asynchronous REST APIs using Express.js.
- Implemented file system modules (`fs` and `fs.promises`) to recursively traverse deep folder hierarchies.
- Configured secure configurations using `dotenv` to isolate private parameters like API keys from repositories.

### Module 2: Local Search Indexing & Tokenization
- Learned tokenization and text sanitization by extracting code components, stripping non-alphanumeric characters, and running filter matches.
- Created a stop-words processor to exclude common grammar particles from indexing.
- Designed a custom keyword frequency relevance formula using logarithmic scaling to score files based on search terms.

### Module 3: Modern SPA Frontend Design & UI Styling
- Studied CSS layout architectures (flexbox, grid systems, absolute overlays).
- Built draggable panels with mouse-event trackers (`mousedown`, `mousemove`, `mouseup`) to dynamically adjust pane widths.
- Integrated third-party components via CDNs, including Prism.js for multi-language syntax highlighting and Marked.js for markdown rendering.

### Module 4: Git Lifecycle & Cloud Deployment Pipeline
- Learned repository tracking, ignore configurations (`.gitignore`), and branch commits.
- Studied cloud hosting options for Node.js servers, configuring builds and environment maps for automated deployments on **Render**.

---

<div style="page-break-after: always;"></div>

# 3. SUMMER TRAINING/INTERNSHIP PROJECT DETAIL

## 3.1 Problem Statement
Developers frequently struggle to understand and navigate large, unfamiliar codebases. While cloud-based AI tools exist, they either require uploading the entire codebase to cloud databases (which raises security and billing concerns) or run into token context limitations when scanning heavy repositories. 

The goal of this project is to build an application that allows developers to point the system at a local folder or a GitHub URL, index it in memory, search relevant files offline, and ask questions to get grounded answers with snippets, alongside drafting project READMEs.

## 3.2 Project Outcomes
The project achieved the following key outcomes:
1. **File-Grounded Q&A Answering**: Implemented an assistant that answers codebase structure questions with exact file references and clickable code snippets.
2. **Real-time Local & Remote Repository Indexing**: Configured a recursive, size-capped directory scanner that clones and indexes codebases.
3. **README Documentation Draftsman**: Integrated a tool that analyzes core configs and entry points to automatically draft clean, structured sections for documentation.
4. **Interactive Resizable Split-Pane Dashboard**: Built a side-by-side Chat and Code Viewer with a draggable resizer and auto-scrolling line highlights.

## 3.3 Technologies Used
- **Backend Runtime**: Node.js v18+
- **Web Framework**: Express.js
- **Artificial Intelligence Model**: Google Gemini API (`gemini-2.5-flash`)
- **Git Integration**: Child Process Shell Commands (`git clone`)
- **Frontend Core**: Vanilla HTML5, Vanilla CSS3 (Dracula/GitHub Light variables)
- **Code Syntax Rendering**: Prism.js (plugin: Line Numbers)
- **Markdown Compiler**: Marked.js

---

<div style="page-break-after: always;"></div>

# 4. SOURCE CODE AND SYSTEM SNAPSHOTS

## 4.1 Key Backend Source Code (`server.js`)
Below is the search relevance ranking algorithm that parses codebase contents offline and ranks files to prevent token overflows:

```javascript
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
```

## 4.2 Core Frontend Resizer Logic (`public/app.js`)
Below is the drag-and-resize implementation for the side-by-side workspace:

```javascript
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
```

## 4.3 Production Deployment Verification
The application is fully hosted on Render:

| Resource Type | Host Provider | Status | URL |
| :--- | :--- | :--- | :--- |
| Node.js Web Server | Render | Active | `https://codebase-q-a.onrender.com/` |

---

<div style="page-break-after: always;"></div>

# 12. BIBLIOGRAPHY & REFERENCES

1. **Express.js API Documentation**  
   *Routing and Middleware design guides: https://expressjs.com/*
2. **Google Gemini API Documentation**  
   *Gemini Pro models, response caching, and JSON schema constraints: https://ai.google.dev/gemini-api/docs*
3. **Prism.js Syntax Highlighting Library**  
   *Token classes and line highlighting plugins: https://prismjs.com/*
4. **Marked.js Markdown Parser**  
   *Configuration options for secure, real-time HTML rendering: https://marked.js.org/*
5. **Git Documentation**  
   *Git clone architectures, exclusions, and branch life cycles: https://git-scm.com/docs*
