import { createExtension } from '@tmux-web/ext-sdk';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { basicSetup } from 'codemirror';

type GitFileStatus = 'A' | 'M' | 'D' | 'R' | '??';
type ViewMode = 'diff' | 'edit';

interface ReviewContext {
  contextId: string;
  session: string;
  paneId: string;
  panePath: string;
  windowIndex: number;
  repoRoot: string;
  branch: string;
  headSha: string;
  github: { nameWithOwner: string; org: string; repo: string };
  createdAt: number;
}

interface ChangedFileSummary {
  path: string;
  status: GitFileStatus;
  oldPath?: string | null;
  added: number;
  removed: number;
}

interface ContextResponse {
  context: ReviewContext;
  currentHead: string;
  files: ChangedFileSummary[];
  totals: { added: number; removed: number; count: number };
}

interface TreeEntry {
  path: string;
  name: string;
  kind: 'file' | 'dir';
  changed: boolean;
}

interface TreeResponse {
  path: string;
  entries: TreeEntry[];
}

interface FileResponse {
  path: string;
  status: GitFileStatus | null;
  exists: boolean;
  editable: boolean;
  reason: 'binary' | 'too_large' | 'deleted' | 'missing' | null;
  token?: string;
  size?: number;
  content?: string;
}

interface DiffResponse {
  path: string;
  status: GitFileStatus | null;
  diff: string;
}

interface ChangedTreeNode {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  file?: ChangedFileSummary;
  children?: ChangedTreeNode[];
}

const ext = createExtension();

let currentSession = '';
let currentContext: ReviewContext | null = null;
let changedFiles: ChangedFileSummary[] = [];
let currentMode: ViewMode = 'diff';
let selectedPath = '';
let currentDiffPath = '';
let currentFile: FileResponse | null = null;
let currentFileChangedLines = new Map<number, 'added' | 'modified'>();
let dirty = false;
let searchQuery = '';
let changedFilesView: 'list' | 'tree' = 'list';

const treeCache = new Map<string, TreeEntry[]>();
const expandedDirs = new Set<string>(['']);
const expandedChangedDirs = new Set<string>(['']);

let diffView: EditorView;
let editView: EditorView;

function statusClass(status: GitFileStatus): string {
  if (status === 'A' || status === '??') return 'add';
  if (status === 'D') return 'del';
  if (status === 'R') return 'ren';
  return 'mod';
}

function statusLabel(status: GitFileStatus): string {
  return status === '??' ? 'NEW' : status;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function fileMap(): Map<string, ChangedFileSummary> {
  return new Map(changedFiles.map((file) => [file.path, file]));
}

function changedSummary(path: string): ChangedFileSummary | undefined {
  return fileMap().get(path);
}

function currentEditorText(): string {
  return editView.state.doc.toString();
}

function setBanner(message = '', tone: 'info' | 'warn' | 'error' = 'info') {
  const banner = document.getElementById('banner')!;
  banner.textContent = message;
  banner.className = 'banner';
  if (message) {
    banner.classList.add('show', tone);
  }
}

function setFooterStatus(message: string) {
  const el = document.getElementById('footer-status');
  if (el) el.textContent = message;
}

function updateTimestamp() {
  const el = document.getElementById('footer-updated');
  if (el) el.textContent = 'updated ' + new Date().toLocaleTimeString();
}

function setDiffDocument(text: string) {
  diffView.setState(EditorState.create({
    doc: text || 'No diff for this file.',
    extensions: [basicSetup, EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.lineWrapping],
  }));
}

function parseChangedCurrentLines(diff: string): Map<number, 'added' | 'modified'> {
  const changedLines = new Map<number, 'added' | 'modified'>();
  let currentLine = 0;
  let pendingDeletedLines = 0;

  for (const line of diff.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      currentLine = Number.parseInt(hunk[1] ?? '0', 10);
      pendingDeletedLines = 0;
      continue;
    }

    if (line.startsWith('+++') || line.startsWith('---') || currentLine <= 0) continue;

    if (line.startsWith('+')) {
      changedLines.set(currentLine, pendingDeletedLines > 0 ? 'modified' : 'added');
      if (pendingDeletedLines > 0) pendingDeletedLines--;
      currentLine++;
    } else if (line.startsWith('-')) {
      pendingDeletedLines++;
    } else {
      pendingDeletedLines = 0;
      currentLine++;
    }
  }

  return changedLines;
}

