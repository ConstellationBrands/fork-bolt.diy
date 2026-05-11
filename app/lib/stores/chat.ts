import { atom, map } from 'nanostores';

export const chatStore = map({
  started: false,
  aborted: false,
  showChat: true,
});

export const sidebarOpen = atom<boolean>(false);
