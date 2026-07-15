import os
import re
import tempfile
import subprocess
import shutil
import streamlit as st
from dotenv import load_dotenv

# LangChain components
from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_community.vectorstores import FAISS

# Load environment variables
load_dotenv()

# Page Configuration
st.set_page_config(
    page_title="SourceInsight - Codebase Q&A Workspace",
    page_icon="🧩",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom GitHub Light Visual Styling Injector
st.markdown("""
<style>
    /* Custom background color variables mapping */
    :root {
        --bg-primary: #ffffff;
        --bg-secondary: #f6f8fa;
        --bg-tertiary: #eaeef2;
        --accent-teal: #1a7f37;
        --accent-cyan: #0969da;
        --text-main: #24292f;
        --text-muted: #57606a;
        --text-dim: #8c959f;
        --border-color: #d0d7de;
    }
    
    /* Styled widgets */
    .stApp {
        background-color: var(--bg-primary);
        color: var(--text-main);
    }
    
    /* Custom status card */
    .status-card {
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 0.82rem;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid var(--border-color);
    }
    .status-success {
        background-color: #dafbe1;
        color: #1a7f37;
        border-color: #a2e9b1;
    }
    .status-warning {
        background-color: #fff8c5;
        color: #9a6700;
        border-color: #f8e3a1;
    }
    .indicator-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
    }
    .dot-success { background-color: #1a7f37; }
    .dot-warning { background-color: #bf8700; }
    
    /* Micro-badges for references */
    .ref-badge-btn {
        background-color: var(--bg-secondary) !important;
        border: 1px solid var(--border-color) !important;
        color: var(--accent-cyan) !important;
        padding: 4px 8px !important;
        border-radius: 4px !important;
        font-size: 0.75rem !important;
        font-family: monospace !important;
        margin-right: 6px !important;
        margin-bottom: 6px !important;
        display: inline-flex !important;
        align-items: center !important;
        cursor: pointer !important;
    }
    
    /* Code block customizations */
    pre code {
        font-family: 'Fira Code', monospace !important;
        font-size: 0.8rem !important;
    }
</style>
""", unsafe_allow_html=True)

# --------------------------------------------------------------------------
# IGNORE CONFIGURATIONS (Identical to Node.js backend)
# --------------------------------------------------------------------------
IGNORED_DIRS = {
    '.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', 'out', 'target',
    'bin', 'obj', '.idea', '.vscode', '.gemini', 'venv', '.venv', 'env', 'temp_repos',
    '__pycache__'
}

IGNORED_FILES = {
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock',
    '.DS_Store', 'thumbs.db', 'internship_report.docx'
}

ALLOWED_EXTENSIONS = {
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.go', '.html', '.css', '.json', '.md', '.txt', '.yml', '.yaml',
    '.ini', '.conf', '.properties', '.sh', '.bat', '.ps1', '.rb', '.php',
    '.sql', '.rs', '.kt', '.swift', '.gradle', '.xml', '.toml'
}

# --------------------------------------------------------------------------
# SESSION STATE INITIALIZATION
# --------------------------------------------------------------------------
if 'indexed_files' not in st.session_state:
    st.session_state.indexed_files = []  # List of dicts: {path, content, size, lines}
if 'vector_store' not in st.session_state:
    st.session_state.vector_store = None
if 'chat_history' not in st.session_state:
    st.session_state.chat_history = []
if 'stats' not in st.session_state:
    st.session_state.stats = {'total_files': 0, 'total_lines': 0, 'total_bytes': 0}
if 'repo_name' not in st.session_state:
    st.session_state.repo_name = ""
if 'active_file' not in st.session_state:
    st.session_state.active_file = None
if 'readme_draft' not in st.session_state:
    st.session_state.readme_draft = ""

# --------------------------------------------------------------------------
# HELPER BACKEND FUNCTIONS (Recursive Scan, Clone, Indexing)
# --------------------------------------------------------------------------
def scan_directory(dir_path):
    files_list = []
    base_dir = os.path.abspath(dir_path)
    
    for root, dirs, files in os.walk(base_dir):
        # Prune ignored directories in-place
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        
        for file in files:
            if file in IGNORED_FILES:
                continue
            ext = os.path.splitext(file)[1].lower()
            lower_name = file.lower()
            
            is_allowed_name = lower_name in ['dockerfile', 'makefile', 'gemfile', 'rakefile', 'procfile']
            if ext in ALLOWED_EXTENSIONS or is_allowed_name:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, base_dir).replace('\\', '/')
                
                try:
                    # Ignore files > 150KB to protect prompt tokens context limits
                    file_size = os.path.getsize(full_path)
                    if file_size > 150 * 1024:
                        continue
                        
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        
                    # Ignore binary files containing null bytes
                    if '\u0000' in content:
                        continue
                        
                    lines_count = len(content.splitlines())
                    files_list.append({
                        'path': rel_path,
                        'content': content,
                        'size': file_size,
                        'lines': lines_count
                    })
                except Exception as e:
                    print(f"Skipping {rel_path} due to error: {e}")
                    
    return files_list

