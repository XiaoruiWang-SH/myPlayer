export function comboFromEvent(event: { metaKey: boolean; code: string }): string {
  return event.metaKey ? `Meta+${event.code}` : event.code
}
