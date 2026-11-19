/** Saves a file through the browser's download. */
export function saveFile(name: string, contents: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
