import { useState } from 'react';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { DeployToDDP } from '~/components/@settings/tabs/connections/components/DeployToDDP';

export function useDDPDeploy() {
  const [isDeployToDDPDialogOpen, setIsDeployToDDPDialogOpen] = useState(false);

  const handleDDPDeploy = async () => {
    setIsDeployToDDPDialogOpen(true);
    return Promise.resolve();
  };

  return {
    handleDDPDeploy,
    DDPDeployDialog: (
      <>
        {isDeployToDDPDialogOpen && (
          <DeployToDDP
            isOpen={isDeployToDDPDialogOpen}
            onClose={() => setIsDeployToDDPDialogOpen(false)}
            onPush={async (
              repoName,
              branchName,
              tenantName,
              environmentName,
              org,
              token,
              setShowSuccessDialog,
              setIsLoading,
            ) => {
              try {
                async function retryDeployToDDP(
                  retries: number = 10,
                  delay: number = 10000,
                ): Promise<string | undefined> {
                  try {
                    setIsLoading?.(true);
                    await workbenchStore.deployToDDP(repoName, branchName, tenantName, environmentName, org, token);
                    console.log('Success on DeployToDDP');
                    setShowSuccessDialog?.(true);

                    return `https://github.com/${org}/${repoName}`;
                  } catch (error) {
                    if (retries > 0) {
                      setIsLoading?.(true);
                      console.error(`Error deploying to DDP, retrying in ${delay}ms...`, error);
                      setTimeout(() => retryDeployToDDP(retries - 1, delay), delay);

                      return undefined;
                    } else {
                      console.error('Failed to deploy to DDP after multiple retries:', error);
                      toast.error('Failed to deploy to DDP');
                      setIsLoading?.(false);

                      return undefined;
                    }
                  }
                }

                const repoUrl = await retryDeployToDDP();

                return repoUrl || '';
              } catch (error) {
                console.error(error);
                toast.error('Failed to push to Github');
                throw error;
              }
            }}
          />
        )}
      </>
    ),
  };
}
