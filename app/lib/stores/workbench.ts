import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { unreachable } from '~/utils/unreachable';
import { EditorStore } from './editor';
import { FilesStore, type FileMap } from './files';
import { PreviewsStore } from './previews';
import { TerminalStore } from './terminal';
import JSZip from 'jszip';
import fileSaver from 'file-saver';
import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';
import { path } from '~/utils/path';
import { extractRelativePath } from '~/utils/diff';
import { description, chatId } from '~/lib/persistence';
import Cookies from 'js-cookie';
import { createSampler } from '~/utils/sampler';
import type { ActionAlert } from '~/types/actions';
import { Buffer } from 'node:buffer';
import * as yaml from 'js-yaml';
import { tokenStore } from '~/lib/stores/token';

const { saveAs } = fileSaver;

export interface ArtifactState {
  id: string;
  title: string;
  type?: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'diff' | 'preview';

export class WorkbenchStore {
  #previewsStore = new PreviewsStore(webcontainer);
  #filesStore = new FilesStore(webcontainer);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(webcontainer);

  #reloadedMessages = new Set<string>();

  artifacts: Artifacts = import.meta.hot?.data.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = import.meta.hot?.data.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = import.meta.hot?.data.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = import.meta.hot?.data.unsavedFiles ?? atom(new Set<string>());
  actionAlert: WritableAtom<ActionAlert | undefined> =
    import.meta.hot?.data.unsavedFiles ?? atom<ActionAlert | undefined>(undefined);
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];
  #globalExecutionQueue = Promise.resolve();

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.actionAlert = this.actionAlert;
    }
  }

  addToExecutionQueue(callback: () => Promise<void>) {
    this.#globalExecutionQueue = this.#globalExecutionQueue.then(() => callback());
  }

  get previews() {
    return this.#previewsStore.previews;
  }

  get files() {
    return this.#filesStore.files;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#filesStore.filesCount;
  }

  get showTerminal() {
    return this.#terminalStore.showTerminal;
  }

  get boltTerminal() {
    return this.#terminalStore.boltTerminal;
  }

  get alert() {
    return this.actionAlert;
  }

  clearAlert() {
    this.actionAlert.set(undefined);
  }

  get projectName() {
    const project = (description.value ?? 'project')
      .toLocaleLowerCase()
      .replace(/[_\s:]+/g, '-')
      .substring(0, 40);
    return `${project}-${Cookies.get('userId')}`;
  }

  get description() {
    return (description.value ?? '').toLocaleLowerCase().replace(/[_\s:]+/g, '-');
  }

  get chart() {
    const files = this.files.get();

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);

        if (relativePath === 'vite.config.ts') {
          return 'vite';
        }

        if (relativePath === 'next.config.js') {
          return 'nextjs';
        }
      }
    }

    return 'vite';
  }

  toggleTerminal(value?: boolean) {
    this.#terminalStore.toggleTerminal(value);
  }

  attachTerminal(terminal: ITerminal) {
    this.#terminalStore.attachTerminal(terminal);
  }

  attachBoltTerminal(terminal: ITerminal) {
    this.#terminalStore.attachBoltTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore.onTerminalResize(cols, rows);
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files);

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = this.#filesStore.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath);
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    await this.#filesStore.saveFile(filePath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = this.#filesStore.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifcations() {
    return this.#filesStore.getFileModifications();
  }

  getModifiedFiles() {
    return this.#filesStore.getModifiedFiles();
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications();
  }

  abortAllActions() {
    // TODO: what do we wanna do and how do we wanna recover from this?
  }

  setReloadedMessages(messages: string[]) {
    this.#reloadedMessages = new Set(messages);
  }

  addArtifact({ messageId, title, id, type }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(messageId);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(messageId)) {
      this.artifactIdList.push(messageId);
    }

    this.artifacts.setKey(messageId, {
      id,
      title,
      closed: false,
      type,
      runner: new ActionRunner(
        webcontainer,
        () => this.boltTerminal,
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.actionAlert.set(alert);
        },
      ),
    });
  }

  updateArtifact({ messageId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(messageId, { ...artifact, ...state });
  }

  addAction(data: ActionCallbackData) {
    // this._addAction(data);

    this.addToExecutionQueue(() => this._addAction(data));
  }

  async _addAction(data: ActionCallbackData) {
    const { messageId } = data;

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    return artifact.runner.addAction(data);
  }

  runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    if (isStreaming) {
      this.actionStreamSampler(data, isStreaming);
    } else {
      this.addToExecutionQueue(() => this._runAction(data, isStreaming));
    }
  }

  async _runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { messageId } = data;

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    const action = artifact.runner.actions.get()[data.actionId];

    if (!action || action.executed) {
      return;
    }

    if (data.action.type === 'file') {
      const wc = await webcontainer;
      const fullPath = path.join(wc.workdir, data.action.filePath);

      if (this.selectedFile.value !== fullPath) {
        this.setSelectedFile(fullPath);
      }

      if (this.currentView.value !== 'code') {
        this.currentView.set('code');
      }

      const doc = this.#editorStore.documents.get()[fullPath];

      if (!doc) {
        await artifact.runner.runAction(data, isStreaming);
      }

      this.#editorStore.updateFile(fullPath, data.action.content);

      if (!isStreaming) {
        await artifact.runner.runAction(data);
        this.resetAllFileModifications();
      }
    } else {
      await artifact.runner.runAction(data);
    }
  }

  actionStreamSampler = createSampler(async (data: ActionCallbackData, isStreaming: boolean = false) => {
    return await this._runAction(data, isStreaming);
  }, 100); // TODO: remove this magic number to have it configurable

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }

  async downloadZip() {
    const zip = new JSZip();
    const files = this.files.get();

    // Get the project name from the description input, or use a default name
    const projectName = (description.value ?? 'project').toLocaleLowerCase().split(' ').join('_');

    // Generate a simple 6-character hash based on the current timestamp
    const timestampHash = Date.now().toString(36).slice(-6);
    const uniqueProjectName = `${projectName}_${timestampHash}`;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);

        // split the path into segments
        const pathSegments = relativePath.split('/');

        // if there's more than one segment, we need to create folders
        if (pathSegments.length > 1) {
          let currentFolder = zip;

          for (let i = 0; i < pathSegments.length - 1; i++) {
            currentFolder = currentFolder.folder(pathSegments[i])!;
          }
          currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
        } else {
          // if there's only one segment, it's a file in the root
          zip.file(relativePath, dirent.content);
        }
      }
    }

    // Generate the zip file and save it
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${uniqueProjectName}.zip`);
  }

  async generateProjectZipFile() {
    const zip = new JSZip();
    const files = this.files.get();

    // const projectName = (description.value ?? 'project').toLocaleLowerCase().split(' ').join('_');

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);

        // split the path into segments
        const pathSegments = relativePath.split('/');

        console.log(`FILEPATH: ${filePath} - RELATIVEPATH: ${relativePath}, DIRENT ${JSON.stringify(dirent)}`);

        if (!relativePath.startsWith('dist/')) {
          // if there's more than one segment, we need to create folders
          if (pathSegments.length > 1) {
            let currentFolder = zip;

            for (let i = 0; i < pathSegments.length - 1; i++) {
              currentFolder = currentFolder.folder(pathSegments[i])!;
            }
            currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
          } else {
            // if there's only one segment, it's a file in the root
            zip.file(relativePath, dirent.content);
          }
        }
      }
    }

    return await zip.generateAsync({ type: 'base64' });
  }

  async syncFiles(targetHandle: FileSystemDirectoryHandle) {
    const files = this.files.get();
    const syncedFiles = [];

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);
        const pathSegments = relativePath.split('/');
        let currentHandle = targetHandle;

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
        }

        // create or get the file
        const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1], {
          create: true,
        });

        // write the file content
        const writable = await fileHandle.createWritable();
        await writable.write(dirent.content);
        await writable.close();

        syncedFiles.push(relativePath);
      }
    }

    return syncedFiles;
  }

  async pushToGitHub(repoName: string, otherUsername: string, commitMessage?: string, githubUsername?: string) {
    try {
      // Use cookies if username and token are not provided
      const githubToken = tokenStore.value;
      const owner = githubUsername;

      if (!githubToken || !owner) {
        throw new Error('GitHub token or username is not set in cookies or provided.');
      }

      // Initialize Octokit with the auth token
      const octokit = new Octokit({ auth: githubToken });

      // Check if the repository already exists before creating it
      let repoExists = false;
      let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];
      console.log(`OWNER: ${owner}`);

      try {
        const resp = await octokit.repos.get({ owner, repo: repoName });
        repo = resp.data;
        repoExists = true;
      } catch (error) {
        if (error instanceof Error && 'status' in error && error.status === 404) {
          // Repository doesn't exist, so create a new one
          const { data: newRepo } = await octokit.repos.createInOrg({
            org: owner,
            name: repoName,
            private: true,
            auto_init: false,
          });
          repo = newRepo;

          await octokit.repos.addCollaborator({
            owner: repo.owner.login,
            repo: repo.name,
            username: otherUsername,
            permission: 'admin', // Set permission to admin
          });

          const readmeContent = '# ' + repoName + '\n\nThis is a README file for the ' + repoName + ' repository.';

          await octokit.rest.repos.createOrUpdateFileContents({
            owner: repo.owner.login,
            repo: repoName,
            path: 'README.md',
            message: 'Add README file',
            content: Buffer.from(readmeContent).toString('base64'), // Encode content to base64
            author: {
              name: 'bot-ddp',
              email: 'botl@cbrands.com',
            },
            committer: {
              name: 'bot-ddp',
              email: 'botl@cbrands.com',
            },
          });
        } else {
          console.log('cannot create repo!');
          throw error; // Some other error occurred
        }
      }

      if (repoExists) {
        alert(`Repository already exists: ${repo.html_url}`);
        throw new Error('Repository already exists!');
      }

      // Get all files
      const files = this.files.get();

      if (!files || Object.keys(files).length === 0) {
        throw new Error('No files found to push');
      }

      // Create blobs for each file
      const blobs = await Promise.all(
        Object.entries(files).map(async ([filePath, dirent]) => {
          if (dirent?.type === 'file' && dirent.content) {
            const { data: blob } = await octokit.git.createBlob({
              owner: repo.owner.login,
              repo: repo.name,
              content: Buffer.from(dirent.content).toString('base64'),
              encoding: 'base64',
            });
            return { path: extractRelativePath(filePath), sha: blob.sha };
          }

          return null;
        }),
      );

      const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

      if (validBlobs.length === 0) {
        throw new Error('No valid files to push');
      }

      // Get the latest commit SHA (assuming main branch, update dynamically if needed)
      const { data: ref } = await octokit.git.getRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
      });
      const latestCommitSha = ref.object.sha;

      // Create a new tree
      const { data: newTree } = await octokit.git.createTree({
        owner: repo.owner.login,
        repo: repo.name,
        base_tree: latestCommitSha,
        tree: validBlobs.map((blob) => ({
          path: blob!.path,
          mode: '100644',
          type: 'blob',
          sha: blob!.sha,
        })),
      });

      // Create a new commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner.login,
        repo: repo.name,
        message: commitMessage || 'Initial commit from your app',
        tree: newTree.sha,
        parents: [latestCommitSha],
        author: {
          name: 'bolt-ddp',
          email: 'botl@cbrands.com',
        },
      });

      // Update the reference
      await octokit.git.updateRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
        sha: newCommit.sha,
      });

      alert(`Repository created and code pushed: ${repo.html_url}`);
    } catch (error) {
      console.error('Error pushing to GitHub:', error);
      throw error; // Rethrow the error for further handling
    }
  }

  async pushToStageRepo(projectName: string, commitMessage: string, content: string, chart: string) {
    try {
      const githubToken = tokenStore.value;
      const owner = 'ConstellationBrands';

      console.log(`OWNER: ${owner}`);

      if (!owner) {
        throw new Error('GitHub token or username is not set in cookies or provided.');
      }

      const octokit = new Octokit({ auth: githubToken });

      let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];

      try {
        const resp = await octokit.repos.get({ owner, repo: 'stage-repo' });
        repo = resp.data;
        console.log(`REPO: ${repo}`);
      } catch (error) {
        console.log('Repo not found' + error);
        throw error;
      }

      const chartYamlData = {
        apiVersion: 'v2',
        name: projectName,
        description: 'A Helm chart for Kubernetes',
        version: '0.1.0',
        appVersion: '1.0',

        dependencies: [
          {
            name: chart,
            version: '0.1.0',
            repository: `file://../charts/${chart}`,
          },
        ],
      };

      const chartYamlString = yaml.dump(chartYamlData);

      const chartYamlBlob = await octokit.git.createBlob({
        owner: repo.owner.login,
        repo: repo.name,
        content: Buffer.from(chartYamlString).toString('base64'),
        encoding: 'base64',
      });

      const configmapYamlString = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-src