def clone_and_scan_github(github_url):
    clean_url = github_url.strip().replace('.git', '')
    url_parts = clean_url.split('/')
    if len(url_parts) < 2:
        raise ValueError("Invalid GitHub URL format.")
    
    owner, repo = url_parts[-2], url_parts[-1]
    repo_name = f"{owner}/{repo}"
    
    # Create temp directory
    temp_dir = tempfile.mkdtemp(prefix="repo_clone_")
    
    try:
        # Clone using subprocess git command line call
        print(f"Cloning {clean_url} into {temp_dir}...")
        subprocess.run(["git", "clone", clean_url, temp_dir], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        files = scan_directory(temp_dir)
        return files, repo_name
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise e

def index_codebase(target_path, repo_type, api_key):
    if not target_path:
        st.error("Please enter a valid path or GitHub URL.")
        return
        
    with st.spinner("Scanning and building semantic vector database index..."):
        try:
            if repo_type == 'github':
                files, name = clone_and_scan_github(target_path)
            else:
                name = os.path.basename(os.path.abspath(target_path))
                files = scan_directory(target_path)
                
            if not files:
                st.error("No indexable code files found.")
                return
                
            # Process statistics
            total_bytes = sum(f['size'] for f in files)
            total_lines = sum(f['lines'] for f in files)
            
            st.session_state.indexed_files = files
            st.session_state.repo_name = name
            st.session_state.stats = {
                'total_files': len(files),
                'total_lines': total_lines,
                'total_bytes': total_bytes
            }
            
            # Setup LangChain Text Splitters and Vector Embeddings
            lc_docs = []
            for file in files:
                lc_docs.append(LCDocument(
                    page_content=file['content'],
                    metadata={"source": file['path']}
                ))
                
            # Split documents
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=120)
            split_docs = text_splitter.split_documents(lc_docs)
            
            # Generate Embeddings & load FAISS index
            embeddings = GoogleGenerativeAIEmbeddings(
                model="models/gemini-embedding-001",
                google_api_key=api_key
            )
            vector_store = FAISS.from_documents(split_docs, embeddings)
            st.session_state.vector_store = vector_store
            
            # Clear chat history for the new codebase index
            st.session_state.chat_history = []
            st.session_state.active_file = files[0]['path'] if files else None
            st.success(f"Successfully indexed {name}! Loaded {len(files)} files.")
            
        except Exception as e:
            st.error(f"Failed to index codebase: {e}")

# --------------------------------------------------------------------------
# FRONTEND INTERFACE DESIGN
# --------------------------------------------------------------------------

# API Key Validation
gemini_key = os.getenv("GEMINI_API_KEY")
is_api_ready = gemini_key is not None and len(gemini_key.strip()) > 0

# Sidebar Configuration
with st.sidebar:
    st.markdown('<div class="logo"><h2>SourceInsight</h2><p style="font-size:0.75rem; color:#57606a;">Local Codebase Q&A Analyzer</p></div>', unsafe_allow_html=True)
    
    # Status card indicator
    if is_api_ready:
        st.markdown("""
        <div class="status-card status-success">
            <span class="indicator-dot dot-success"></span>
            <span><strong>API Connected:</strong> Ready. Index a repository to start.</span>
        </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div class="status-card status-warning">
            <span class="indicator-dot dot-warning"></span>
            <span><strong>API Key Missing:</strong> Configure <code>GEMINI_API_KEY</code> in the <code>.env</code> file & restart.</span>
        </div>
        """, unsafe_allow_html=True)
        
    # Index Repository inputs
    st.markdown("### Index Repository")
    repo_type = st.radio("Repository Type", options=['local', 'github'], format_func=lambda x: "Local Folder" if x == 'local' else "GitHub Repository URL")
    
    if repo_type == 'local':
        repo_path = st.text_input("Local Absolute Path", placeholder="e.g. C:\\Users\\dell\\Documents\\project")
    else:
        repo_path = st.text_input("GitHub URL", placeholder="e.g. https://github.com/owner/repo")
        
    if st.button("Index Codebase", use_container_width=True):
        if not is_api_ready:
            st.error("Cannot index: GEMINI_API_KEY is not configured.")
        else:
            index_codebase(repo_path, repo_type, gemini_key)
            
    # Statistics Display
    if st.session_state.indexed_files:
        st.markdown("---")
        st.markdown("### Current Index Status")
        st.markdown(f"**Indexed Repo**: `{st.session_state.repo_name}`")
        
        c1, c2, c3 = st.columns(3)
        c1.metric("Files", st.session_state.stats['total_files'])
        c2.metric("Lines", f"{st.session_state.stats['total_lines']:,}")
        
        kb_size = st.session_state.stats['total_bytes'] / 1024
        if kb_size < 1024:
            c3.metric("Size", f"{kb_size:.1f} KB")
        else:
            c3.metric("Size", f"{kb_size/1024:.2f} MB")
            
        st.markdown("---")
        st.markdown("### Codebase Files")
        file_paths = [f['path'] for f in st.session_state.indexed_files]
        search_query = st.text_input("Filter files...", placeholder="Type to filter files list...")
        
        filtered_paths = [p for p in file_paths if search_query.lower() in p.lower()] if search_query else file_paths
        
        if filtered_paths:
            # Let the user click and select the active file to load in the Code Viewer
            selected = st.selectbox("Select file to view:", options=filtered_paths, index=0)
            if selected:
                st.session_state.active_file = selected
        else:
            st.caption("No matching files found.")

