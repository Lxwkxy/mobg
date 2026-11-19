export type Theme = 'light' | 'dark';

// Shared by the pre-paint script in app/layout.tsx and ThemeToggle.tsx,
// so both read and write the same stored value.
export const THEME_STORAGE_KEY = 'mobg-theme';

// Runs before first paint. The saved choice wins; anything else (including
// no saved value, blocked storage, or an OS set to dark) means light.
export const THEME_INIT_SCRIPT = `(function(){var t='light';try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark')t='dark';}catch(e){}var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;})();`;
