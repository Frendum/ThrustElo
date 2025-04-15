import { screen } from 'electron';
import settings from 'electron-settings';

export const windowStateKeeper = async (windowName) => {
  let window, windowState;

  const setBounds = async () => {
    if (await settings.has(`windowState.${windowName}`)) {
      windowState = await settings.get(`windowState.${windowName}`);
      const screens = screen.getAllDisplays()
        .find(screen => 
          screen.workArea.x <= windowState.x &&
          screen.workArea.x + screen.workArea.width > windowState.x &&
          screen.workArea.y <= windowState.y &&
          screen.workArea.y + screen.workArea.height > windowState.y
        );
      if(screens) {
        return;
      }
    }

    const size = screen.getPrimaryDisplay().workAreaSize;

    windowState = {
      x: undefined,
      y: undefined,
      width: size.width / 2,
      height: size.height / 2,
    };
  };

  const saveState = async () => {
    console.log('Saving state');
    windowState.isMaximized = window.isMaximized();
    if (!windowState.isMaximized) {
      windowState = window.getBounds();
    }
    await settings.set(`windowState.${windowName}`, windowState);
  };

  var debouncetime = {}
  const debounce = () => {
    clearTimeout(debouncetime);
    debouncetime = setTimeout(() => {
      saveState();
    }, 1000);
  };

  const track = async (win) => {
    window = win;
    ['resize', 'move', 'close'].forEach((event) => {
      win.on(event, debounce);
    });
  };

  await setBounds();

  return {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    isMaximized: windowState.isMaximized,
    track,
  };
};