# Main Dashboard layout tabs
tab1, tab2 = st.tabs(["💬 Code Q&A Workspace", "📝 README Draft Workspace"])

# --------------------------------------------------------------------------
# TAB 1: CODE Q&A CHAT & VIEW SPLIT PANELS
# --------------------------------------------------------------------------
with tab1:
    if not st.session_state.indexed_files:
        st.info("👈 Please enter a repository path in the sidebar and click **Index Codebase** to begin.")
    else:
        # Create side-by-side columns (resizable simulation)
        col_chat, col_code = st.columns([1.1, 0.9])
        
        # Left Split: Q&A Chat Pane
        with col_chat:
            st.markdown("### Explain & Search Your Code")
            
            # Chat history container
            chat_container = st.container(height=450)
            with chat_container:
                if not st.session_state.chat_history:
                    st.markdown("""
                    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                        <h4>Welcome to SourceInsight Chat!</h4>
                        <p>Ask where features are implemented or explain algorithms. The retriever will extract codebase sections dynamically using LangChain.</p>
                    </div>
                    """, unsafe_allow_html=True)
                else:
                    for msg in st.session_state.chat_history:
                        with st.chat_message(msg["role"]):
                            st.write(msg["content"])
                            # Display references if assistant response
                            if msg["role"] == "assistant" and msg.get("references"):
                                st.markdown("**Referenced Files:**")
                                for ref in msg["references"]:
                                    if st.button(ref, key=f"chat-ref-{ref}-{msg['content'][:10]}"):
                                        st.session_state.active_file = ref
                                        st.rerun()
                                        
            # Suggested questions chips
            st.caption("Suggested Questions:")
            s_cols = st.columns(4)
            suggestions = [
                "Where is the entry point?",
                "List all API endpoints",
                "How is config loaded?",
                "Explain error handling"
            ]
            
            clicked_query = None
            for idx, sug in enumerate(suggestions):
                if s_cols[idx].button(sug, key=f"sug-{idx}", use_container_width=True):
                    clicked_query = sug
                    
            # User input box
            user_query = st.chat_input("Ask a question about the codebase...")
            if clicked_query:
                user_query = clicked_query
                
            if user_query:
                st.session_state.chat_history.append({"role": "user", "content": user_query})
                
                with st.spinner("Analyzing vector embeddings and query matches..."):
                    try:
                        # Retrieve documents from LangChain Vector Store
                        retrieved_docs = st.session_state.vector_store.similarity_search(user_query, k=5)
                        
                        # Build context prompt
                        context_txt = ""
                        referenced_paths = set()
                        for doc in retrieved_docs:
                            source = doc.metadata.get("source", "unknown")
                            referenced_paths.add(source)
                            context_txt += f"--- FILE: {source} ---\n{doc.page_content}\n---\n\n"
                            
                        # Add global directory layout overview to context
                        all_file_tree = "\n".join([f"- {f['path']}" for f in st.session_state.indexed_files])
                        
                        prompt = f"""
You are an expert software developer and codebase analyzer. Your task is to answer user questions about this codebase with high accuracy and complete grounding in the actual code.
You will be provided with:
1. The global directory layout:
{all_file_tree}

2. High-relevance matching snippets extracted from vector search:
{context_txt}

User Question: "{user_query}"

Provide a detailed, technical explanation. Reference specific files, folders, and explain the code implementation. Use code snippets and markdown formatting.
"""
                        
                        llm = ChatGoogleGenerativeAI(
                            model="gemini-2.5-flash",
                            google_api_key=gemini_key
                        )
                        response_msg = llm.invoke(prompt)
                        response = response_msg.content
                        
                        st.session_state.chat_history.append({
                            "role": "assistant",
                            "content": response,
                            "references": list(referenced_paths)
                        })
                        st.rerun()
                    except Exception as e:
                        st.error(f"Error executing retrieval query: {e}")
                        
        # Right Split: Code Viewer Pane
        with col_code:
            st.markdown("### Code Viewer")
            if st.session_state.active_file:
                # Find matching file content
                active_path = st.session_state.active_file
                file_obj = next((f for f in st.session_state.indexed_files if f['path'] == active_path), None)
                
                if file_obj:
                    st.markdown(f"📄 **Viewing file**: `{active_path}` ({file_obj['lines']} lines)")
                    
                    # Language detection based on extension
                    ext = os.path.splitext(active_path)[1].lower()
                    lang_map = {
                        '.js': 'javascript', '.jsx': 'javascript',
                        '.ts': 'typescript', '.tsx': 'typescript',
                        '.py': 'python', '.json': 'json',
                        '.css': 'css', '.html': 'html',
                        '.md': 'markdown', '.toml': 'toml',
                        '.yaml': 'yaml', '.yml': 'yaml'
                    }
                    lang = lang_map.get(ext, 'plaintext')
                    
                    # Streamlit code renderer
                    st.code(file_obj['content'], language=lang, line_numbers=True)
                else:
                    st.caption("File not found in current index directory.")
            else:
                st.info("Select a file from the sidebar browser or click reference badges in chat to view code details.")

