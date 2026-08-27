import { Player } from './player'
import { initPlayerBar } from './ui/player-bar'

const player = new Player()
initPlayerBar(player)

const openBtn = document.getElementById('open-file-btn') as HTMLButtonElement
const hint = document.getElementById('playlist-hint') as HTMLElement

openBtn.addEventListener('click', async () => {
  const paths = await window.myPlayer.openFiles()
  if (paths.length === 0) return
  try {
    await player.load(paths[0])
    await player.play()
    hint.textContent = paths[0].split('/').pop() ?? ''
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : '加载失败'
  }
})
