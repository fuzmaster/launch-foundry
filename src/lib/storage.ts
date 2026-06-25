export function loadState<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(key);return raw?(JSON.parse(raw) as T):fallback;}catch{return fallback;}}
export function saveState<T>(key:string,value:T){try{localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new CustomEvent("lf-storage-changed",{detail:{key}}));}catch{}}