# --------------------------------------------------------------------------
# TAB 2: README DRAFT WORKSPACE
# --------------------------------------------------------------------------
with tab2:
    if not st.session_state.indexed_files:
        st.info("👈 Please index a repository first to activate the README generator.")
    else:
        st.markdown("## Draft a README Section")
        st.caption("Generate professional, context-aware README sections directly from your codebase files.")
        
        # Grid layout for options and generator
        col_params, col_preview = st.columns([1, 1])
        
        with col_params:
            readme_section = st.selectbox(
                "README Section to Draft",
                options=[
                    "Complete README Overview",
                    "Installation & Setup",
                    "Architecture & Folder Layout",
                    "Usage Guide",
                    "API Reference",
                    "Configuration & Env Settings"
                ]
            )
            
            readme_instructions = st.text_area(
                "Special Instructions (Optional)",
                placeholder="e.g. Include setup parameters for Docker, write in a descriptive developer tone, outline requirements...",
                rows=3
            )
            
            if st.button("Draft README Section", use_container_width=True):
                with st.spinner("Generating section draft..."):
                    try:
                        # Find core configuration files to provide context
                        key_files = [
                            f for f in st.session_state.indexed_files 
                            if os.path.basename(f['path']).lower() in [
                                'package.json', 'requirements.txt', 'cargo.toml', 'app.py', 
                                'server.js', 'readme.md', 'setup.py'
                            ] or f['path'].count('/') == 0
                        ]
                        
                        file_structure = "\n".join([f"- {f['path']}" for f in st.session_state.indexed_files])
                        file_contents_context = "\n\n".join([
                            f"--- FILE: {f['path']} ---\n{f['content']}\n---" for f in key_files
                        ])
                        
                        prompt = f"""
You are an expert developer and technical writer. Your task is to draft a specific section of a GitHub README.md for the indexed codebase.
Here is the repository structure:
{file_structure}

Here are key configuration files context:
{file_contents_context}

Section to draft: "{readme_section}"
Additional instructions from user: "{readme_instructions or 'None'}"

Write a detailed, beautifully-formatted, professional Markdown section for the README. It must reflect the actual implementation in the codebase.
"""
                        
                        llm = ChatGoogleGenerativeAI(
                            model="gemini-2.5-flash",
                            google_api_key=gemini_key
                        )
                        draft_msg = llm.invoke(prompt)
                        draft = draft_msg.content
                        st.session_state.readme_draft = draft
                        st.success("Draft generated successfully!")
                    except Exception as e:
                        st.error(f"Failed to generate draft: {e}")
                        
        with col_preview:
            st.markdown("### Draft Preview")
            if st.session_state.readme_draft:
                # Preview area
                st.text_area("Markdown Code", value=st.session_state.readme_draft, height=350)
                # Rendered markdown preview
                with st.expander("Rendered Preview", expanded=True):
                    st.markdown(st.session_state.readme_draft)
            else:
                st.caption("No draft has been generated yet. Configure settings on the left and click Draft.")
