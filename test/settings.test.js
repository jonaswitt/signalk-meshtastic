const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { environmentMetricsInterval, anchorRadiusPath } = require('../plugin/settings');

describe('environment metrics interval', () => {
  it('defaults to every four minutes', () => {
    assert.equal(environmentMetricsInterval({}), 240);
    assert.equal(environmentMetricsInterval({ communications: {} }), 240);
  });

  it('uses the configured interval', () => {
    assert.equal(environmentMetricsInterval({
      communications: { environment_metrics_interval: 900 },
    }), 900);
  });

  it('treats zero as disabled', () => {
    assert.equal(environmentMetricsInterval({
      communications: { environment_metrics_interval: 0 },
    }), 0);
  });

  it('keeps sending disabled for configurations using the old boolean', () => {
    assert.equal(environmentMetricsInterval({
      communications: { send_environment_metrics: false },
    }), 0);
    assert.equal(environmentMetricsInterval({
      communications: { send_environment_metrics: true },
    }), 240);
  });

  it('prefers the interval over the boolean it replaced', () => {
    assert.equal(environmentMetricsInterval({
      communications: {
        send_environment_metrics: false,
        environment_metrics_interval: 60,
      },
    }), 60);
  });
});

describe('anchor radius path', () => {
  it('defaults to the distance from bow', () => {
    assert.equal(anchorRadiusPath({}), 'navigation.anchor.distanceFromBow');
  });

  it('uses the configured path', () => {
    assert.equal(anchorRadiusPath({
      communications: { anchor_radius_path: 'navigation.anchor.currentRadius' },
    }), 'navigation.anchor.currentRadius');
  });
});