function changedLineDecorations(changedLines: Map<number, 'added' | 'modified'>): ReturnType<typeof EditorView.decorations.of> {
  return EditorView.decorations.of((view): DecorationSet => {
    const ranges = [];
    for (const [lineNumber, kind] of changedLines) {
      if (lineNumber < 1 || lineNumber > view.state.doc.lines) continue;
      const line = view.state.doc.line(lineNumber);
      ranges.push(Decoration.line({ class: kind === 'added' ? 'git-added-line' : 'git-modified-line' }).range(line.from));
    }
    return Decoration.set(ranges, true);
  });
}

function setEditDocument(text: string, changedLines = new Map<number, 'added' | 'modified'>()) {
  editView.setState(EditorState.create({
    doc: text,
    extensions: [
      basicSetup,
      EditorView.lineWrapping,
      changedLineDecorations(changedLines),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || !currentFile?.editable) return;
        dirty = update.state.doc.toString() !== (currentFile.content ?? '');
        updateChrome();
      }),
    ],
  }));
}

function updateChrome() {
  const selected = document.getElementById('selected-path')!;
  const sub = document.getElementById('selected-sub')!;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement;
  const restoreBtn = document.getElementById('restore-btn') as HTMLButtonElement;
  const dirtyEl = document.getElementById('dirty-indicator')!;
  const diffTab = document.getElementById('tab-diff')!;
  const editTab = document.getElementById('tab-edit')!;
  const emptyView = document.getElementById('empty-view')!;
  const diffPane = document.getElementById('diff-view')!;
  const editPane = document.getElementById('edit-view')!;

  diffTab.classList.toggle('active', currentMode === 'diff');
  editTab.classList.toggle('active', currentMode === 'edit');

  const file = selectedPath ? changedSummary(selectedPath) : undefined;
  selected.textContent = selectedPath || 'Select a file';
  if (!selectedPath) {
    sub.textContent = 'Changed files default to Diff. Repository files open in Edit.';
  } else if (file) {
    sub.textContent = `${statusLabel(file.status)}  +${file.added}  -${file.removed}`;
  } else if (currentFile?.reason === 'binary') {
    sub.textContent = 'Binary file';
  } else if (currentFile?.reason === 'too_large') {
    sub.textContent = 'File is too large for in-panel editing';
  } else if (currentFile?.reason === 'deleted') {
    sub.textContent = 'Deleted in working tree';
  } else {
    sub.textContent = 'Repository file';
  }

  const canSave = currentMode === 'edit' && !!currentFile?.editable && !!selectedPath;
  saveBtn.disabled = !canSave || !dirty;
  reloadBtn.disabled = !selectedPath;
  restoreBtn.hidden = file?.status !== 'D';

  dirtyEl.textContent = dirty ? 'Unsaved changes' : '';

  emptyView.style.display = selectedPath ? 'none' : 'flex';
  diffPane.classList.toggle('active', !!selectedPath && currentMode === 'diff');
  editPane.classList.toggle('active', !!selectedPath && currentMode === 'edit');
}

function renderChangedFiles() {
  const container = document.getElementById('changed-list')!;
  const countEl = document.getElementById('changed-count')!;
  const listBtn = document.getElementById('changed-view-list') as HTMLButtonElement;
  const treeBtn = document.getElementById('changed-view-tree') as HTMLButtonElement;
  countEl.textContent = String(changedFiles.length);
  listBtn.classList.toggle('active', changedFilesView === 'list');
  treeBtn.classList.toggle('active', changedFilesView === 'tree');

  const query = searchQuery.trim().toLowerCase();
  if (changedFilesView === 'tree') {
    container.innerHTML = renderChangedFilesTree(query) || '<div class="empty">No matching changed files.</div>';
    container.querySelectorAll<HTMLElement>('[data-kind="changed-file"], [data-kind="changed-dir"]').forEach((row) => {
      row.addEventListener('click', async () => {
        const path = row.dataset.path ?? '';
        if (row.dataset.kind === 'changed-dir') {
          toggleChangedDirectory(path);
          return;
        }
        await selectPathFromUi(path, 'diff');
      });
    });
    return;
  }

  const files = changedFiles.filter((file) => !query || file.path.toLowerCase().includes(query));

  container.innerHTML = files.map((file) => `
    <div class="row${file.path === selectedPath ? ' selected' : ''}" data-path="${escapeAttr(file.path)}" data-kind="changed">
      <span class="status ${statusClass(file.status)}">${statusLabel(file.status)}</span>
      <span class="path-label" title="${escapeAttr(file.path)}">${escapeHtml(file.path)}</span>
      <span class="counts"><span class="add">+${file.added}</span> <span class="del">-${file.removed}</span></span>
    </div>
  `).join('') || '<div class="empty">No matching changed files.</div>';

  container.querySelectorAll<HTMLElement>('[data-kind="changed"]').forEach((row) => {
    row.addEventListener('click', () => {
      void selectPathFromUi(row.dataset.path ?? '', 'diff');
    });
  });
}