data:
  app.zip.txt: |
{{ .Files.Get "files/app.zip" | b64enc | nindent 4 }}
      `;

      // const configmapYamlString = yaml.dump(configmapYamlData);

      const configmapYamlBlob = await octokit.git.createBlob({
        owner: repo.owner.login,
        repo: repo.name,
        content: Buffer.from(configmapYamlString).toString('base64'),
        encoding: 'base64',
      });

      const zipBlob = await octokit.git.createBlob({
        owner: repo.owner.login,
        repo: repo.name,
        content,
        encoding: 'base64',
      });

      const blobs = [
        { path: `${projectName}/Chart.yaml`, sha: chartYamlBlob.data.sha },
        { path: `${projectName}/files/app.zip`, sha: zipBlob.data.sha },
        { path: `${projectName}/templates/configmap.yaml`, sha: configmapYamlBlob.data.sha },
      ];

      const validBlobs = blobs.filter(Boolean);

      if (validBlobs.length == 0) {
        throw new Error('No valid files to push');
      }

      const { data: ref } = await octokit.git.getRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
      });
      const latestCommitSha = ref.object.sha;
      console.log(`COMMIT ${latestCommitSha}`);

      // Create a new tree
      const { data: newTree } = await octokit.git.createTree({
        owner: repo.owner.login,
        repo: repo.name,
        base_tree: latestCommitSha,
        tree: validBlobs.map((blob) => ({
          path: blob!.path,
          mode: '100644',
          type: 'blob',
          sha: blob!.sha,
        })),
      });

      // Create a new commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner.login,
        repo: repo.name,
        message: commitMessage,
        tree: newTree.sha,
        parents: [latestCommitSha],
        author: {
          name: 'bolt-ddp',
          email: 'botl@cbrands.com',
        },
      });

      // Update the reference
      await octokit.git.updateRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
        sha: newCommit.sha,
      });
    } catch (error) {
      console.error('Error pushing to Github', error);
      throw error;
    }
  }

  async deployToDDP(
    repoName: string,
    branchName: string,
    tenantName: string,
    environmentName: string,
    githubUsername?: string,
    ghToken?: string,
  ) {
    this.#filesStore.clearFiles();

    try {
      // Use cookies if username and token are not provided
      const githubToken = ghToken || tokenStore.value;
      const owner = githubUsername;

      console.log(`OWNER: ${owner}`);
      console.log(`TENANT: ${tenantName}`);
      console.log(`PATH: ${environmentName}`);

      if (!githubToken || !owner) {
        throw new Error('GitHub token or username is not set in cookies or provided.');
      }

      // Initialize Octokit with the auth token
      const octokit = new Octokit({ auth: githubToken });

      let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];

      try {
        const resp = await octokit.repos.get({ owner, repo: `cd-${tenantName}` });
        repo = resp.data;
        console.log(`REPO: ${repo}`);
      } catch (error) {
        console.log('Repo not found' + error);
        throw error;
      }

      const blobDeploy = await octokit.git.createBlob({
        owner: repo.owner.login,
        repo: repo.name,
        content: Buffer.from('').toString('base64'),
        encoding: 'base64',
      });

      const blobValues = await octokit.git.createBlob({
        owner: repo.owner.login,
        repo: repo.name,
        content: Buffer.from('').toString('base64'),
        encoding: 'base64',
      });

      const blobs = [
        { path: `${repoName}/${environmentName}/${branchName}/.deploy.yaml`, sha: blobDeploy.data.sha },
        { path: `${repoName}/${environmentName}/${branchName}/values.yaml`, sha: blobValues.data.sha },
      ];

      const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

      if (validBlobs.length === 0) {
        throw new Error('No valid files to push');
      }

      // Get the latest commit SHA (assuming main branch, update dynamically if needed)
      const { data: ref } = await octokit.git.getRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
      });
      const latestCommitSha = ref.object.sha;
      console.log(`COMMIT ${latestCommitSha}`);

      // Create a new tree
      const { data: newTree } = await octokit.git.createTree({
        owner: repo.owner.login,
        repo: repo.name,
        base_tree: latestCommitSha,
        tree: validBlobs.map((blob) => ({
          path: blob!.path,
          mode: '100644',
          type: 'blob',
          sha: blob!.sha,
        })),
      });

      // Create a new commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner.login,
        repo: repo.name,
        message: `Added ${repoName} for variant ${branchName}`,
        tree: newTree.sha,
        parents: [latestCommitSha],
        author: {
          name: 'bolt-ddp',
          email: 'botl@cbrands.com',
        },
      });

      // Update the reference
      await octokit.git.updateRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
        sha: newCommit.sha,
      });
    } catch (error) {
      console.error('Error pushing to GitHub:', error);
      throw error; // Rethrow the error for further handling
    }
  }

  async removeRepoFromStage(projectName: string) {
    try {
      const githubToken = tokenStore.value;
      const owner = 'ConstellationBrands';

      if (!owner) {
        throw new Error('GitHub token or username is not set in cookies or provided.');
      }

      const octokit = new Octokit({ auth: githubToken });

      let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];

      try {
        const resp = await octokit.repos.get({ owner, repo: 'stage-repo' });
        repo = resp.data;
        console.log(`REPO: ${repo}`);
      } catch (error) {
        console.log('Repo not found' + error);
        throw error;
      }

      const blobs = [{ path: `${projectName}`, sha: null }];

      const validBlobs = blobs.filter(Boolean);

      if (validBlobs.length == 0) {
        throw new Error('No valid files to push');
      }

      const { data: ref } = await octokit.git.getRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
      });
      const latestCommitSha = ref.object.sha;
      console.log(`COMMIT ${latestCommitSha}`);

      // Create a new tree
      const { data: newTree } = await octokit.git.createTree({
        owner: repo.owner.login,
        repo: repo.name,
        base_tree: latestCommitSha,
        tree: validBlobs.map((blob) => ({
          path: blob!.path,
          mode: '100644',
          type: 'blob',
          sha: blob!.sha,
        })),
      });

      // Create a new commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner.login,
        repo: repo.name,
        message: `removed ${projectName}`,
        tree: newTree.sha,
        parents: [latestCommitSha],
        author: {
          name: 'bolt-ddp',
          email: 'botl@cbrands.com',
        },
      });

      // Update the reference
      await octokit.git.updateRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
        sha: newCommit.sha,
      });
    } catch (error) {
      console.error('Error deleting preview environment', error);
      throw error;
    }
  }
}

export const workbenchStore = new WorkbenchStore();
