const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const status = require('../plugin/commands/status');

function ago(seconds) {
  return new Date(Date.now() - (seconds * 1000)).toISOString();
}

function mockApp(paths, timestamps = {}) {
  return {
    getSelfPath: (path) => {
      if (!(path in paths)) {
        return undefined;
      }
      return {
        value: paths[path],
        timestamp: timestamps[path] || new Date().toISOString(),
      };
    },
  };
}

function handle(paths, settings = {}, timestamps = {}) {
  let sent;
  const device = {
    sendText: (text) => {
      sent = text;
      return Promise.resolve();
    },
  };
  return status.handle({ data: 'Status', from: 1 }, settings, device, mockApp(paths, timestamps))
    .then(() => sent);
}

describe('status command', () => {
  it('accepts the status message only', () => {
    assert.equal(status.accept({ data: 'status' }), true);
    assert.equal(status.accept({ data: 'Status' }), true);
    assert.equal(status.accept({ data: 'ping' }), false);
  });

  it('reports the anchor as not set without an anchor position', () => {
    return handle({
      'environment.depth.belowSurface': 4.24,
      'environment.wind.speedTrue': 6.3,
      'environment.wind.directionTrue': 4.276,
    })
      .then((sent) => {
        assert.equal(sent, 'Anchor: not set\nDepth: 4.2m\nWind: 12.2kn 245T');
      });
  });

  it('reports anchor radius, bearing and max radius when anchored', () => {
    return handle({
      'navigation.anchor.position': { latitude: 60.1, longitude: 24.9 },
      'navigation.anchor.distanceFromBow': 31.6,
      'navigation.anchor.bearingTrue': 2.53,
      'navigation.anchor.maxRadius': 40,
      'environment.depth.belowSurface': 4.24,
      'environment.wind.speedTrue': 6.3,
      'environment.wind.directionTrue': 4.276,
    })
      .then((sent) => {
        assert.equal(sent, 'Anchor: 32m 145T max 40m\nDepth: 4.2m\nWind: 12.2kn 245T');
      });
  });

  it('ignores measured values that have gone stale', () => {
    return handle({
      'navigation.anchor.position': { latitude: 60.1, longitude: 24.9 },
      'navigation.anchor.distanceFromBow': 31.6,
      'navigation.anchor.bearingTrue': 2.53,
      'navigation.anchor.maxRadius': 40,
      'environment.depth.belowSurface': 4.24,
      'environment.wind.speedTrue': 6.3,
      'environment.wind.directionTrue': 4.276,
    }, {}, {
      // Anchor was dropped hours ago, but the sensors have stopped reporting
      'navigation.anchor.position': ago(7200),
      'navigation.anchor.maxRadius': ago(7200),
      'environment.depth.belowSurface': ago(300),
      'environment.wind.speedTrue': ago(300),
      'environment.wind.directionTrue': ago(300),
    })
      .then((sent) => {
        assert.equal(sent, 'Anchor: 32m 145T max 40m\nDepth: n/a\nWind: n/a');
      });
  });

  it('uses the configured anchor radius path', () => {
    return handle({
      'navigation.anchor.position': { latitude: 60.1, longitude: 24.9 },
      'navigation.anchor.distanceFromBow': 31.6,
      'navigation.anchor.currentRadius': 25.2,
    }, {
      communications: {
        anchor_radius_path: 'navigation.anchor.currentRadius',
      },
    })
      .then((sent) => {
        assert.equal(sent, 'Anchor: 25m\nDepth: n/a\nWind: n/a');
      });
  });
});