function buildChangedFilesTree(): ChangedTreeNode[] {
  const root: ChangedTreeNode[] = [];

  for (const file of changedFiles) {
    const parts = file.path.split('/');
    let level = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      const isFile = i === parts.length - 1;
      let node = level.find((candidate) => candidate.name === name);
      if (!node) {
        node = {
          name,
          path: currentPath,
          kind: isFile ? 'file' : 'dir',
          children: isFile ? undefined : [],
        };
        level.push(node);
      }

      if (isFile) {
        node.kind = 'file';
        node.file = file;
        node.children = undefined;
      } else {
        node.kind = 'dir';
        node.children ??= [];
        level = node.children;
      }
    }
  }

  const normalize = (nodes: ChangedTreeNode[]): ChangedTreeNode[] => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) node.children = normalize(node.children);
    }
    return nodes;
  };

  return normalize(root);
}

function changedTreeMatches(node: ChangedTreeNode, query: string): boolean {
  if (!query) return true;
  if (node.path.toLowerCase().includes(query)) return true;
  return node.children?.some((child) => changedTreeMatches(child, query)) ?? false;
}

function renderChangedFilesTreeBranch(nodes: ChangedTreeNode[], depth: number, query: string): string {
  return nodes
    .filter((node) => changedTreeMatches(node, query))
    .map((node) => {
      if (node.kind === 'dir') {
        const expanded = expandedChangedDirs.has(node.path);
        const children = expanded && node.children
          ? renderChangedFilesTreeBranch(node.children, depth + 1, query)
          : '';
        return `
          <div class="tree-row${node.path === selectedPath ? ' selected' : ''}" data-path="${escapeAttr(node.path)}" data-kind="changed-dir">
            <span class="indent" style="width:${depth * 14}px"></span>
            <span class="caret">${expanded ? '▾' : '▸'}</span>
            <span class="changed-dot"></span>
            <span class="tree-name" title="${escapeAttr(node.path)}">${escapeHtml(node.name)}</span>
          </div>
          ${children}
        `;
      }

      const file = node.file!;
      return `
        <div class="tree-row${file.path === selectedPath ? ' selected' : ''}" data-path="${escapeAttr(file.path)}" data-kind="changed-file">
          <span class="indent" style="width:${depth * 14}px"></span>
          <span class="caret"></span>
          <span class="status ${statusClass(file.status)}">${statusLabel(file.status)}</span>
          <span class="tree-name" title="${escapeAttr(file.path)}">${escapeHtml(node.name)}</span>
          <span class="counts"><span class="add">+${file.added}</span> <span class="del">-${file.removed}</span></span>
        </div>
      `;
    })
    .join('');
}

function renderChangedFilesTree(query: string): string {
  return renderChangedFilesTreeBranch(buildChangedFilesTree(), 0, query);
}

function toggleChangedDirectory(path: string) {
  if (expandedChangedDirs.has(path)) expandedChangedDirs.delete(path);
  else expandedChangedDirs.add(path);
  renderChangedFiles();
}

function branchMatches(entryPath: string, query: string): boolean {
  if (!query) return true;
  if (entryPath.toLowerCase().includes(query)) return true;
  const children = treeCache.get(entryPath);
  if (!children) return false;
  return children.some((child) => branchMatches(child.path, query));
}

function renderTreeBranch(parent: string, depth: number): string {
  const query = searchQuery.trim().toLowerCase();
  const entries = treeCache.get(parent) ?? [];
  return entries
    .filter((entry) => branchMatches(entry.path, query))
    .map((entry) => {
      const expanded = expandedDirs.has(entry.path);
      const caret = entry.kind === 'dir' ? (expanded ? '▾' : '▸') : '';
      const dot = entry.changed ? '<span class="changed-dot"></span>' : '';
      const row = `
        <div class="tree-row${entry.path === selectedPath ? ' selected' : ''}" data-path="${escapeAttr(entry.path)}" data-kind="${entry.kind}">
          <span class="indent" style="width:${depth * 14}px"></span>
          <span class="caret">${caret}</span>
          ${dot}
          <span class="tree-name" title="${escapeAttr(entry.path)}">${escapeHtml(entry.name)}</span>
        </div>
      `;

      if (entry.kind === 'dir' && expanded) {
        return row + renderTreeBranch(entry.path, depth + 1);
      }
      return row;
    })
    .join('');
}

