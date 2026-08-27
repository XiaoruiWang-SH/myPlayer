const TOAST_DURATION_MS = 2500

export function showToast(message: string): void {
  let container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    document.body.appendChild(container)
  }
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => {
    toast.classList.add('fade-out')
    toast.addEventListener('transitionend', () => toast.remove(), { once: true })
    setTimeout(() => toast.remove(), 500)
  }, TOAST_DURATION_MS)
}
