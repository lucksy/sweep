// Bytes as sweep prints them everywhere: 2.7G, 360M, 47K.
export function formatBytes(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes >= 10 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)}${units[i]}`
}
