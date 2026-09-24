import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'

/**
 * Mount the plugin on a minimal fake cordis context and capture the handlers
 * it registers on the web server. Exercises the apply() surface (routes,
 * effects) without a real kernel.
 */
async function mountedApi(config = {}) {
  const registered = []
  const ctx = {
    on: () => () => {},
    effect: fn => { fn() },
    logger: { warn: () => {}, error: () => {} },
    sessions: { list: () => [] },
    webServer: { register: entry => registered.push(entry) },
  }
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-host-trust-'))
  apply(ctx, { dataFile: join(directory, 'state.json'), ...config })
  const apiEntry = registered.find(entry => entry.path === '/synapse/api' && entry.kind === 'prefix')
  assert.ok(apiEntry !== undefined, 'the /synapse/api prefix route is registered')
  return apiEntry.handler
}

function requestFor(host, path = '/synapse/api/definitely-not-a-route') {
  return { method: 'GET', url: path, headers: host === null ? {} : { host } }
}

function captureResponse() {
  const response = { status: 0, body: '' }
  response.writeHead = (status, headers) => { response.status = status; response.headers = headers }
  response.end = body => { response.body = body === undefined ? '' : String(body) }
  return response
}

test('the /synapse host fence trusts localhost and rejects unknown authorities', async () => {
  const api = await mountedApi()
  const local = captureResponse()
  await api(requestFor('localhost:3210'), local)
  assert.equal(local.status, 404, 'localhost passes the fence (404 = past it, unknown route)')

  const loopback = captureResponse()
  await api(requestFor('127.0.0.1:3210'), loopback)
  assert.equal(loopback.status, 404)

  const evil = captureResponse()
  await api(requestFor('evil.example'), evil)
  assert.equal(evil.status, 403)
  assert.deepEqual(JSON.parse(evil.body), { error: '不被信任的 Host' })
})

test('trustedHosts entries match with or without a port suffix', async () => {
  const api = await mountedApi({ trustedHosts: ['MyHost:8080', 'lan.example'] })
  // Documented form "主机:端口" must pass: both sides compare port-less.
  const withPort = captureResponse()
  await api(requestFor('myhost:8080'), withPort)
  assert.equal(withPort.status, 404, 'host:port entries must not be dead configuration')

  const bare = captureResponse()
  await api(requestFor('lan.example'), bare)
  assert.equal(bare.status, 404)

  const missing = captureResponse()
  await api(requestFor(null), missing)
  assert.equal(missing.status, 403, 'a missing Host header is never trusted')
})

test('static assets and the html page are registered on the web server', async () => {
  const registered = []
  const ctx = {
    on: () => () => {},
    effect: fn => { fn() },
    logger: { warn: () => {}, error: () => {} },
    sessions: { list: () => [] },
    webServer: { register: entry => registered.push(entry) },
  }
  const directory = await mkdtemp(join(tmpdir(), 'dsh-synapse-routes-'))
  apply(ctx, { dataFile: join(directory, 'state.json') })
  const paths = registered.map(entry => entry.path)
  for (const path of ['/synapse', '/synapse/', '/synapse/app.js', '/synapse/styles.css', '/synapse/deepseek-mark.svg', '/synapse/api']) {
    assert.ok(paths.includes(path), `${path} is registered`)
  }
})
