import { atom } from 'nanostores';
import type { GitHubConnection } from '~/types/GitHub';

export const connectionStore = atom<GitHubConnection>({
  user: null,
  token: '',
  tokenType: 'classic',
});
