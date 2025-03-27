import * as Dialog from '@radix-ui/react-dialog';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { getLocalStorage } from '~/lib/persistence';
import { classNames } from '~/utils/classNames';
import type { GitHubUserResponse } from '~/types/GitHub';
import { logStore } from '~/lib/stores/logs';
import { workbenchStore } from '~/lib/stores/workbench';
import { extractRelativePath } from '~/utils/diff';
import { formatSize } from '~/utils/formatSize';
import type { FileMap, File } from '~/lib/stores/files';
import { Octokit } from '@octokit/rest';
import { connectionStore } from "~/lib/stores/connection";

interface PushToGitHubDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPush: (repoName: string) => Promise<string>;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  updated_at: string;
  language: string;
  private: boolean;
}

export function PushToGitHubDialog({ isOpen, onClose, onPush }: PushToGitHubDialogProps) {
  const [repoName, setRepoName] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<GitHubUserResponse | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdRepoUrl, setCreatedRepoUrl] = useState('');
  const [pushedFiles, setPushedFiles] = useState<{ path: string; size: number }[]>([]);

  // Load GitHub connection on mount
  useEffect(() => {
    if (isOpen) {
      const connection = connectionStore.value;

      if (connection?.user && connection?.token) {
        setUser(connection.user);

      }
    }
  }, [isOpen]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const connection = connectionStore.value;

    if (!connection?.token || !connection?.user) {
      toast.error('Please connect your GitHub account in Settings > Connections first');
      return;
    }

    if (!repoName.trim()) {
      toast.error('Repository name is required');
      return;
    }

    setIsLoading(true);

    try {
      // Check if repository exists first
      const octokit = new Octokit({ auth: connection.token });

      try {
        await octokit.repos.get({
          owner: connection.user.login,
          repo: repoName,
        });

        // If we get here, the repo exists
        const confirmOverwrite = window.confirm(
          `Repository "${repoName}" already exists. Do you want to update it? This will add or modify files in the repository.`,
        );

        if (!confirmOverwrite) {
          setIsLoading(false);
          return;
        }
      } catch (error) {
        // 404 means repo doesn't exist, which is what we want for new repos
        if (error instanceof Error && 'status' in error && error.status !== 404) {
          throw error;
        }
      }

      const repoUrl = await onPush(repoName);
      setCreatedRepoUrl(repoUrl);

      // Get list of pushed files
      const files = workbenchStore.files.get();
      const filesList = Object.entries(files as FileMap)
        .filter(([, dirent]) => dirent?.type === 'file' && !dirent.isBinary)
        .map(([path, dirent]) => ({
          path: extractRelativePath(path),
          size: new TextEncoder().encode((dirent as File).content || '').length,
        }));

      setPushedFiles(filesList);
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error pushing to GitHub:', error);
      toast.error('Failed to push to GitHub. Please check your repository name and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setRepoName('');
    setShowSuccessDialog(false);
    setCreatedRepoUrl('');
    onClose();
  };

  // Success Dialog
  if (showSuccessDialog) {
    return (
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
          <div className="fixed inset-0 flex items-center justify-center z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[90vw] md:w-[600px] max-h-[85vh] overflow-y-auto"
            >
              <Dialog.Content className="bg-white dark:bg-[#1E1E1E] rounded-lg border border-[#E5E5E5] dark:border-[#333333] shadow-xl">
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-500">
                      <div className="i-ph:check-circle w-5 h-5" />
                      <h3 className="text-lg font-medium">Successfully pushed to GitHub</h3>
                    </div>
                    <Dialog.Close
                      onClick={handleClose}
                      className="p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                    >
                      <div className="i-ph:x w-5 h-5" />
                    </Dialog.Close>
                  </div>

                  <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg p-3 text-left">
                    <p className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark mb-2">
                      Repository URL
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm bg-bolt-elements-background dark:bg-bolt-elements-background-dark px-3 py-2 rounded border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark font-mono">
                        {createdRepoUrl}
                      </code>
                      <motion.button
                        onClick={() => {
                          navigator.clipboard.writeText(createdRepoUrl);
                          toast.success('URL copied to clipboard');
                        }}
                        className="p-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary dark:text-bolt-elements-textSecondary-dark dark:hover:text-bolt-elements-textPrimary-dark"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <div className="i-ph:copy w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>

                  <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg p-3">
                    <p className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark mb-2">
                      Pushed Files ({pushedFiles.length})
                    </p>
                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                      {pushedFiles.map((file) => (
                        <div
                          key={file.path}
                          className="flex items-center justify-between py-1 text-sm text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark"
                        >
                          <span className="font-mono truncate flex-1">{file.path}</span>
                          <span className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark ml-2">
                            {formatSize(file.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <motion.a
                      href={createdRepoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-600 text-sm inline-flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="i-ph:github-logo w-4 h-4" />
                      View Repository
                    </motion.a>
                    <motion.button
                      onClick={() => {
                        navigator.clipboard.writeText(createdRepoUrl);
                        toast.success('URL copied to clipboard');
                      }}
                      className="px-4 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 hover:bg-[#E5E5E5] dark:hover:bg-[#252525] text-sm inline-flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="i-ph:copy w-4 h-4" />
                      Copy URL
                    </motion.button>
                    <motion.button
                      onClick={handleClose}
                      className="px-4 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 hover:bg-[#E5E5E5] dark:hover:bg-[#252525] text-sm"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Close
                    </motion.button>
                  </div>
                </div>
              </Dialog.Content>
            </motion.div>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  if (!user) {
    return (
      <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
          <div className="fixed inset-0 flex items-center justify-center z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[90vw] md:w-[500px]"
            >
              <Dialog.Content className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A] shadow-xl">
                <div className="text-center space-y-4">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="mx-auto w-12 h-12 rounded-xl bg-bolt-elements-background-depth-3 flex items-center justify-center text-purple-500"
                  >
                    <div className="i-ph:github-logo w-6 h-6" />
                  </motion.div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">GitHub Connection Required</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Please connect your GitHub account in Settings {'>'} Connections to push your code to GitHub.
                  </p>
                  <motion.button
                    className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600 inline-flex items-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleClose}
                  >
                    <div className="i-ph:x-circle" />
                    Close
                  </motion.button>
                </div>
              </Dialog.Content>
            </motion.div>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
        <div className="fixed inset-0 flex items-center justify-center z-[9999]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-[90vw] md:w-[500px]"
          >
            <Dialog.Content className="bg-white dark:bg-[#0A0A0A] rounded-lg border border-[#E5E5E5] dark:border-[#1A1A1A] shadow-xl">
              <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="w-10 h-10 rounded-xl bg-bolt-elements-background-depth-3 flex items-center justify-center text-purple-500"
                  >
                    <div className="i-ph:git-branch w-5 h-5" />
                  </motion.div>
                  <div>
                    <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                      Push to GitHub
                    </Dialog.Title>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Push your code to a new or existing GitHub repository
                    </p>
                  </div>
                  <Dialog.Close
                    className="ml-auto p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                    onClick={handleClose}
                  >
                    <div className="i-ph:x w-5 h-5" />
                  </Dialog.Close>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="repoName" className="text-sm text-gray-600 dark:text-gray-400">
                      Repository Name
                    </label>
                    <input
                      id="repoName"
                      type="text"
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value.toLocaleLowerCase().replace(/[_\s:]+/g, '-'))}
                      placeholder="my-awesome-project"
                      className="w-full px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-[#E5E5E5] dark:border-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="githuUsername" className="text-sm text-gray-600 dark:text-gray-400">
                      Github Username
                    </label>
                    <input
                      id="githubUsername"
                      type="text"
                      value={githubUsername}
                      onChange={(e) => setRepoName(e.target.value.toLocaleLowerCase().replace(/[_\s:]+/g, '-'))}
                      className="w-full px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-[#E5E5E5] dark:border-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400"
                      required
                    />
                  </div>

                  <div className="pt-4 flex gap-2">
                    <motion.button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#1A1A1A] text-gray-600 dark:text-gray-400 hover:bg-[#E5E5E5] dark:hover:bg-[#252525] text-sm"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="submit"
                      disabled={isLoading}
                      className={classNames(
                        'flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm inline-flex items-center justify-center gap-2',
                        isLoading ? 'opacity-50 cursor-not-allowed' : '',
                      )}
                      whileHover={!isLoading ? { scale: 1.02 } : {}}
                      whileTap={!isLoading ? { scale: 0.98 } : {}}
                    >
                      {isLoading ? (
                        <>
                          <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
                          Pushing...
                        </>
                      ) : (
                        <>
                          <div className="i-ph:git-branch w-4 h-4" />
                          Push to GitHub
                        </>
                      )}
                    </motion.button>
                  </div>
                </form>
              </div>
            </Dialog.Content>
          </motion.div>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
