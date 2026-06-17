// "App mode" = the portal launched as an installed PWA (standalone) or via the
// ?app=1 entry the manifest start_url uses. We persist it so a checker who taps
// the home-screen icon stays in the focused app experience. Used to scope a
// shorter idle timeout and the focused app shell.
export function isAppMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (new URLSearchParams(window.location.search).get('app') === '1') {
      localStorage.setItem('ktc_app_mode', '1')
      return true
    }
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true
    return localStorage.getItem('ktc_app_mode') === '1'
  } catch {
    return false
  }
}
