// Round H-8 — browser-native TTS via SpeechSynthesis. No API keys, no
// network calls. Honors the prefs.voiceEnabled toggle.

let lastUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  // Cancel anything we said before so step changes don't pile up.
  if (lastUtterance) window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.0;
  u.pitch = 1.0;
  u.volume = 1.0;
  // Prefer a clear English voice if the browser ships multiple.
  const voices = window.speechSynthesis.getVoices();
  const english = voices.find(v => /en[-_]US|en[-_]GB/i.test(v.lang)) ?? voices[0];
  if (english) u.voice = english;
  lastUtterance = u;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  lastUtterance = null;
}

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