function renderTree() {
  const container = document.getElementById('tree-list')!;
  const rootLabel = document.getElementById('repo-root-label')!;
  rootLabel.textContent = currentContext?.repoRoot.split('/').pop() ?? '';
  container.innerHTML = renderTreeBranch('', 0) || '<div class="empty">No files to show.</div>';

  container.querySelectorAll<HTMLElement>('[data-kind]').forEach((row) => {
    row.addEventListener('click', async () => {
      const targetPath = row.dataset.path ?? '';
      const kind = row.dataset.kind;
      if (kind === 'dir') {
        await toggleDirectory(targetPath);
      } else {
        await selectPathFromUi(targetPath, changedSummary(targetPath) ? 'diff' : 'edit');
      }
    });
  });
}

async function loadTree(path = '') {
  const result = await ext.request<TreeResponse>(`/review/tree?session=${encodeURIComponent(currentSession)}&path=${encodeURIComponent(path)}`);
  treeCache.set(path, result.entries);
}

async function ensureTreeLoaded(path = '') {
  if (treeCache.has(path)) return;
  await loadTree(path);
}

async function toggleDirectory(path: string) {
  if (expandedDirs.has(path)) {
    expandedDirs.delete(path);
    renderTree();
    return;
  }
  expandedDirs.add(path);
  await ensureTreeLoaded(path);
  renderTree();
}

async function maybeDiscardDirty(): Promise<boolean> {
  if (!dirty) return true;
  return window.confirm('Discard unsaved changes?');
}

async function loadDiff(force = false) {
  if (!selectedPath) return;
  if (!force && currentDiffPath === selectedPath) return;
  const result = await ext.request<DiffResponse>(`/review/diff?session=${encodeURIComponent(currentSession)}&path=${encodeURIComponent(selectedPath)}`);
  currentDiffPath = selectedPath;
  setDiffDocument(result.diff);
}

async function loadFile(force = false) {
  if (!selectedPath) return;
  if (!force && currentFile?.path === selectedPath) return;
  const result = await ext.request<FileResponse>(`/review/file?session=${encodeURIComponent(currentSession)}&path=${encodeURIComponent(selectedPath)}`);
  currentFile = result;
  currentFileChangedLines = new Map<number, 'added' | 'modified'>();
  dirty = false;

  if (!result.exists) {
    setEditDocument('');
    if (result.reason === 'deleted') {
      setBanner('This file is deleted in the working tree. Restore it or inspect the diff.', 'warn');
    } else {
      setBanner('File not found on disk.', 'error');
    }
    updateChrome();
    return;
  }

  if (!result.editable) {
    setEditDocument('');
    const message = result.reason === 'too_large'
      ? 'This file is too large for in-panel editing.'
      : 'This file looks binary and is read-only here.';
    setBanner(message, 'warn');
    updateChrome();
    return;
  }

  const diff = await ext.request<DiffResponse>(`/review/diff?session=${encodeURIComponent(currentSession)}&path=${encodeURIComponent(selectedPath)}`);
  currentFileChangedLines = parseChangedCurrentLines(diff.diff);
  setEditDocument(result.content ?? '', currentFileChangedLines);
}

async function loadCurrentView(force = false) {
  if (!selectedPath) {
    updateChrome();
    return;
  }

  setBanner('');
  if (currentMode === 'diff') {
    await loadDiff(force);
  } else {
    await loadFile(force);
  }
  updateChrome();
}

async function selectPathFromUi(path: string, preferredMode?: ViewMode) {
  if (!path) return;
  if (path !== selectedPath && !(await maybeDiscardDirty())) return;

  const changed = changedSummary(path);
  selectedPath = path;
  currentDiffPath = '';
  currentFile = null;
  currentFileChangedLines = new Map<number, 'added' | 'modified'>();
  dirty = false;
  currentMode = preferredMode ?? (changed ? 'diff' : 'edit');

  renderChangedFiles();
  renderTree();
  await loadCurrentView(true);
}

async function refreshContext(preserveSelection = true) {
  const result = await ext.request<ContextResponse>(`/review/context?session=${encodeURIComponent(currentSession)}`);
  currentContext = result.context;
  changedFiles = result.files;

  const repoLabel = document.getElementById('repo-label');
  const contextLabel = document.getElementById('context-label');
  if (repoLabel) repoLabel.textContent = result.context.github.nameWithOwner;
  if (contextLabel) {
    contextLabel.textContent = `${result.context.branch} · ${result.context.headSha.slice(0, 7)} · pane ${result.context.windowIndex}`;
  }

  await Promise.all(Array.from(expandedDirs).map((dir) => loadTree(dir)));
  renderChangedFiles();
  renderTree();
  setFooterStatus(`${result.totals.count} files · +${result.totals.added} · -${result.totals.removed}`);
  updateTimestamp();

  if (preserveSelection && selectedPath) {
    await loadCurrentView(true);
  } else {
    updateChrome();
  }
}

