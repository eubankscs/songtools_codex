import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let database: ReturnType<typeof openDatabase> | undefined;

async function createWindow() {
  database = openDatabase();
  const window = new BrowserWindow({ width: 1000, height: 700 });
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  database?.close();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
