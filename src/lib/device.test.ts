import { describe, expect, it } from 'vitest'
import { deviceName } from './device'

describe('deviceName', () => {
  it('names the kind of device from the browser', () => {
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('iPhone')
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('Mac')
    // iPadOS says it is a Mac, but has a touch screen.
    expect(deviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('iPad')
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0)', 0)).toBe('Windows PC')
    expect(deviceName('curl/8', 0)).toBe('another device')
  })
})
