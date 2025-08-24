import { commands } from '../bindings/tauri-plugins/window-pass-through-on-hover'

export async function startClickThrough() {
  try {
    const result = await commands.startPassThrough()
    if (result.status === 'error') {
      console.error('Failed to start click through:', result.error)
      return false
    }
    return true
  }
  catch (error) {
    console.error('Error starting click through:', error)
    return false
  }
}

export async function stopClickThrough() {
  try {
    const result = await commands.stopPassThrough()
    if (result.status === 'error') {
      console.error('Failed to stop click through:', result.error)
      return false
    }
    return true
  }
  catch (error) {
    console.error('Error stopping click through:', error)
    return false
  }
}
