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

function historyApp(rows, to) {
  return {
    selfContext: 'vessels.urn:mrn:imo:mmsi:218028390',
    getHistoryApi: () => Promise.resolve({
      getValues: (query) => {
        assert.equal(query.context, 'vessels.urn:mrn:imo:mmsi:218028390');
        assert.equal(query.duration.total('minutes'), 10);
        assert.equal(query.resolution, 1);
        assert.deepEqual(query.pathSpecs.map((spec) => spec.aggregate), ['max', 'average']);
        return Promise.resolve({
          range: { from: '2026-09-02T02:40:00.000Z', to: to || '2026-09-02T02:50:00.000Z' },
          data: rows,
        });
      },
    }),
  };
}

function handle(paths, settings = {}, timestamps = {}, history = {}) {
  let sent;
  const device = {
    sendText: (text) => {
      sent = text;
      return Promise.resolve();
    },
  };
  const app = Object.assign(mockApp(paths, timestamps), history);
  return status.handle({ data: 'Status', from: 1 }, settings, device, app)
    .then(() => sent);
}

describe('status command', () => {
  it('accepts the status message only', () => {
    assert.equal(status.accept({ data: 'status' }), true);
    assert.equal(status.accept({ data: 'Status' }), true);
    assert.equal(status.accept({ data: 'ping' }), false);
  });

  it('reports the anchor as not set without an anchor position', () => handle({
    'environment.depth.belowSurface': 4.24,
    'environment.wind.speedTrue': 6.3,
    'environment.wind.directionTrue': 4.276,
  })
    .then((sent) => {
      assert.equal(sent, 'Anchor: not set\nDepth: 4.2m\nWind: 12.2kn 245T');
    }));

  it('reports anchor radius, bearing and max radius when anchored', () => handle({
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
    }));

  it('ignores measured values that have gone stale', () => handle({
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
    }));

  it('uses the configured anchor radius path', () => handle({
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
    }));
});

describe('status command wind history', () => {
  const wind = {
    'environment.wind.speedTrue': 6.3,
    'environment.wind.directionTrue': 4.276,
  };

  // Rows are [timestamp, max, average] per one second bucket, oldest first
  const rows = [
    ['2026-09-02T02:41:00.000Z', 12.0, 12.0],
    ['2026-09-02T02:45:00.000Z', 2.0, 2.0],
    // The last minute of the window, ending at 02:50:00
    ['2026-09-02T02:49:10.000Z', 5.0, 5.0],
    ['2026-09-02T02:49:30.000Z', 7.0, 7.0],
    ['2026-09-02T02:49:50.000Z', 6.0, 6.0],
  ];

  it('summarises the trailing minute and the whole window', () => handle(wind, {}, {}, historyApp(rows))
    .then((sent) => {
      assert.equal(sent, [
        'Anchor: not set',
        'Depth: n/a',
        'Wind: 12.2kn 245T',
        // Last 60s: avg of 5, 7, 6 = 6.0 m/s, max 7.0 m/s
        'Wind 1m: avg 11.7 max 13.6kn',
        // Whole window: avg of all five = 6.4 m/s, max 12.0 m/s
        'Wind 10m: avg 12.4 max 23.3kn',
      ].join('\n'));
    }));

  it('cuts the trailing minute by timestamp, not by bucket', () => handle(wind, {}, {}, historyApp(rows, '2026-09-02T02:50:30.000Z'))
    .then((sent) => {
      // The window now ends at 02:50:30, leaving the 02:49:10 row outside the
      // trailing minute: avg of 7, 6 = 6.5 m/s, max 7.0 m/s
      assert.ok(sent.includes('Wind 1m: avg 12.6 max 13.6kn'), sent);
    }));

  it('drops the minute line when the wind data stopped over a minute ago', () => handle(wind, {}, {}, historyApp(rows, '2026-09-02T02:55:00.000Z'))
    .then((sent) => {
      assert.equal(sent, [
        'Anchor: not set',
        'Depth: n/a',
        'Wind: 12.2kn 245T',
        'Wind 10m: avg 12.4 max 23.3kn',
      ].join('\n'));
    }));

  it('skips history on a server without the history API', () => handle(wind)
    .then((sent) => {
      assert.equal(sent, 'Anchor: not set\nDepth: n/a\nWind: 12.2kn 245T');
    }));

  it('skips history when no provider is configured', () => handle(wind, {}, {}, {
    getHistoryApi: () => Promise.reject(new Error('No history api provider configured')),
  })
    .then((sent) => {
      assert.equal(sent, 'Anchor: not set\nDepth: n/a\nWind: 12.2kn 245T');
    }));

  it('skips history when the provider returns no usable rows', () => handle(wind, {}, {}, historyApp([
    ['2026-09-02T02:45:00.000Z', null, null],
  ]))
    .then((sent) => {
      assert.equal(sent, 'Anchor: not set\nDepth: n/a\nWind: 12.2kn 245T');
    }));
});
