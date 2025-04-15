import * as Dialog from '@radix-ui/react-dialog';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { getLocalStorage } from '~/lib/persistence';
import { classNames } from '~/utils/classNames';
import type { GitHubUserResponse } from '~/types/GitHub';

interface DeployToDDPDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPush: (
    repoName: string,
    branchName: string,
    tenantName: string,
    environmentName: string,
    org?: string,
    token?: string,
    setShowSuccessDialog?: (showSuccessDialog: boolean) => void,
    setIsLoading?: (isLoading: boolean) => void,
  ) => Promise<string>;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function DeployToDDP({ isOpen, onClose, onPush }: DeployToDDPDialogProps) {
  const [repoName, setRepoName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [tenantName, setTenantName] = useState('sales');
  const [environmentName, setEnvironmentName] = useState('prod');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<GitHubUserResponse | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  // Load GitHub connection on mount
  useEffect(() => {
    if (isOpen) {
      const connection = getLocalStorage('github_connection');

      if (connection?.user && connection?.token) {
        setUser(connection.user);
      }
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const connection = getLocalStorage('github_connection');

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
      /*
       * Check if repository exists first
       * await onPush(repoName, branchName, tenantName, environmentName, 'ConstellationBrands', connection.token);
       */
      const org = 'ConstellationBrands';
      await onPush(
        repoName,
        branchName,
        tenantName,
        environmentName,
        org,
        connection.token,
        setShowSuccessDialog,
        setIsLoading,
      );

      // setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error pushing to GitHub:', error);
      toast.error('Failed to push to GitHub. Please check your repository name and try again.');
    } finally {
      console.log('HERE');

      // setIsLoading(false);
    }
  };

  const handleClose = () => {
    setRepoName('');
    setBranchName('');
    setTenantName('genai');
    setEnvironmentName('prod');
    setShowSuccessDialog(false);
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
                      <h3 className="text-lg font-medium">Successfully deployed</h3>
                    </div>
                    <Dialog.Close
                      onClick={handleClose}
                      className="p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                    >
                      <div className="i-ph:x w-5 h-5" />
                    </Dialog.Close>
                  </div>

                  <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg p-3">
                    <p className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark mb-2">
                      Application added to cd-{tenantName}
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <motion.a
                      href={`https://github.com/ConstellationBrands/cd-${tenantName}`}
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
                    <div className="i-ph:rocket-launch w-5 h-5" />
                  </motion.div>
                  <div>
                    <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                      Deploy To DDP
                    </Dialog.Title>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Deploy an existing repo to DDP</p>
                  </div>
                  <Dialog.Close
                    className="ml-auto p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                    onClick={handleClose}
                  >
                    <div className="i-ph:x w-5 h-5" />
                  </Dialog.Close>
                </div>

                {/*<div className="flex items-center gap-3 mb-6 p-3 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 rounded-lg">*/}
                {/*  <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full" />*/}
                {/*  <div>*/}
                {/*    <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name || user.login}</p>*/}
                {/*    <p className="text-sm text-gray-500 dark:text-gray-400">@{user.login}</p>*/}
                {/*  </div>*/}
                {/*</div>*/}

                <div className="bg-yellow-100 border border-yellow-300 rounded-md p-4 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="i-ph:warning-circle text-yellow-500 w-5 h-5" />
                    <p className="text-sm text-yellow-700">Deploying to DDP will erase your preview environment</p>
                  </div>
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
                    <label htmlFor="branchName" className="text-sm text-gray-600 dark:text-gray-400">
                      Variant Name
                    </label>
                    <input
                      id="branchName"
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="main"
                      className="w-full px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-[#E5E5E5] dark:border-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="environmentName" className="text-sm text-gray-600 dark:text-gray-400">
                      Environment
                    </label>
                    <select
                      id="environmentName"
                      value={environmentName}
                      onChange={(e) => setEnvironmentName(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-[#E5E5E5] dark:border-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400"
                      required
                    >
                      <option value="prod">Production</option>
                      <option value="nonprod">Non Production</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="tenantName" className="text-sm text-gray-600 dark:text-gray-400">
                      Tenant Name
                    </label>
                    <select
                      id="tenantName"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3 border border-[#E5E5E5] dark:border-[#1A1A1A] text-gray-900 dark:text-white placeholder-gray-400"
                      required
                    >
                      <option value="genai">Genai</option>
                      <option value="sandbox">Sandbox</option>
                    </select>
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
                          Deploying...
                        </>
                      ) : (
                        <>
                          <div className="i-ph:rocket-launch w-4 h-4" />
                          Deploy
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