async function saveCurrentFile() {
  if (!currentFile?.editable || !selectedPath || !dirty) return;

  try {
    setBanner('Saving changes…', 'info');
    const result = await ext.request<{ token: string; size: number }>('/review/file/save', {
      method: 'POST',
      body: {
        session: currentSession,
        path: selectedPath,
        content: currentEditorText(),
        editToken: currentFile.token,
      },
    });
    currentFile = {
      ...currentFile,
      token: result.token,
      size: result.size,
      content: currentEditorText(),
    };
    dirty = false;
    setBanner('Saved to working tree.', 'info');
    await refreshContext(true);
    currentDiffPath = '';
    await loadDiff(true);
    updateChrome();
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (message.includes('409')) {
      setBanner('Save failed because the file changed on disk. Reload to compare against the latest version.', 'error');
    } else {
      setBanner('Save failed.', 'error');
    }
  }
}

async function reloadCurrentFile() {
  if (!selectedPath) return;
  if (!(await maybeDiscardDirty())) return;
  currentDiffPath = '';
  currentFile = null;
  currentFileChangedLines = new Map<number, 'added' | 'modified'>();
  dirty = false;
  await loadCurrentView(true);
}

async function restoreCurrentFile() {
  if (!selectedPath) return;
  if (!(await maybeDiscardDirty())) return;

  await ext.request('/review/file/restore', {
    method: 'POST',
    body: {
      session: currentSession,
      path: selectedPath,
    },
  });

  currentDiffPath = '';
  currentFile = null;
  currentFileChangedLines = new Map<number, 'added' | 'modified'>();
  dirty = false;
  setBanner('File restored from git.', 'info');
  await refreshContext(true);
}

async function switchMode(mode: ViewMode) {
  currentMode = mode;
  if (!selectedPath) {
    updateChrome();
    return;
  }
  await loadCurrentView();
}

function wireUi() {
  const diffHost = document.getElementById('diff-editor')!;
  const editHost = document.getElementById('edit-editor')!;

  diffView = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [basicSetup, EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.lineWrapping],
    }),
    parent: diffHost,
  });

  editView = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || !currentFile?.editable) return;
          dirty = update.state.doc.toString() !== (currentFile.content ?? '');
          updateChrome();
        }),
      ],
    }),
    parent: editHost,
  });

  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    if (!(await maybeDiscardDirty())) return;
    currentDiffPath = '';
    currentFile = null;
    currentFileChangedLines = new Map<number, 'added' | 'modified'>();
    dirty = false;
    await refreshContext(true);
  });
  document.getElementById('close-btn')?.addEventListener('click', () => ext.closePanel());
  document.getElementById('save-btn')?.addEventListener('click', () => { void saveCurrentFile(); });
  document.getElementById('reload-btn')?.addEventListener('click', () => { void reloadCurrentFile(); });
  document.getElementById('restore-btn')?.addEventListener('click', () => { void restoreCurrentFile(); });
  document.getElementById('tab-diff')?.addEventListener('click', () => { void switchMode('diff'); });
  document.getElementById('tab-edit')?.addEventListener('click', () => { void switchMode('edit'); });
  document.getElementById('changed-view-list')?.addEventListener('click', () => {
    changedFilesView = 'list';
    renderChangedFiles();
  });
  document.getElementById('changed-view-tree')?.addEventListener('click', () => {
    changedFilesView = 'tree';
    renderChangedFiles();
  });
  document.getElementById('file-search')?.addEventListener('input', (event) => {
    searchQuery = (event.target as HTMLInputElement).value;
    renderChangedFiles();
    renderTree();
  });

  updateChrome();
}

async function loadPanel() {
  if (!currentSession) return;
  try {
    selectedPath = '';
    currentDiffPath = '';
    currentFile = null;
    currentFileChangedLines = new Map<number, 'added' | 'modified'>();
    currentMode = 'diff';
    dirty = false;
    setBanner('');
    treeCache.clear();
    expandedDirs.clear();
    expandedDirs.add('');
    await refreshContext(false);
  } catch {
    setBanner('Failed to load review context. Open Review Files from the sidebar first.', 'error');
  }
}

ext.onContext((context) => {
  currentSession = context.session;
});

ext.onOpen(() => {
  void loadPanel();
});

document.addEventListener('DOMContentLoaded', wireUi);

ext.ready();
