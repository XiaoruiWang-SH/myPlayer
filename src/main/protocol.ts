import { net, protocol } from 'electron'
import { stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const URL_PREFIX = 'media://local/'
const MIME_TYPE = 'audio/mpeg'

const allowedPaths = new Set<string>()

export function allowMediaPath(path: string): void {
  allowedPaths.add(path)
}

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'media',
      privileges: {
        standard: true,
        secure: true,
        stream: true,
        supportFetchAPI: true,
        bypassCSP: true,
        corsEnabled: true
      }
    }
  ])
}

export function setupMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    if (!request.url.startsWith(URL_PREFIX)) {
      return new Response('Bad media URL', { status: 400 })
    }
    const path = decodeURIComponent(request.url.slice(URL_PREFIX.length))
    if (!allowedPaths.has(path)) {
      return new Response('Path not allowed', { status: 403 })
    }
    try {
      const { size } = await stat(path)
      const rangeHeader = request.headers.get('range')

      const sliceHeaders: Record<string, string> = {}
      let start = 0
      let end = size - 1
      if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
        if (!match) return new Response('Bad range', { status: 416 })
        if (match[1] === '' && match[2] !== '') {
          const suffixLength = Number(match[2])
          start = Math.max(size - suffixLength, 0)
        } else {
          start = Number(match[1] || 0)
          if (match[2] !== '') end = Number(match[2])
        }
        if (start >= size || start > end) {
          return new Response('Range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` }
          })
        }
        end = Math.min(end, size - 1)
        sliceHeaders['Range'] = `bytes=${start}-${end}`
      }

      const upstream = await net.fetch(pathToFileURL(path).toString(), {
        headers: sliceHeaders
      })
      if (!upstream.body) return new Response('Empty file', { status: 500 })

      if (!rangeHeader) {
        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type': MIME_TYPE,
            'Content-Length': String(size),
            'Accept-Ranges': 'bytes'
          }
        })
      }

      return new Response(upstream.body, {
        status: 206,
        headers: {
          'Content-Type': MIME_TYPE,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes'
        }
      })
    } catch {
      return new Response('File error', { status: 500 })
    }
  })
}
