import {prepareUIShell} from './ui-shell.js';

window.PRAMAN_UI_SHELL=prepareUIShell();
await import('./flat-main.js');
